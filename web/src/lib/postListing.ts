/**
 * TM09-98: what the Post screen decides, kept apart from the component so it
 * can be tested without a DOM.
 *
 * The validation rules mirror the server's, so a draft that passes here is
 * one the server accepts and the host sees every problem before anything is
 * uploaded:
 *   - routes/listings.ts readListingBody()  (field presence and ranges)
 *   - ListingData.validateData()            (title, address, state, description)
 *   - PricingData.validateData()            (rent, dates, deposit)
 *   - RoomDetails.validateData()            (bedrooms, bathrooms, roommates)
 *   - MAX_PHOTOS_PER_LISTING                (10)
 * The server still validates everything; this only saves a round trip.
 */

export const MAX_PHOTOS = 10;

/** AC2: photos are downscaled so their long edge is at most this many pixels. */
export const MAX_LONG_EDGE = 1600;

/** JPEG quality for the re-encoded photo. */
export const JPEG_QUALITY = 0.85;

export type ListingDraft = {
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  monthlyRent: string;
  deposit: string;
  availableFrom: string;
  availableTo: string;
  utilitiesIncluded: boolean;
  bedrooms: string;
  bathrooms: string;
  maxRoommates: string;
  petsAllowed: boolean;
  furnished: boolean;
  privateBath: boolean;
  amenities: string[];
};

export const EMPTY_DRAFT: ListingDraft = {
  title: "",
  address: "",
  city: "Syracuse",
  state: "NY",
  zip: "",
  description: "",
  monthlyRent: "",
  deposit: "",
  availableFrom: "",
  availableTo: "",
  utilitiesIncluded: false,
  bedrooms: "1",
  bathrooms: "1",
  maxRoommates: "0",
  petsAllowed: false,
  furnished: false,
  privateBath: false,
  amenities: [],
};

export type DraftField = keyof ListingDraft | "photos";
export type DraftErrors = Partial<Record<DraftField, string>>;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day in YYYY-MM-DD form (Feb 31 is not one). */
export function isCalendarDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function num(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * AC1: validates the form the way ListingManager does. Returns one message per
 * field that has a problem; an empty object means the draft can be submitted.
 */
export function validateDraft(draft: ListingDraft, photoCount = 0): DraftErrors {
  const errors: DraftErrors = {};

  const title = draft.title.trim();
  if (title.length < 4) errors.title = "Title must be at least 4 characters";
  else if (title.length > 120) errors.title = "Title must be at most 120 characters";

  const address = draft.address.trim();
  if (address.length < 5) errors.address = "Street address looks too short";
  else if (address.length > 200) errors.address = "Street address is too long";

  if (!draft.city.trim()) errors.city = "City is required";
  if (!/^[A-Za-z]{2}$/.test(draft.state.trim())) errors.state = "State must be a 2-letter code";
  if (draft.zip.trim().length > 10) errors.zip = "ZIP is too long";

  const description = draft.description.trim();
  if (description.length < 20) {
    errors.description = "Description must be at least 20 characters so renters know what they get";
  } else if (description.length > 4000) {
    errors.description = "Description must be at most 4000 characters";
  }

  const rent = num(draft.monthlyRent);
  if (rent === null || rent <= 0) errors.monthlyRent = "Monthly rent must be greater than $0";
  else if (rent > 20_000) errors.monthlyRent = "Monthly rent looks unrealistic (over $20,000)";

  const deposit = num(draft.deposit);
  if (draft.deposit.trim() !== "" && (deposit === null || deposit < 0)) {
    errors.deposit = "Deposit cannot be negative";
  } else if (deposit !== null && deposit > 20_000) {
    errors.deposit = "Deposit looks unrealistic (over $20,000)";
  }

  const fromOk = isCalendarDate(draft.availableFrom);
  const toOk = isCalendarDate(draft.availableTo);
  if (!fromOk) errors.availableFrom = "Pick a move-in date";
  if (!toOk) errors.availableTo = "Pick a move-out date";
  if (fromOk && toOk && draft.availableTo <= draft.availableFrom) {
    errors.availableTo = "Available-to must be after available-from";
  }

  const beds = num(draft.bedrooms);
  if (beds === null || !Number.isInteger(beds) || beds < 0 || beds > 12) {
    errors.bedrooms = "Bedrooms must be a whole number between 0 and 12";
  }
  const baths = num(draft.bathrooms);
  if (baths === null || baths < 0.5 || baths > 12) {
    errors.bathrooms = "Bathrooms must be between 0.5 and 12";
  }
  const mates = num(draft.maxRoommates);
  if (mates === null || !Number.isInteger(mates) || mates < 0 || mates > 20) {
    errors.maxRoommates = "Max roommates must be a whole number between 0 and 20";
  }

  if (photoCount > MAX_PHOTOS) errors.photos = `A listing can have at most ${MAX_PHOTOS} photos`;

  return errors;
}

/** The POST /api/listings body, in the flat shape routes/listings.ts reads. */
export function draftToBody(draft: ListingDraft, photoDataUrls: string[]): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    address: draft.address.trim(),
    city: draft.city.trim(),
    state: draft.state.trim().toUpperCase(),
    zip: draft.zip.trim(),
    description: draft.description.trim(),
    monthlyRent: Number(draft.monthlyRent),
    deposit: draft.deposit.trim() === "" ? 0 : Number(draft.deposit),
    availableFrom: draft.availableFrom,
    availableTo: draft.availableTo,
    utilitiesIncluded: draft.utilitiesIncluded,
    bedrooms: Number(draft.bedrooms),
    bathrooms: Number(draft.bathrooms),
    maxRoommates: Number(draft.maxRoommates),
    petsAllowed: draft.petsAllowed,
    furnished: draft.furnished,
    privateBath: draft.privateBath,
    amenities: draft.amenities,
    photos: photoDataUrls,
  };
}

/**
 * AC2: the size a photo is drawn at before upload. The long edge is capped at
 * MAX_LONG_EDGE and the aspect ratio kept; a photo already small enough is
 * left at its own size (never upscaled).
 */
export function scaleToLongEdge(
  width: number,
  height: number,
  maxEdge = MAX_LONG_EDGE,
): { width: number; height: number; scaled: boolean } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0, scaled: false };
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height, scaled: false };
  const ratio = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

/** AC3: what the geocoder is asked for, the same string the server sends. */
export function addressQuery(draft: Pick<ListingDraft, "address" | "city" | "state">): string {
  return [draft.address.trim(), draft.city.trim(), draft.state.trim().toUpperCase()]
    .filter(Boolean)
    .join(", ");
}

/**
 * AC3: an OpenStreetMap embed centred on the pin, with the marker drawn. No API
 * key, same tiles the Map tab uses.
 */
export function pinEmbedUrl(lat: number, lng: number, span = 0.004): string {
  const bbox = [lng - span, lat - span, lng + span, lat + span].map((n) => n.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Bytes in a base64 data URL's payload, without decoding it. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}
