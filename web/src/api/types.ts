export type User = {
  id: string;
  email: string;
  name: string;
  university: string;
  bio: string;
  avatarInitials: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  createdAt: string;
  /** Whether a password is set — an SSO-only account has none yet. */
  hasPassword: boolean;
  /** Whether a Microsoft identity is linked, which is what verifies an account. */
  linkedToSso: boolean;
};

/** What the server will accept, so the sign-in screen can render accordingly. */
export type AuthConfig = {
  ssoEnabled: boolean;
  ssoConfigured: boolean;
  ssoDevMode: boolean;
  allowedDomains: string[];
  passwordMinLength: number;
};

export type Photo = {
  photoId: string;
  fileUrl: string;
  fileSize: number;
  uploadTimestamp: string;
  sortOrder: number;
};

export type Pricing = {
  monthlyRent: number;
  availableFrom: string;
  availableTo: string;
  utilitiesIncluded: boolean;
  deposit: number;
};

export type RoomDetails = {
  bedrooms: number;
  bathrooms: number;
  maxRoommates: number;
  petsAllowed: boolean;
  furnished: boolean;
  privateBath: boolean;
};

export type Listing = {
  id: string;
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
  photos: Photo[];
  pricing: Pricing | null;
  roomDetails: RoomDetails | null;
  amenities: string[];
  owner: {
    id: string;
    name: string;
    university: string;
    bio: string;
    initials: string;
    verified: boolean;
    rating: number;
    reviewCount: number;
  } | null;
  distanceMiles: number | null;
  saved?: boolean;
  savedAt?: string;
  stats?: { saves: number; likes: number; inquiries: number };
};

export type Conversation = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingStatus: string;
  listingPhoto: string | null;
  monthlyRent: number | null;
  role: "guest" | "host";
  archived: boolean;
  lastMessage: string | null;
  lastMessageAt: string;
  unread: number;
  other: { name: string; initials: string; verified: boolean; university: string };
};

export type Message = {
  id: string;
  senderId: string;
  senderName?: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  mine: boolean;
};

export type Settings = {
  font: string;
  color: string;
  theme: string;
  width: number;
  height: number;
  university: string;
  searchRadiusMiles: number;
  priceCeiling: number | null;
  notifyNewMatches: boolean;
  notifyMessages: boolean;
  notifyPriceDrops: boolean;
  showOnlyVerifiedHosts: boolean;
};

export type Reference = {
  amenities: string[];
  universities: string[];
  reportReasons: string[];
  sorts: Array<{ value: string; label: string }>;
};

export type Filters = {
  q: string;
  maxPrice: number | null;
  minBedrooms: number | null;
  minBathrooms: number | null;
  petsAllowed: boolean;
  furnished: boolean;
  utilitiesIncluded: boolean;
  amenities: string[];
  availableFrom: string;
  availableTo: string;
  radiusMiles: number | null;
  sort: string;
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  maxPrice: null,
  minBedrooms: null,
  minBathrooms: null,
  petsAllowed: false,
  furnished: false,
  utilitiesIncluded: false,
  amenities: [],
  availableFrom: "",
  availableTo: "",
  radiusMiles: null,
  sort: "distance",
};

export function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.q) n += 1;
  if (f.maxPrice !== null) n += 1;
  if (f.minBedrooms !== null) n += 1;
  if (f.minBathrooms !== null) n += 1;
  if (f.petsAllowed) n += 1;
  if (f.furnished) n += 1;
  if (f.utilitiesIncluded) n += 1;
  if (f.availableFrom) n += 1;
  if (f.availableTo) n += 1;
  if (f.radiusMiles !== null) n += 1;
  n += f.amenities.length;
  return n;
}

export function filtersToQuery(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.maxPrice !== null) params.set("maxPrice", String(f.maxPrice));
  if (f.minBedrooms !== null) params.set("minBedrooms", String(f.minBedrooms));
  if (f.minBathrooms !== null) params.set("minBathrooms", String(f.minBathrooms));
  if (f.petsAllowed) params.set("petsAllowed", "1");
  if (f.furnished) params.set("furnished", "1");
  if (f.utilitiesIncluded) params.set("utilitiesIncluded", "1");
  if (f.amenities.length > 0) params.set("amenities", f.amenities.join(","));
  if (f.availableFrom) params.set("availableFrom", f.availableFrom);
  if (f.availableTo) params.set("availableTo", f.availableTo);
  if (f.radiusMiles !== null) params.set("radiusMiles", String(f.radiusMiles));
  if (f.sort) params.set("sort", f.sort);
  return params;
}
