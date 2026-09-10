/**
 * Builders for valid domain objects. Every factory returns something that
 * passes validateData() with no problems, so a test can express "this one
 * field is wrong" by overriding exactly that field. That keeps each assertion
 * about one rule instead of a pile of unrelated setup.
 */
import { ListingData, type ListingFields } from "../../src/domain/ListingData.ts";
import { PhotoData, type PhotoFields } from "../../src/domain/PhotoData.ts";
import { PricingData, type PricingFields } from "../../src/domain/PricingData.ts";
import { RoomDetails, type RoomDetailsFields } from "../../src/domain/RoomDetails.ts";

export function makePricing(overrides: Partial<PricingFields> = {}): PricingData {
  return new PricingData({
    listingId: "lst_test",
    monthlyRent: 950,
    availableFrom: "2026-01-01",
    availableTo: "2026-08-01",
    utilitiesIncluded: true,
    deposit: 500,
    ...overrides,
  });
}

export function makeRoomDetails(overrides: Partial<RoomDetailsFields> = {}): RoomDetails {
  return new RoomDetails({
    listingId: "lst_test",
    bedrooms: 2,
    bathrooms: 1,
    maxRoommates: 1,
    petsAllowed: false,
    furnished: true,
    privateBath: false,
    ...overrides,
  });
}

export function makePhoto(overrides: Partial<PhotoFields> = {}): PhotoData {
  return new PhotoData({
    photoId: "pho_test",
    listingId: "lst_test",
    fileUrl: "/uploads/example.jpg",
    fileSize: 240_000,
    uploadTimestamp: "2026-01-01T00:00:00.000Z",
    sortOrder: 0,
    ...overrides,
  });
}

/**
 * A complete, valid listing. Pricing and room details are present because
 * ListingData.validateData() requires both, and the composed objects are the
 * point of most of these tests.
 */
export function makeListing(overrides: Partial<ListingFields> = {}): ListingData {
  return new ListingData({
    listingId: "lst_test",
    ownerId: "usr_test",
    title: "Sunny room near campus",
    address: "123 Euclid Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    description: "A bright bedroom two blocks from campus, available for the spring semester.",
    lat: 43.0402,
    lng: -76.1372,
    geocodeSource: "test",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    photoData: [],
    pricingData: makePricing(),
    roomDetails: makeRoomDetails(),
    amenities: ["Wifi"],
    ...overrides,
  });
}
