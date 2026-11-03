import { db, nowIso, transaction } from "../db.ts";
import { newId } from "../lib/crypto.ts";
import { geocodeAddress } from "../lib/geocode.ts";
import { ListingData } from "./ListingData.ts";
import type { ListingFilter, ListingSort } from "./ListingData.ts";
import { PhotoData } from "./PhotoData.ts";
import { PricingData } from "./PricingData.ts";
import { RoomDetails } from "./RoomDetails.ts";

export type SubmitListingInput = {
  ownerId: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  monthlyRent: number;
  availableFrom: string;
  availableTo: string;
  utilitiesIncluded: boolean;
  deposit: number;
  bedrooms: number;
  bathrooms: number;
  maxRoommates: number;
  petsAllowed: boolean;
  furnished: boolean;
  privateBath: boolean;
  amenities: string[];
  photoDataUrls: string[];
  photoUrls?: string[];
  status?: string;
};

type DecodedPhoto = { bytes: Buffer; ext: string };

export type OperationStatus = {
  ok: boolean;
  message: string;
  problems: string[];
  listing: ListingData | null;
};

/**
 * ListingManager
 *   - listing : ListingData
 *   - operationStatus : String
 *   + ValidateListing() + SubmitListing() + RetrieveListing()
 *   + UpdateListing()   + DeleteListing()
 *
 * The single entry point the API routes use for listing lifecycle work, so all
 * validation, geocoding and persistence rules live in one place.
 */
/** One cap, enforced by every path that can add a photo. */
export const MAX_PHOTOS_PER_LISTING = 10;

export class ListingManager {
  listing: ListingData | null = null;
  operationStatus = "idle";

  /**
   * Writes the decoded photos and stores the listing as one unit.
   *
   * The files are not part of the SQLite transaction, so if the write fails
   * anywhere the files already on disk are removed by hand — otherwise a
   * failed save leaves images nothing references.
   */
  private storeWithPhotos(listing: ListingData, decoded: DecodedPhoto[]): void {
    const written: PhotoData[] = [];
    try {
      transaction(() => {
        const start = listing.photoData.length;
        decoded.forEach((photo, i) => {
          written.push(PhotoData.persist(listing.listingId, photo, start + i));
        });
        listing.photoData.push(...written);
        listing.storeData();
      });
    } catch (err) {
      for (const photo of written) PhotoData.discardFile(photo.fileUrl);
      throw err;
    }
  }

  /* ------------------------------------------------------- ValidateListing */

  validateListing(listing: ListingData): string[] {
    this.operationStatus = "validating";
    const problems = listing.validateData();
    this.operationStatus = problems.length === 0 ? "valid" : "invalid";
    return problems;
  }

  /* --------------------------------------------------------- SubmitListing */

  async submitListing(input: SubmitListingInput): Promise<OperationStatus> {
    const listingId = newId("lst");
    const createdAt = nowIso();

    // Real geocode against OpenStreetMap so the map pin is the actual address.
    const point = await geocodeAddress(input.address, input.city, input.state);

    // Decode first, write later: nothing reaches UPLOAD_DIR until the whole
    // listing has passed validation.
    let decoded: DecodedPhoto[];
    try {
      if (input.photoDataUrls.length > MAX_PHOTOS_PER_LISTING) {
        throw new Error(`A listing can have at most ${MAX_PHOTOS_PER_LISTING} photos`);
      }
      decoded = input.photoDataUrls.map((dataUrl) => PhotoData.decodeDataUrl(dataUrl));
    } catch (err) {
      this.operationStatus = "photo_rejected";
      return {
        ok: false,
        message: "A photo could not be accepted",
        problems: [(err as Error).message],
        listing: null,
      };
    }

    const photos = (input.photoUrls ?? []).map((url, i) =>
      PhotoData.fromRemoteUrl(listingId, url, decoded.length + i),
    );

    const listing = new ListingData({
      listingId,
      ownerId: input.ownerId,
      title: input.title,
      address: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
      description: input.description,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      geocodeSource: point ? "nominatim" : "unresolved",
      status: input.status ?? "active",
      createdAt,
      updatedAt: createdAt,
      photoData: photos,
      pricingData: new PricingData({
        listingId,
        monthlyRent: input.monthlyRent,
        availableFrom: input.availableFrom,
        availableTo: input.availableTo,
        utilitiesIncluded: input.utilitiesIncluded,
        deposit: input.deposit,
      }),
      roomDetails: new RoomDetails({
        listingId,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        maxRoommates: input.maxRoommates,
        petsAllowed: input.petsAllowed,
        furnished: input.furnished,
        privateBath: input.privateBath,
      }),
      amenities: [...new Set(input.amenities)],
    });

    const problems = this.validateListing(listing);
    if (problems.length > 0) {
      this.operationStatus = "rejected";
      return { ok: false, message: "Listing was not accepted", problems, listing: null };
    }

    this.storeWithPhotos(listing, decoded);
    this.listing = listing;
    this.operationStatus = "submitted";
    return {
      ok: true,
      message: point
        ? "Listing published"
        : "Listing published, but we could not place the address on the map yet",
      problems: [],
      listing,
    };
  }

  /* ------------------------------------------------------- RetrieveListing */

  retrieveListing(listingId: string): ListingData | null {
    this.operationStatus = "retrieving";
    this.listing = ListingData.retrieveById(listingId);
    this.operationStatus = this.listing ? "retrieved" : "not_found";
    return this.listing;
  }

  retrieveListings(filter: ListingFilter, sort: ListingSort = "newest"): ListingData[] {
    this.operationStatus = "retrieving";
    const results = ListingData.sortData(ListingData.filterData(filter), sort);
    this.operationStatus = "retrieved";
    return results;
  }

  /* --------------------------------------------------------- UpdateListing */

  async updateListing(
    listingId: string,
    ownerId: string,
    patch: Partial<SubmitListingInput>,
  ): Promise<OperationStatus> {
    const listing = ListingData.retrieveById(listingId);
    // A removed listing is gone as far as callers are concerned. Without this,
    // PATCH { status: "active" } would quietly bring a deleted listing back.
    if (!listing || listing.status === "removed") {
      this.operationStatus = "not_found";
      return { ok: false, message: "Listing not found", problems: [], listing: null };
    }
    if (listing.ownerId !== ownerId) {
      this.operationStatus = "forbidden";
      return { ok: false, message: "You can only edit your own listings", problems: [], listing: null };
    }

    const addressChanged =
      (patch.address !== undefined && patch.address !== listing.address) ||
      (patch.city !== undefined && patch.city !== listing.city) ||
      (patch.state !== undefined && patch.state !== listing.state);

    if (patch.title !== undefined) listing.title = patch.title;
    if (patch.address !== undefined) listing.address = patch.address;
    if (patch.city !== undefined) listing.city = patch.city;
    if (patch.state !== undefined) listing.state = patch.state;
    if (patch.zip !== undefined) listing.zip = patch.zip;
    if (patch.description !== undefined) listing.description = patch.description;
    if (patch.status !== undefined) listing.status = patch.status;
    if (patch.amenities !== undefined) listing.amenities = [...new Set(patch.amenities)];

    if (listing.pricingData) {
      const p = listing.pricingData;
      if (patch.monthlyRent !== undefined) p.monthlyRent = patch.monthlyRent;
      if (patch.availableFrom !== undefined) p.availableFrom = patch.availableFrom;
      if (patch.availableTo !== undefined) p.availableTo = patch.availableTo;
      if (patch.utilitiesIncluded !== undefined) p.utilitiesIncluded = patch.utilitiesIncluded;
      if (patch.deposit !== undefined) p.deposit = patch.deposit;
    }
    if (listing.roomDetails) {
      const r = listing.roomDetails;
      if (patch.bedrooms !== undefined) r.bedrooms = patch.bedrooms;
      if (patch.bathrooms !== undefined) r.bathrooms = patch.bathrooms;
      if (patch.maxRoommates !== undefined) r.maxRoommates = patch.maxRoommates;
      if (patch.petsAllowed !== undefined) r.petsAllowed = patch.petsAllowed;
      if (patch.furnished !== undefined) r.furnished = patch.furnished;
      if (patch.privateBath !== undefined) r.privateBath = patch.privateBath;
    }

    if (addressChanged) {
      const point = await geocodeAddress(listing.address, listing.city, listing.state);
      listing.lat = point?.lat ?? null;
      listing.lng = point?.lng ?? null;
      listing.geocodeSource = point ? "nominatim" : "unresolved";
    }

    let decoded: DecodedPhoto[] = [];
    if (patch.photoDataUrls && patch.photoDataUrls.length > 0) {
      try {
        if (listing.photoData.length + patch.photoDataUrls.length > MAX_PHOTOS_PER_LISTING) {
          throw new Error(`A listing can have at most ${MAX_PHOTOS_PER_LISTING} photos`);
        }
        decoded = patch.photoDataUrls.map((dataUrl) => PhotoData.decodeDataUrl(dataUrl));
      } catch (err) {
        this.operationStatus = "photo_rejected";
        return {
          ok: false,
          message: "A photo could not be accepted",
          problems: [(err as Error).message],
          listing: null,
        };
      }
    }

    const problems = this.validateListing(listing);
    if (problems.length > 0) {
      this.operationStatus = "rejected";
      return { ok: false, message: "Update was not accepted", problems, listing: null };
    }

    this.storeWithPhotos(listing, decoded);
    this.listing = listing;
    this.operationStatus = "updated";
    return { ok: true, message: "Listing updated", problems: [], listing };
  }

  /* --------------------------------------------------------- DeleteListing */

  deleteListing(listingId: string, ownerId: string): OperationStatus {
    const row = db.prepare("SELECT owner_id FROM listings WHERE id = ?").get(listingId) as
      | { owner_id: string }
      | undefined;
    if (!row) {
      this.operationStatus = "not_found";
      return { ok: false, message: "Listing not found", problems: [], listing: null };
    }
    if (row.owner_id !== ownerId) {
      this.operationStatus = "forbidden";
      return {
        ok: false,
        message: "You can only delete your own listings",
        problems: [],
        listing: null,
      };
    }

    transaction(() => {
      // Soft-delete keeps conversation history intact for both parties — and
      // keeps the photos, so the owner can set the listing back to active.
      // A hard delete would cascade to photos through the schema's foreign
      // keys; destroying them here left a "removed" listing unrecoverable.
      db.prepare("UPDATE listings SET status = 'removed', updated_at = ? WHERE id = ?").run(
        nowIso(),
        listingId,
      );
      db.prepare("DELETE FROM saved_listings WHERE listing_id = ?").run(listingId);
    });

    this.operationStatus = "deleted";
    this.listing = null;
    return { ok: true, message: "Listing removed", problems: [], listing: null };
  }
}
