/**
 * TM09-134: writes docs/sample-listings.md from the sample dataset.
 *
 *     npm run docs:sample
 *
 * Generated rather than hand-written so the summary cannot drift from the data
 * it describes. Re-run it after editing the JSON and commit both together.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_STREETS,
  loadSampleListings,
  PRICE_TIERS,
  streetOf,
} from "../src/lib/sampleListings.ts";
import type { SampleListing } from "../src/lib/sampleListings.ts";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(REPO_ROOT, "docs", "sample-listings.md");

const data = loadSampleListings();
const listings = data.listings;

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const bedLabel = (n: number) => (n === 0 ? "Studio" : `${n} bed`);

/** Counts values, returned highest-first then by key. */
function tally<T>(items: T[], key: (item: T) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const rents = listings.map((l) => l.monthlyRent);
const bedCounts = [...new Set(listings.map((l) => l.bedrooms))].sort((a, b) => a - b);
const bathValues = [...new Set(listings.map((l) => l.bathrooms))].sort((a, b) => a - b);
const photoCounts = listings.map((l) => l.photos.length);
const starts = listings.map((l) => l.availableFrom).sort();
const ends = listings.map((l) => l.availableTo).sort();
const streets = tally(listings, (l: SampleListing) => streetOf(l.address) ?? l.address);

const bedRows = bedCounts
  .map((n) => {
    const of = listings.filter((l) => l.bedrooms === n);
    const low = Math.min(...of.map((l) => l.monthlyRent));
    const high = Math.max(...of.map((l) => l.monthlyRent));
    const range = low === high ? money(low) : `${money(low)} – ${money(high)}`;
    return `| ${bedLabel(n)} | ${of.length} | ${range} |`;
  })
  .join("\n");

const tierRows = PRICE_TIERS.map((tier) => {
  const of = listings.filter((l) => l.monthlyRent >= tier.min && l.monthlyRent <= tier.max);
  const bound =
    tier.max === Infinity ? `${money(tier.min)} and up` : `${money(tier.min)} – ${money(tier.max)}`;
  return `| ${tier.name} | ${bound} | ${of.length} |`;
}).join("\n");

const streetRows = streets.map(([street, n]) => `| ${street} | ${n} |`).join("\n");

const hostRows = data.hosts
  .map((h) => {
    const n = listings.filter((l) => l.host === h.key).length;
    return `| ${h.name} | \`${h.email}\` | ${n} |`;
  })
  .join("\n");

const unused = ALLOWED_STREETS.filter((s) => !streets.some(([used]) => used === s));

const md = `# Sample listing data

**Story:** TM09-134 · Sample listing data for Syracuse

> ⚠️ **${data.notice}**

The dataset is [\`server/seed-data/sample-listings.json\`](../server/seed-data/sample-listings.json).
\`server/src/seed.ts\` loads it, and \`npm run validate:sample\` checks it. This page is
**generated** from the same file by \`npm run docs:sample\` — edit the JSON, re-run that, and
commit both. Do not hand-edit this page.

It is not under \`server/data/\`: that directory is gitignored because it holds the runtime
SQLite database, so a dataset written there would never be committed.

## At a glance

| | |
| --- | --- |
| Listings | **${listings.length}** |
| Hosts | ${data.hosts.length} |
| Rent range | ${money(Math.min(...rents))} – ${money(Math.max(...rents))} / month |
| Bedrooms | ${bedCounts.map(bedLabel).join(", ")} |
| Bathrooms | ${bathValues.join(", ")} |
| Photos per listing | ${Math.min(...photoCounts)}–${Math.max(...photoCounts)} (${photoCounts.reduce((a, b) => a + b, 0)} total) |
| Availability | ${starts[0]} → ${ends[ends.length - 1]} |
| Streets | ${streets.length} across University Hill and Westcott |

Every listing has a price, an availability start and end date, a bedroom and bathroom count,
and at least two photos. Photos are recorded as hosted URLs — \`PhotoData.fromRemoteUrl\` stores
the URL and nothing else, so neither seeding nor testing ever downloads an image.

## Bedroom mix

A studio plus every count from 1 to 4 is present, so the bedroom filter has something to return
at each setting.

| Type | Listings | Rent |
| --- | --- | --- |
${bedRows}

## Price tiers

Three populated tiers, so price filtering can be tested at each end and in the middle.

| Tier | Range | Listings |
| --- | --- | --- |
${tierRows}

## Streets

Addresses sit on University Hill and Westcott streets only. House numbers are real so the
addresses geocode to the right block — the **listings** at them are invented.

| Street | Listings |
| --- | --- |
${streetRows}
${
  unused.length > 0
    ? `\nAlso allowed by the validator but unused right now: ${unused.map((s) => `${s}`).join(", ")}.\n`
    : ""
}
## Hosts

Fictional accounts on the reserved \`example.edu\` domain. The shared password is
\`${data.password}\`.

| Host | Email | Listings |
| --- | --- | --- |
${hostRows}

The \`demo@syr.edu\` and \`lwalsh@syr.edu\` renter accounts are created by the seeder itself, not
by this file; they are the demo logins documented in [\`auth-screens.md\`](auth-screens.md).

## Seeding

\`\`\`bash
npm run seed              # seeds the dataset; skips if listings already exist
npm run seed -- --force   # wipes seeded data and re-seeds
\`\`\`

Seeding geocodes every address against OpenStreetMap at roughly one request per second, so a
full run takes about half a minute. Each listing carries \`fallback\` coordinates, so the seed
still completes offline — the pins just come from the file instead of Nominatim.

## Validating

\`\`\`bash
npm run validate:sample                      # the committed dataset
npm run validate:sample -- path/to/file.json # any other file
\`\`\`

The validator reads the JSON and nothing else — no database, no network — and exits non-zero on
any problem. It checks:

- at least 20 listings (there are ${listings.length})
- every required field present, with the right type
- availability dates are \`YYYY-MM-DD\` and start strictly before they end
- bedrooms an integer 0–12, bathrooms a number 0.5–12
- at least two photos each, every one a distinct \`https\` URL
- a studio and each of 1–4 bedrooms present
- at least three price tiers in use
- every address on the allowed University Hill / Westcott street list
- every listing pointing at a host that exists
- the \`sampleData\` marker and the fictional-data notice

\`server/test/data/sampleListings.test.ts\` runs it against the real file and against broken
copies, so the rules stay honest.
`;

fs.writeFileSync(OUT, md, "utf8");
console.log(`\n  Wrote ${path.relative(REPO_ROOT, OUT)} from ${listings.length} listings.\n`);
