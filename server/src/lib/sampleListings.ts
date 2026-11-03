/**
 * TM09-134: the committed sample dataset — loader, shape and rules.
 *
 * The dataset itself lives in `server/seed-data/sample-listings.json` so it can
 * be reviewed in a diff instead of buried in a 1,000-line source file. It is
 * NOT under `server/data/`: that directory is gitignored (it holds the runtime
 * SQLite file), so anything written there would never be committed.
 *
 * This module deliberately imports nothing but `node:` builtins. `src/db.ts`
 * opens SQLite at import time, so pulling it in here would mean the validator
 * script and its tests opened a database they have no use for — and on Windows
 * an open handle is the difference between a clean exit and a locked file.
 *
 * It also never touches the network. `PhotoData.fromRemoteUrl` only records a
 * URL (`fileUrl`, `fileSize: 0`); nothing is ever downloaded, at seed time or
 * at test time, so validating a photo means validating a string.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type SampleHost = {
  key: string;
  email: string;
  name: string;
  university: string;
  bio: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
};

export type SampleListing = {
  host: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fallback: { lat: number; lng: number };
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
  photos: string[];
};

export type SampleListingFile = {
  sampleData: true;
  jira: string;
  notice: string;
  password: string;
  hosts: SampleHost[];
  listings: SampleListing[];
};

/** `server/seed-data/sample-listings.json`, resolved off this module's own URL. */
export const SAMPLE_LISTINGS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "seed-data",
  "sample-listings.json",
);

/**
 * Reads and parses the dataset. Plain `fs` rather than a JSON import attribute:
 * the validator's whole job is to distrust this file's shape, and an import
 * would hand it back pre-typed as if it had already been checked.
 */
export function loadSampleListings(file: string = SAMPLE_LISTINGS_PATH): SampleListingFile {
  return JSON.parse(fs.readFileSync(file, "utf8")) as SampleListingFile;
}

/**
 * Streets a sample address may sit on — University Hill and Westcott only.
 *
 * The nine named in TM09-134 come first; the rest are the other Hill/Westcott
 * streets the dataset already used. The acceptance criterion lists its streets
 * as examples ("e.g."), and collapsing 24 listings onto nine streets would
 * stack half the dataset on one block for no gain.
 */
export const ALLOWED_STREETS: string[] = [
  // Named in the story.
  "Euclid Ave",
  "Walnut Ave",
  "Ostrom Ave",
  "Comstock Ave",
  "Livingston Ave",
  "Westcott St",
  "Lancaster Ave",
  "Marshall St",
  "Harrison St",
  // The rest of the neighborhood.
  "University Ave",
  "Ackerman Ave",
  "Clarendon St",
  "Dell St",
  "Sumner Ave",
  "Redfield Pl",
  "Stratford St",
  "Maryland Ave",
  "Beech St",
  "Roosevelt Ave",
  "S Crouse Ave",
  "E Genesee St",
];

/** Rent bands the filter UI is expected to have something in. */
export const PRICE_TIERS = [
  { name: "budget", min: 0, max: 599 },
  { name: "mid", min: 600, max: 899 },
  { name: "premium", min: 900, max: Infinity },
];

/** Bedroom counts that must each appear at least once: studio plus 1–4. */
export const REQUIRED_BEDROOM_COUNTS = [0, 1, 2, 3, 4];

const MIN_LISTINGS = 20;
const MIN_PHOTOS = 2;
const MIN_PRICE_TIERS = 3;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** True when `address` ends in one of the allowed streets, case-insensitively. */
export function streetOf(address: string): string | null {
  const lower = address.trim().toLowerCase();
  for (const street of ALLOWED_STREETS) {
    if (lower.endsWith(street.toLowerCase())) return street;
  }
  return null;
}

/**
 * Checks the dataset against every TM09-134 acceptance criterion.
 *
 * Returns a list of human-readable problems — empty means valid. It takes
 * `unknown` and re-checks each field's runtime type, because the input is a
 * file on disk that anyone can hand-edit.
 */
export function validateSampleData(data: unknown): string[] {
  const problems: string[] = [];

  if (!isObject(data)) return ["the file does not contain a JSON object"];

  // The data must say, in the data, that it is fake.
  if (data.sampleData !== true) {
    problems.push('missing the sample-data marker: expected "sampleData": true');
  }
  if (!isNonEmptyString(data.notice)) {
    problems.push("missing the fictional-data notice");
  }

  const hosts = data.hosts;
  if (!Array.isArray(hosts)) {
    problems.push("hosts is not an array");
    return problems;
  }
  const hostKeys = new Set<string>();
  hosts.forEach((host, i) => {
    if (!isObject(host) || !isNonEmptyString(host.key)) {
      problems.push(`host[${i}]: missing key`);
      return;
    }
    hostKeys.add(host.key as string);
    if (!isNonEmptyString(host.email)) problems.push(`host[${i}] "${host.key}": missing email`);
    if (!isNonEmptyString(host.name)) problems.push(`host[${i}] "${host.key}": missing name`);
  });

  const listings = data.listings;
  if (!Array.isArray(listings)) {
    problems.push("listings is not an array");
    return problems;
  }

  if (listings.length < MIN_LISTINGS) {
    problems.push(`only ${listings.length} listings — at least ${MIN_LISTINGS} are required`);
  }

  const bedroomCounts = new Set<number>();
  const tierCounts = new Map<string, number>(PRICE_TIERS.map((t) => [t.name, 0]));

  listings.forEach((listing, i) => {
    const where = `listing[${i}]${isObject(listing) && isNonEmptyString(listing.title) ? ` "${listing.title}"` : ""}`;
    const fail = (message: string) => problems.push(`${where}: ${message}`);

    if (!isObject(listing)) {
      fail("is not an object");
      return;
    }

    // --- required text fields
    for (const field of ["title", "address", "city", "state", "zip", "description"]) {
      if (!isNonEmptyString(listing[field])) fail(`missing ${field}`);
    }

    // --- host wiring
    if (!isNonEmptyString(listing.host)) fail("missing host");
    else if (!hostKeys.has(listing.host as string)) fail(`unknown host "${listing.host}"`);

    // --- address must be on a University Hill / Westcott street
    if (isNonEmptyString(listing.address) && streetOf(listing.address as string) === null) {
      fail(`address "${listing.address}" is not on an allowed University Hill / Westcott street`);
    }

    // --- price
    if (typeof listing.monthlyRent !== "number" || !Number.isFinite(listing.monthlyRent)) {
      fail("monthlyRent is not a number");
    } else if (listing.monthlyRent <= 0) {
      fail(`monthlyRent ${listing.monthlyRent} must be greater than 0`);
    } else {
      const rent = listing.monthlyRent;
      const tier = PRICE_TIERS.find((t) => rent >= t.min && rent <= t.max);
      if (tier) tierCounts.set(tier.name, (tierCounts.get(tier.name) ?? 0) + 1);
    }
    if (typeof listing.deposit !== "number" || listing.deposit < 0) {
      fail("deposit is not a number of zero or more");
    }

    // --- availability window
    const from = listing.availableFrom;
    const to = listing.availableTo;
    if (typeof from !== "string" || !DATE_RE.test(from)) {
      fail("availableFrom is not a YYYY-MM-DD date");
    } else if (typeof to !== "string" || !DATE_RE.test(to)) {
      fail("availableTo is not a YYYY-MM-DD date");
    } else if (!(Date.parse(from) < Date.parse(to))) {
      fail(`availability ${from} → ${to} does not start before it ends`);
    }

    // --- beds and baths
    if (typeof listing.bedrooms !== "number" || !Number.isInteger(listing.bedrooms)) {
      fail("bedrooms is not an integer");
    } else if (listing.bedrooms < 0 || listing.bedrooms > 12) {
      fail(`bedrooms ${listing.bedrooms} is outside 0–12`);
    } else {
      bedroomCounts.add(listing.bedrooms);
    }
    if (typeof listing.bathrooms !== "number" || !Number.isFinite(listing.bathrooms)) {
      fail("bathrooms is not a number");
    } else if (listing.bathrooms < 0.5 || listing.bathrooms > 12) {
      fail(`bathrooms ${listing.bathrooms} is outside 0.5–12`);
    }

    // --- photos (string checks only; nothing is fetched)
    const photos = listing.photos;
    if (!Array.isArray(photos)) {
      fail("photos is not an array");
    } else {
      if (photos.length < MIN_PHOTOS) {
        fail(`has ${photos.length} photo(s) — at least ${MIN_PHOTOS} are required`);
      }
      const seen = new Set<string>();
      photos.forEach((photo, p) => {
        if (typeof photo !== "string" || !/^https:\/\/\S+$/.test(photo)) {
          fail(`photo[${p}] is not an https URL`);
          return;
        }
        if (seen.has(photo)) fail(`photo[${p}] repeats the same image`);
        seen.add(photo);
      });
    }

    // --- map fallback coordinates
    if (
      !isObject(listing.fallback) ||
      typeof listing.fallback.lat !== "number" ||
      typeof listing.fallback.lng !== "number"
    ) {
      fail("fallback is not a { lat, lng } pair");
    }

    if (!Array.isArray(listing.amenities)) fail("amenities is not an array");
  });

  // --- dataset-wide spread, so the filters have something to filter
  const missingBeds = REQUIRED_BEDROOM_COUNTS.filter((n) => !bedroomCounts.has(n));
  if (missingBeds.length > 0) {
    const label = missingBeds.map((n) => (n === 0 ? "studio" : `${n}-bed`)).join(", ");
    problems.push(`no listing for: ${label}`);
  }

  const filledTiers = [...tierCounts.values()].filter((n) => n > 0).length;
  if (filledTiers < MIN_PRICE_TIERS) {
    problems.push(`only ${filledTiers} price tier(s) in use — at least ${MIN_PRICE_TIERS} are required`);
  }

  return problems;
}
