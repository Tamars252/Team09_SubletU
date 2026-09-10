# SubletU

Student sublet marketplace — swipe through listings, see them on a live map, and
message the person who actually lives there.

Built from the SubletU class diagram (`Class Diagram1.pdf` / `classDiagram.vpp`)
and the design of the original single-file prototype, now at
`legacy/prototype.html`.

```
SubletU/
├── server/          Express + SQLite API (TypeScript, no build step)
├── web/             React + Vite front end (TypeScript)
├── legacy/          the original single-file prototype, kept for reference
└── classDiagram.vpp Visual Paradigm model the domain layer implements
```

## Quick start

```bash
npm install
```

```bash
npm run seed
```

```bash
npm run dev
```

Then open **http://localhost:5173** and sign in with the seeded demo account:

| Account            | Password     | What it's for                        |
| ------------------ | ------------ | ------------------------------------ |
| `demo@syr.edu`     | `sublet123`  | Renter view — deck, saved, messages  |
| `amansour@syr.edu` | `sublet123`  | Host view — has listings to manage   |

`npm run dev` starts the API on `:4000` and the front end on `:5173`, with Vite
proxying `/api` and `/uploads` so everything is same-origin in development.

Other scripts:

```bash
npm run seed -- --force   # wipe and re-seed
npm run typecheck         # tsc --noEmit across both workspaces
npm run build             # production front-end bundle into web/dist
npm start                 # serve API + built front end from :4000 alone
```

## The map and the listing data are real

- **Basemap** — MapLibre GL rendering OpenStreetMap raster tiles. No API key,
  no account, no billing setup.
- **Geocoding** — every address is forward-geocoded through
  [Nominatim](https://nominatim.openstreetmap.org). Results are cached in the
  `geocache` table and requests are serialized to one per second to stay inside
  the usage policy. When you post a listing, its pin is placed from the street
  address you typed.
- **Seed listings** — 24 sublets at real addresses in the Syracuse University
  neighborhood (University Hill, Westcott, Outer Comstock, Downtown). All 24
  geocode to their actual coordinates; OSM matches several by building name.
  `npm run seed` prints the coordinate it resolved for each one.
- **Distances** — great-circle distance from the campus anchor, so "0.4 mi to
  campus" and the walk-time estimates are computed, not authored.

To use a different tile provider, change the `tiles` URL in `createOsmStyle()`
in [web/src/components/MapCanvas.tsx](web/src/components/MapCanvas.tsx).

## How the class diagram maps onto the code

Each class in the diagram is a real class in
[server/src/domain/](server/src/domain), and the generalizations are real
`extends` relationships.

| Diagram class    | File                                                             | Notes                                                                    |
| ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `Data`           | [Data.ts](server/src/domain/Data.ts)                             | Abstract base: `validateData()`, `storeData()`, `retrieveData()`          |
| `ListingData`    | [ListingData.ts](server/src/domain/ListingData.ts)               | Also implements `sortData()` and `filterData()`                          |
| `PhotoData`      | [PhotoData.ts](server/src/domain/PhotoData.ts)                   | `compressPhoto()` — browser downscales, server enforces the byte budget  |
| `PricingData`    | [PricingData.ts](server/src/domain/PricingData.ts)               | Rent, availability window, utilities                                     |
| `RoomDetails`    | [RoomDetails.ts](server/src/domain/RoomDetails.ts)               | Beds, baths, roommates, pets                                             |
| `ScreenSettings` | [ScreenSettings.ts](server/src/domain/ScreenSettings.ts)         | `encryptData()` / `decryptData()` — AES-256-GCM over the preferences blob |
| `ListingManager` | [ListingManager.ts](server/src/domain/ListingManager.ts)         | `validateListing`, `submitListing`, `retrieveListing`, `updateListing`, `deleteListing`; carries `operationStatus` |
| `PostListingScreen` / `Screen` | [web/src/screens/Post.tsx](web/src/screens/Post.tsx) | The screen classes became React components                               |

`ListingData` composes `PhotoData`, `PricingData` and `RoomDetails` exactly as
the diagram shows, and validation cascades: `ListingData.validateData()` calls
into each composed object's own `validateData()`.

## API

All routes are under `/api`. Authenticated routes take
`Authorization: Bearer <token>`.

**Auth** — `POST /auth/register`, `POST /auth/login`, `GET /auth/me`,
`PATCH /auth/me`, `POST /auth/password`

**Listings** — `GET /listings` (filter + sort), `GET /listings/deck` (swipe
queue), `GET /listings/mine` (with save/like/inquiry counts),
`GET /listings/:id`, `POST /listings`, `PATCH /listings/:id`,
`DELETE /listings/:id`, `POST /listings/:id/photos`,
`DELETE /listings/:id/photos/:photoId`

**Swipes** — `POST /swipes`, `POST /swipes/undo`, `DELETE /swipes` (reset
browsing), `GET /swipes/stats`

**Saved** — `GET /saved`, `POST /saved`, `DELETE /saved/:listingId`

**Messages** — `POST /messages/conversations`, `GET /messages/conversations`,
`GET /messages/conversations/:id/messages`,
`POST /messages/conversations/:id/messages`,
`POST /messages/conversations/:id/archive`, `GET /messages/unread-count`

**Other** — `POST /reports`, `GET|PUT /settings`, `GET /geo/search`,
`GET /geo/campuses`, `GET /reference`, `GET /health`

`GET /listings` accepts `q`, `minPrice`, `maxPrice`, `minBedrooms`,
`minBathrooms`, `petsAllowed`, `furnished`, `utilitiesIncluded`, `amenities`
(comma-separated), `availableFrom`, `availableTo`, `lat`/`lng`, `radiusMiles`,
`bbox`, `campus`, `sort`, `limit`, `offset`. Availability filtering is an
overlap test, so a listing matches if its window intersects the one you asked
for.

## Front end

Six tabs, matching the prototype: **Browse** (swipe deck), **Map**, **Post**,
**Saved**, **Messages**, **Profile**.

- **Swiping** uses pointer events, so it works with touch, mouse and trackpad.
  Drag past ~96 px or flick fast to commit; right saves, left passes. There's a
  rewind button for the last swipe, and a report button. Tapping a card — or
  hitting Enter on it — opens the full listing.
- **Right-swipe = save.** The deck, the Saved tab and the map's saved state all
  read from the same `swipes` / `saved_listings` tables, so they can't disagree.
- **Messages** supports swipe-left-to-archive per user, so archiving a thread
  doesn't hide it from the other party.
- **Photos** are downscaled to a 1600 px long edge in a canvas before upload.
- **MapLibre is code-split**, so the swipe deck loads ~218 KB instead of the
  ~1.3 MB the map bundle needs.

Design tokens live in [web/src/styles/theme.css](web/src/styles/theme.css) —
terracotta `#D4603A` on cream `#FBF8F4`, Fraunces for display and Inter for
body, carried over from the prototype.

## Configuration

Copy `server/.env.example` to `server/.env` to change anything; every value has
a working local default.

| Variable                  | Default                        | Purpose                              |
| ------------------------- | ------------------------------ | ------------------------------------ |
| `PORT`                    | `4000`                         | API port                             |
| `CORS_ORIGIN`             | `http://localhost:5173`        | Comma-separated allowed origins      |
| `JWT_SECRET`              | dev placeholder                | Signs session tokens                 |
| `SETTINGS_SECRET`         | dev placeholder                | Encrypts `ScreenSettings` at rest    |
| `DATABASE_FILE`           | `./data/subletu.db`            | SQLite file                          |
| `UPLOAD_DIR`              | `./uploads`                    | Where listing photos are written     |
| `MAX_PHOTO_BYTES`         | `6291456`                      | Per-photo limit                      |
| `NOMINATIM_URL`           | OSM's public endpoint          | Geocoder                             |
| `NOMINATIM_USER_AGENT`    | project string                 | Required by Nominatim's policy       |

The server refuses to start with `NODE_ENV=production` and the default
`JWT_SECRET`.

## Implementation notes

- **No build step for the server.** Node 22.6+ runs TypeScript directly, so the
  API is plain `node src/index.ts`. The code sticks to erasable TypeScript (no
  parameter properties, no enums) which is what type-stripping supports;
  `erasableSyntaxOnly` in `server/tsconfig.json` enforces it.
- **SQLite via `node:sqlite`**, so there is no native module to compile.
- **Passwords** are scrypt-hashed; sessions are HS256 JWTs. Both use
  `node:crypto` directly rather than adding dependencies. Login returns the same
  error for an unknown email and a wrong password so it can't be used to
  enumerate accounts.
- **Deleting a listing is a soft delete** — the row moves to `status = 'removed'`
  so existing conversations keep working for both parties.
- **Runtime dependencies are `express`, `cors`, `react`, `react-dom` and
  `maplibre-gl`.** Everything else — env loading, validation, JWTs, hashing,
  encryption — is standard library.

## Known limits

- Messaging polls for the unread badge every 20 s; there's no websocket layer.
- Host ratings and review counts are seeded values; there's no review flow yet.
- Email addresses ending in `.edu` are auto-marked verified. Real verification
  would need an email round-trip.
- Reports are written to the `reports` table but there's no moderation UI.
- Nominatim is rate-limited to 1 req/s by policy, so seeding 24 addresses takes
  about 25 seconds on a cold cache.
