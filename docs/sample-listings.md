# Sample listing data

**Story:** TM09-134 · Sample listing data for Syracuse

> ⚠️ **FICTIONAL SAMPLE DATA — TM09-134. Every host, listing, price and contact detail below is invented for demos and automated testing. Street addresses use real Syracuse streets so map pins geocode to the right block, but the house numbers, people, photos and prices do not describe real rentals or real people. Do not treat anything here as a genuine offer to sublet.**

The dataset is [`server/seed-data/sample-listings.json`](../server/seed-data/sample-listings.json).
`server/src/seed.ts` loads it, and `npm run validate:sample` checks it. This page is
**generated** from the same file by `npm run docs:sample` — edit the JSON, re-run that, and
commit both. Do not hand-edit this page.

It is not under `server/data/`: that directory is gitignored because it holds the runtime
SQLite database, so a dataset written there would never be committed.

## At a glance

| | |
| --- | --- |
| Listings | **24** |
| Hosts | 8 |
| Rent range | $495 – $1,240 / month |
| Bedrooms | Studio, 1 bed, 2 bed, 3 bed, 4 bed, 5 bed, 6 bed |
| Bathrooms | 1, 1.5, 2, 3, 4 |
| Photos per listing | 3–5 (93 total) |
| Availability | 2026-05-10 → 2026-08-31 |
| Streets | 20 across University Hill and Westcott |

Every listing has a price, an availability start and end date, a bedroom and bathroom count,
and at least two photos. Photos are recorded as hosted URLs — `PhotoData.fromRemoteUrl` stores
the URL and nothing else, so neither seeding nor testing ever downloads an image.

## Bedroom mix

A studio plus every count from 1 to 4 is present, so the bedroom filter has something to return
at each setting.

| Type | Listings | Rent |
| --- | --- | --- |
| Studio | 2 | $675 – $820 |
| 1 bed | 5 | $545 – $1,150 |
| 2 bed | 6 | $700 – $1,240 |
| 3 bed | 4 | $640 – $700 |
| 4 bed | 4 | $585 – $1,050 |
| 5 bed | 2 | $495 – $575 |
| 6 bed | 1 | $510 |

## Price tiers

Three populated tiers, so price filtering can be tested at each end and in the middle.

| Tier | Range | Listings |
| --- | --- | --- |
| budget | $0 – $599 | 6 |
| mid | $600 – $899 | 14 |
| premium | $900 and up | 4 |

## Streets

Addresses sit on University Hill and Westcott streets only. House numbers are real so the
addresses geocode to the right block — the **listings** at them are invented.

| Street | Listings |
| --- | --- |
| Ackerman Ave | 2 |
| Comstock Ave | 2 |
| University Ave | 2 |
| Walnut Ave | 2 |
| Beech St | 1 |
| Clarendon St | 1 |
| Dell St | 1 |
| E Genesee St | 1 |
| Euclid Ave | 1 |
| Harrison St | 1 |
| Lancaster Ave | 1 |
| Livingston Ave | 1 |
| Marshall St | 1 |
| Maryland Ave | 1 |
| Ostrom Ave | 1 |
| Redfield Pl | 1 |
| Roosevelt Ave | 1 |
| Stratford St | 1 |
| Sumner Ave | 1 |
| Westcott St | 1 |

Also allowed by the validator but unused right now: S Crouse Ave.

## Hosts

Fictional accounts on the reserved `example.edu` domain. The shared password is
`sublet123`.

| Host | Email | Listings |
| --- | --- | --- |
| Aisha Mansour | `amansour@example.edu` | 3 |
| Devon Carter | `dcarter@example.edu` | 3 |
| Priya Nair | `pnair@example.edu` | 3 |
| Marcus Okafor | `mokafor@example.edu` | 3 |
| Hannah Lindqvist | `hlindqvist@example.edu` | 3 |
| Tyler Brennan | `tbrennan@example.edu` | 3 |
| Sofia Reyes | `sreyes@example.edu` | 3 |
| Jordan Kim | `jkim@example.edu` | 3 |

The `demo@syr.edu` and `lwalsh@syr.edu` renter accounts are created by the seeder itself, not
by this file; they are the demo logins documented in [`auth-screens.md`](auth-screens.md).

## Seeding

```bash
npm run seed              # seeds the dataset; skips if listings already exist
npm run seed -- --force   # wipes seeded data and re-seeds
```

Seeding geocodes every address against OpenStreetMap at roughly one request per second, so a
full run takes about half a minute. Each listing carries `fallback` coordinates, so the seed
still completes offline — the pins just come from the file instead of Nominatim.

## Validating

```bash
npm run validate:sample                      # the committed dataset
npm run validate:sample -- path/to/file.json # any other file
```

The validator reads the JSON and nothing else — no database, no network — and exits non-zero on
any problem. It checks:

- at least 20 listings (there are 24)
- every required field present, with the right type
- availability dates are `YYYY-MM-DD` and start strictly before they end
- bedrooms an integer 0–12, bathrooms a number 0.5–12
- at least two photos each, every one a distinct `https` URL
- a studio and each of 1–4 bedrooms present
- at least three price tiers in use
- every address on the allowed University Hill / Westcott street list
- every listing pointing at a host that exists
- the `sampleData` marker and the fictional-data notice

`server/test/data/sampleListings.test.ts` runs it against the real file and against broken
copies, so the rules stay honest.
