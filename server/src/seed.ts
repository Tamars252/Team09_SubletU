/**
 * Seeds the database with hosts and sublet listings at real addresses in the
 * Syracuse University neighborhood (University Hill, Westcott, Outer Comstock).
 *
 * Every address is geocoded against OpenStreetMap at seed time, so the pins on
 * the map are the buildings' actual coordinates. `fallback` is only used when
 * Nominatim is unreachable or has no match, which keeps `npm run seed` usable
 * offline.
 *
 * The hosts and listings themselves are fictional sample data, committed as
 * `server/seed-data/sample-listings.json` and summarised in
 * `docs/sample-listings.md`. Check them without a database:
 *
 *     npm run validate:sample
 *
 * Run:  npm run seed            (skips if listings already exist)
 *       npm run seed -- --force (wipes seeded data and re-seeds)
 */
import { db, nowIso, transaction } from "./db.ts";
import { ListingData } from "./domain/ListingData.ts";
import { PhotoData } from "./domain/PhotoData.ts";
import { PricingData } from "./domain/PricingData.ts";
import { RoomDetails } from "./domain/RoomDetails.ts";
import { ScreenSettings } from "./domain/ScreenSettings.ts";
import { hashPassword, newId } from "./lib/crypto.ts";
import { initialsFor } from "./lib/text.ts";
import { geocodeAddress } from "./lib/geocode.ts";
import { loadSampleListings } from "./lib/sampleListings.ts";
import type { SampleHost as SeedHost } from "./lib/sampleListings.ts";

/**
 * The dataset is a committed JSON file (TM09-134) rather than literals in this
 * module, so it can be reviewed in a diff and checked by `npm run validate:sample`
 * without standing up a database.
 */
const SAMPLE = loadSampleListings();
const PASSWORD = SAMPLE.password;
const HOSTS = SAMPLE.hosts;
const LISTINGS = SAMPLE.listings;

/* -------------------------------------------------------------------- run */

function upsertUser(host: SeedHost): string {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(host.email) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;

  const id = newId("usr");
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, university, bio,
                        avatar_initials, verified, rating, review_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    host.email,
    host.name,
    hashPassword(PASSWORD),
    host.university,
    host.bio,
    initialsFor(host.name),
    host.verified ? 1 : 0,
    host.rating,
    host.reviewCount,
    nowIso(),
  );
  const settings = new ScreenSettings(id);
  settings.payload.university = host.university;
  settings.storeData();
  return id;
}

function wipeSeed(): void {
  console.log("  --force: clearing existing listings and accounts…");
  transaction(() => {
    // Listing/photo/pricing/etc. rows cascade from users and listings.
    db.exec("DELETE FROM reports");
    db.exec("DELETE FROM messages");
    db.exec("DELETE FROM conversation_state");
    db.exec("DELETE FROM conversations");
    db.exec("DELETE FROM saved_listings");
    db.exec("DELETE FROM swipes");
    db.exec("DELETE FROM listing_amenities");
    db.exec("DELETE FROM photos");
    db.exec("DELETE FROM pricing");
    db.exec("DELETE FROM room_details");
    db.exec("DELETE FROM listings");
    db.exec("DELETE FROM screen_settings");
    db.exec("DELETE FROM users");
  });
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const existing = db.prepare("SELECT COUNT(*) AS n FROM listings").get() as { n: number };

  if (existing.n > 0 && !force) {
    console.log(
      `\n  Database already has ${existing.n} listing(s). ` +
        "Nothing to do — pass --force to wipe and re-seed.\n",
    );
    return;
  }
  if (force) wipeSeed();

  console.log("\n  Seeding SubletU…\n");

  const hostIds = new Map<string, string>();
  for (const host of HOSTS) hostIds.set(host.key, upsertUser(host));

  // A ready-to-use demo account, plus one more renter so threads have two sides.
  const demoId = upsertUser({
    key: "demo",
    email: "demo@syr.edu",
    name: "Demo Student",
    university: "Syracuse University",
    bio: "Looking for a summer sublet close to campus. Clean, quiet, no pets.",
    verified: true,
    rating: 0,
    reviewCount: 0,
  });
  const renterId = upsertUser({
    key: "renter",
    email: "lwalsh@syr.edu",
    name: "Liam Walsh",
    university: "Syracuse University",
    bio: "Sophomore in Whitman. Summer internship downtown, need something on a bus line.",
    verified: true,
    rating: 0,
    reviewCount: 0,
  });

  console.log(`  ${HOSTS.length} hosts + 2 renter accounts ready.`);
  console.log(`  Geocoding ${LISTINGS.length} addresses against OpenStreetMap (1 req/sec)…\n`);

  let geocoded = 0;
  let fellBack = 0;

  for (const seed of LISTINGS) {
    const ownerId = hostIds.get(seed.host);
    if (!ownerId) throw new Error(`Unknown host key "${seed.host}"`);

    const point = await geocodeAddress(seed.address, seed.city, seed.state);
    if (point) geocoded += 1;
    else fellBack += 1;

    const listingId = newId("lst");
    const createdAt = new Date(Date.now() - LISTINGS.indexOf(seed) * 7_200_000).toISOString();

    const listing = new ListingData({
      listingId,
      ownerId,
      title: seed.title,
      address: seed.address,
      city: seed.city,
      state: seed.state,
      zip: seed.zip,
      description: seed.description,
      lat: point?.lat ?? seed.fallback.lat,
      lng: point?.lng ?? seed.fallback.lng,
      geocodeSource: point ? "nominatim" : "seed_fallback",
      status: "active",
      createdAt,
      updatedAt: createdAt,
      photoData: seed.photos.map((url, i) => PhotoData.fromRemoteUrl(listingId, url, i)),
      pricingData: new PricingData({
        listingId,
        monthlyRent: seed.monthlyRent,
        availableFrom: seed.availableFrom,
        availableTo: seed.availableTo,
        utilitiesIncluded: seed.utilitiesIncluded,
        deposit: seed.deposit,
      }),
      roomDetails: new RoomDetails({
        listingId,
        bedrooms: seed.bedrooms,
        bathrooms: seed.bathrooms,
        maxRoommates: seed.maxRoommates,
        petsAllowed: seed.petsAllowed,
        furnished: seed.furnished,
        privateBath: seed.privateBath,
      }),
      amenities: seed.amenities,
    });

    const problems = listing.validateData();
    if (problems.length > 0) {
      console.error(`  ✗ ${seed.title}: ${problems.join("; ")}`);
      continue;
    }

    transaction(() => listing.storeData());
    const label = point ? "geocoded" : "fallback";
    console.log(
      `  ✓ ${seed.address.padEnd(22)} $${String(seed.monthlyRent).padEnd(5)} ` +
        `${listing.lat?.toFixed(5)}, ${listing.lng?.toFixed(5)}  (${label})`,
    );
  }

  // Two conversations so the Messages tab has something real in it.
  const firstTwo = db
    .prepare("SELECT id, owner_id FROM listings ORDER BY created_at LIMIT 2")
    .all() as Array<{ id: string; owner_id: string }>;

  transaction(() => {
    const openers = [
      {
        from: demoId,
        text: "Hi! Is this still available for the full summer? I'd be the only person staying.",
        reply: "It is — the dates on the listing are accurate. Want to set up a video walkthrough this week?",
      },
      {
        from: renterId,
        text: "Hey — does the rent really cover all utilities, including AC in July?",
        reply: "Yep, everything's included. My July bill was the same as February's.",
      },
    ];

    firstTwo.forEach((listing, i) => {
      const convoId = newId("cnv");
      const t0 = new Date(Date.now() - (i + 1) * 3_600_000).toISOString();
      const t1 = new Date(Date.now() - (i + 1) * 3_000_000).toISOString();
      db.prepare(
        `INSERT INTO conversations (id, listing_id, guest_id, host_id, created_at, last_message_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(convoId, listing.id, openers[i].from, listing.owner_id, t0, t1);
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(newId("msg"), convoId, openers[i].from, openers[i].text, t0);
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(newId("msg"), convoId, listing.owner_id, openers[i].reply, t1);
    });
  });

  const total = db.prepare("SELECT COUNT(*) AS n FROM listings").get() as { n: number };
  console.log(`\n  Done. ${total.n} listings — ${geocoded} geocoded live, ${fellBack} from fallback.`);
  console.log(`  Demo login:  demo@syr.edu / ${PASSWORD}`);
  console.log(`  Host login:  amansour@syr.edu / ${PASSWORD}  (has listings to manage)\n`);
}

main()
  .catch((err) => {
    console.error("\n  Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
