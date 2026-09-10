import { db, nowIso } from "../db.ts";
import { CAMPUS_ANCHORS, haversineMiles } from "../lib/geocode.ts";
import { Data } from "./Data.ts";
import { PhotoData } from "./PhotoData.ts";
import { PricingData } from "./PricingData.ts";
import { RoomDetails } from "./RoomDetails.ts";

export type ListingFields = {
  listingId: string;
  ownerId: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  lat: number | null;
  lng: number | null;
  geocodeSource: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  photoData: PhotoData[];
  pricingData: PricingData | null;
  roomDetails: RoomDetails | null;
  amenities: string[];
};

export type ListingFilter = {
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  petsAllowed?: boolean;
  furnished?: boolean;
  utilitiesIncluded?: boolean;
  amenities?: string[];
  availableFrom?: string;
  availableTo?: string;
  near?: { lat: number; lng: number };
  radiusMiles?: number;
  bbox?: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  ownerId?: string;
  excludeSwipedBy?: string;
  status?: string;
};

export type ListingSort = "newest" | "price_asc" | "price_desc" | "distance" | "available_soonest";

type OwnerRow = {
  owner_name: string;
  owner_university: string;
  owner_bio: string;
  owner_initials: string;
  owner_verified: number;
  owner_rating: number;
  owner_reviews: number;
};

type ListingRow = {
  id: string;
  owner_id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  lat: number | null;
  lng: number | null;
  geocode_source: string;
  status: string;
  created_at: string;
  updated_at: string;
} & OwnerRow;

const SELECT_BASE = `
  SELECT l.id, l.owner_id, l.title, l.address, l.city, l.state, l.zip, l.description,
         l.lat, l.lng, l.geocode_source, l.status, l.created_at, l.updated_at,
         u.name AS owner_name, u.university AS owner_university, u.bio AS owner_bio,
         u.avatar_initials AS owner_initials, u.verified AS owner_verified,
         u.rating AS owner_rating, u.review_count AS owner_reviews
  FROM listings l
  JOIN users u ON u.id = l.owner_id
`;

/**
 * ListingData  (generalizes Data)
 *   - listingId : String
 *   - title : String
 *   - address : String
 *   - description : String
 *   - photoData : PhotoData
 *   - pricingData : PricingData
 *   - roomDetails : RoomDetails
 *   + ValidateData() + StoreData() + RetrieveData() + SortData() + FilterData()
 */
export class ListingData extends Data {
  listingId: string;
  ownerId: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  lat: number | null;
  lng: number | null;
  geocodeSource: string;
  status: string;
  createdAt: string;
  updatedAt: string;

  // Composition relationships from the diagram.
  photoData: PhotoData[];
  pricingData: PricingData | null;
  roomDetails: RoomDetails | null;
  amenities: string[];

  // Derived, not persisted.
  owner: {
    id: string;
    name: string;
    university: string;
    bio: string;
    initials: string;
    verified: boolean;
    rating: number;
    reviewCount: number;
  } | null = null;
  distanceMiles: number | null = null;

  constructor(fields: ListingFields) {
    super();
    this.listingId = fields.listingId;
    this.ownerId = fields.ownerId;
    this.title = fields.title;
    this.address = fields.address;
    this.city = fields.city;
    this.state = fields.state;
    this.zip = fields.zip;
    this.description = fields.description;
    this.lat = fields.lat;
    this.lng = fields.lng;
    this.geocodeSource = fields.geocodeSource;
    this.status = fields.status;
    this.createdAt = fields.createdAt;
    this.updatedAt = fields.updatedAt;
    this.photoData = fields.photoData;
    this.pricingData = fields.pricingData;
    this.roomDetails = fields.roomDetails;
    this.amenities = fields.amenities;
  }

  /* --------------------------------------------------------- Data contract */

  validateData(): string[] {
    const problems: string[] = [];
    if (this.title.trim().length < 4) problems.push("Title must be at least 4 characters");
    if (this.title.length > 120) problems.push("Title must be at most 120 characters");
    if (this.address.trim().length < 5) problems.push("Street address looks too short");
    if (!this.city.trim()) problems.push("City is required");
    if (!/^[A-Za-z]{2}$/.test(this.state.trim())) problems.push("State must be a 2-letter code");
    if (this.description.trim().length < 20) {
      problems.push("Description must be at least 20 characters so renters know what they get");
    }
    if (this.description.length > 4000) problems.push("Description must be at most 4000 characters");
    if (!["active", "paused", "removed"].includes(this.status)) {
      problems.push(`Unknown status "${this.status}"`);
    }
    if (!this.pricingData) problems.push("Pricing is required");
    if (!this.roomDetails) problems.push("Room details are required");

    // Composed objects validate themselves — the diagram's generalization at work.
    problems.push(...(this.pricingData?.validateData() ?? []));
    problems.push(...(this.roomDetails?.validateData() ?? []));
    for (const photo of this.photoData) problems.push(...photo.validateData());

    return problems;
  }

  storeData(): void {
    this.updatedAt = nowIso();
    db.prepare(
      `INSERT INTO listings (id, owner_id, title, address, city, state, zip, description,
                             lat, lng, geocode_source, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, address = excluded.address, city = excluded.city,
         state = excluded.state, zip = excluded.zip, description = excluded.description,
         lat = excluded.lat, lng = excluded.lng, geocode_source = excluded.geocode_source,
         status = excluded.status, updated_at = excluded.updated_at`,
    ).run(
      this.listingId,
      this.ownerId,
      this.title,
      this.address,
      this.city,
      this.state,
      this.zip,
      this.description,
      this.lat,
      this.lng,
      this.geocodeSource,
      this.status,
      this.createdAt,
      this.updatedAt,
    );

    this.pricingData?.storeData();
    this.roomDetails?.storeData();
    for (const photo of this.photoData) photo.storeData();

    db.prepare("DELETE FROM listing_amenities WHERE listing_id = ?").run(this.listingId);
    const insertAmenity = db.prepare(
      "INSERT OR IGNORE INTO listing_amenities (listing_id, name) VALUES (?, ?)",
    );
    for (const name of this.amenities) insertAmenity.run(this.listingId, name);
  }

  retrieveData(): boolean {
    const fresh = ListingData.retrieveById(this.listingId);
    if (!fresh) return false;
    Object.assign(this, fresh);
    return true;
  }

  /* ------------------------------------------------------------ retrieval */

  static hydrate(row: ListingRow): ListingData {
    const listing = new ListingData({
      listingId: row.id,
      ownerId: row.owner_id,
      title: row.title,
      address: row.address,
      city: row.city,
      state: row.state,
      zip: row.zip,
      description: row.description,
      lat: row.lat,
      lng: row.lng,
      geocodeSource: row.geocode_source,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      photoData: PhotoData.retrieveForListing(row.id),
      pricingData: PricingData.retrieveForListing(row.id),
      roomDetails: RoomDetails.retrieveForListing(row.id),
      amenities: (
        db
          .prepare("SELECT name FROM listing_amenities WHERE listing_id = ? ORDER BY name")
          .all(row.id) as Array<{ name: string }>
      ).map((a) => a.name),
    });
    listing.owner = {
      id: row.owner_id,
      name: row.owner_name,
      university: row.owner_university,
      bio: row.owner_bio,
      initials: row.owner_initials,
      verified: row.owner_verified === 1,
      rating: row.owner_rating,
      reviewCount: row.owner_reviews,
    };
    return listing;
  }

  static retrieveById(listingId: string): ListingData | null {
    const row = db.prepare(`${SELECT_BASE} WHERE l.id = ?`).get(listingId) as
      | ListingRow
      | undefined;
    return row ? ListingData.hydrate(row) : null;
  }

  /**
   * FilterData() from the diagram. Filters that map cleanly onto indexed
   * columns run in SQL; the rest (amenity set matching, radius) run in memory
   * against the already-narrowed result set.
   */
  static filterData(filter: ListingFilter): ListingData[] {
    const where: string[] = [];
    const params: Array<string | number> = [];

    where.push("l.status = ?");
    params.push(filter.status ?? "active");

    if (filter.ownerId) {
      where.push("l.owner_id = ?");
      params.push(filter.ownerId);
    }
    if (filter.q) {
      where.push("(l.title LIKE ? OR l.address LIKE ? OR l.description LIKE ? OR l.city LIKE ?)");
      const like = `%${filter.q}%`;
      params.push(like, like, like, like);
    }
    if (filter.minPrice !== undefined) {
      where.push("p.monthly_rent >= ?");
      params.push(filter.minPrice);
    }
    if (filter.maxPrice !== undefined) {
      where.push("p.monthly_rent <= ?");
      params.push(filter.maxPrice);
    }
    if (filter.minBedrooms !== undefined) {
      where.push("r.bedrooms >= ?");
      params.push(filter.minBedrooms);
    }
    if (filter.minBathrooms !== undefined) {
      where.push("r.bathrooms >= ?");
      params.push(filter.minBathrooms);
    }
    if (filter.petsAllowed) where.push("r.pets_allowed = 1");
    if (filter.furnished) where.push("r.furnished = 1");
    if (filter.utilitiesIncluded) where.push("p.utilities_included = 1");

    // Overlap test: the listing's window must intersect the requested window.
    if (filter.availableFrom) {
      where.push("date(p.available_to) >= date(?)");
      params.push(filter.availableFrom);
    }
    if (filter.availableTo) {
      where.push("date(p.available_from) <= date(?)");
      params.push(filter.availableTo);
    }

    if (filter.bbox) {
      where.push("l.lat BETWEEN ? AND ? AND l.lng BETWEEN ? AND ?");
      params.push(filter.bbox.minLat, filter.bbox.maxLat, filter.bbox.minLng, filter.bbox.maxLng);
    }
    if (filter.excludeSwipedBy) {
      where.push("l.id NOT IN (SELECT listing_id FROM swipes WHERE user_id = ?)");
      params.push(filter.excludeSwipedBy);
      // Never show a user their own listing in the deck.
      where.push("l.owner_id <> ?");
      params.push(filter.excludeSwipedBy);
    }

    const sql = `
      ${SELECT_BASE}
      LEFT JOIN pricing p      ON p.listing_id = l.id
      LEFT JOIN room_details r ON r.listing_id = l.id
      WHERE ${where.join(" AND ")}
    `;
    const rows = db.prepare(sql).all(...params) as ListingRow[];
    let listings = rows.map(ListingData.hydrate);

    if (filter.amenities && filter.amenities.length > 0) {
      const required = filter.amenities.map((a) => a.toLowerCase());
      listings = listings.filter((l) => {
        const have = new Set(l.amenities.map((a) => a.toLowerCase()));
        return required.every((a) => have.has(a));
      });
    }

    if (filter.near) {
      const { lat, lng } = filter.near;
      for (const listing of listings) {
        listing.distanceMiles =
          listing.lat === null || listing.lng === null
            ? null
            : haversineMiles(lat, lng, listing.lat, listing.lng);
      }
      if (filter.radiusMiles !== undefined) {
        const radius = filter.radiusMiles;
        listings = listings.filter(
          (l) => l.distanceMiles !== null && l.distanceMiles <= radius,
        );
      }
    }

    return listings;
  }

  /** SortData() from the diagram. */
  static sortData(listings: ListingData[], sort: ListingSort): ListingData[] {
    const sorted = [...listings];
    switch (sort) {
      case "price_asc":
        sorted.sort(
          (a, b) => (a.pricingData?.monthlyRent ?? 0) - (b.pricingData?.monthlyRent ?? 0),
        );
        break;
      case "price_desc":
        sorted.sort(
          (a, b) => (b.pricingData?.monthlyRent ?? 0) - (a.pricingData?.monthlyRent ?? 0),
        );
        break;
      case "distance":
        sorted.sort(
          (a, b) => (a.distanceMiles ?? Number.MAX_VALUE) - (b.distanceMiles ?? Number.MAX_VALUE),
        );
        break;
      case "available_soonest":
        sorted.sort((a, b) =>
          (a.pricingData?.availableFrom ?? "9999").localeCompare(
            b.pricingData?.availableFrom ?? "9999",
          ),
        );
        break;
      case "newest":
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
    }
    return sorted;
  }

  /** Fills in distanceMiles relative to a campus, for display. */
  setDistanceFromCampus(university: string): void {
    const anchor = CAMPUS_ANCHORS[university] ?? CAMPUS_ANCHORS["Syracuse University"];
    this.distanceMiles =
      this.lat === null || this.lng === null
        ? null
        : haversineMiles(anchor.lat, anchor.lng, this.lat, this.lng);
  }

  toJSON() {
    return {
      id: this.listingId,
      ownerId: this.ownerId,
      title: this.title,
      address: this.address,
      city: this.city,
      state: this.state,
      zip: this.zip,
      description: this.description,
      lat: this.lat,
      lng: this.lng,
      geocodeSource: this.geocodeSource,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      photos: this.photoData.map((p) => p.toJSON()),
      pricing: this.pricingData?.toJSON() ?? null,
      roomDetails: this.roomDetails?.toJSON() ?? null,
      amenities: this.amenities,
      owner: this.owner,
      distanceMiles:
        this.distanceMiles === null ? null : Math.round(this.distanceMiles * 100) / 100,
    };
  }
}
