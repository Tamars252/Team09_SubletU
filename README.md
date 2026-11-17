# SubletU

A sublet marketplace for students: swipe through listings near campus, save the ones you
like, and message the student who actually lives there.

CIS 453 · Team 09. The domain layer is a class-for-class implementation of the team's
Visual Paradigm class diagram. The [table below](#class-diagram-to-code) maps each class
to its file.

## Requirements

- **Node.js 22.18 or newer.** The server runs its `.ts` files directly, with no build
  step, and Node only does that without a flag from 22.18. It also uses the built-in
  `node:sqlite`. Check with `node --version`. Node 24 works too.
- npm 10 or newer (ships with Node).
- Nothing else: no database server, no API keys, no accounts.

## Quick start

```bash
git clone https://github.com/Tamars252/Team09_SubletU.git
cd Team09_SubletU
npm install
npm run seed
npm run dev
```

Open **<http://localhost:5173>** and sign in with a demo account:

| Account | Password | Use it to |
| --- | --- | --- |
| `demo@syr.edu` | `sublet123` | browse, swipe and save as a renter |
| `amansour@example.edu` | `sublet123` | manage listings as a host |

What those commands do:

- `npm install` installs both workspaces (`server/` and `web/`) from the root.
- `npm run seed` creates `server/data/subletu.db`, applies the schema migrations and adds
  10 accounts and 24 listings at real addresses near Syracuse University. It geocodes each
  address with OpenStreetMap at one request per second, so the first run takes about
  25 seconds. Offline, it uses stored coordinates instead; the `lookup failed` lines it
  prints then are expected.
- `npm run dev` starts the API on **:4000** and the web app on **:5173**. Vite forwards
  `/api` and `/uploads` to the API, so the browser only ever talks to one origin.

No `.env` file is needed for local development. Every setting has a working default (see
[Configuration](#configuration)).

### If something goes wrong

| Symptom | Fix |
| --- | --- |
| `Unknown file extension ".ts"` or `No such built-in module: node:sqlite` | Node is older than 22.18. Upgrade it. |
| `EADDRINUSE` on 4000 or 5173 | Another program has the port. Find it with `lsof -i :4000` and stop it. (Changing `PORT` alone breaks the dev proxy, which expects :4000.) |
| Sign-in fails with the demo account | The database was not seeded. Run `npm run seed`. |
| The data is in a strange state | `npm run db:reset` deletes the database and seeds a fresh one. |

## Scripts

All run from the repository root.

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :4000 and web app on :5173, both reloading on change |
| `npm run seed` | Seed an empty database. `npm run seed -- --force` wipes and re-seeds |
| `npm run db:migrate` | Apply pending schema migrations and report what ran |
| `npm run db:reset` | Delete the database and build a fresh seeded one. Refuses in production |
| `npm test` | Server and web test suites (`node:test`, no extra framework) |
| `npm run typecheck` | `tsc --noEmit` in both workspaces |
| `npm run build` | Production bundle of the web app into `web/dist` |
| `npm start` | API only. Also serves `web/dist` on :4000 if it has been built |
| `npm run validate:sample` | Check `server/seed-data/sample-listings.json` against its rules |
| `npm run docs:sample` | Regenerate `docs/sample-listings.md` from that file |

To run the production build locally: `npm run build && npm start`, then open
<http://localhost:4000>.

## Architecture

```text
Team09_SubletU/
├── server/                  Express + SQLite API, TypeScript run directly by Node
│   ├── src/domain/          the class-diagram classes (see the table below)
│   ├── src/routes/          one file per resource: auth, listings, swipes, saved, messages…
│   ├── src/lib/             crypto, geocoding, HTTP helpers, rate limiting
│   ├── src/migrations.ts    versioned schema, applied on startup
│   ├── seed-data/           the sample listings
│   └── test/                server tests
├── web/                     React + Vite front end, TypeScript
│   ├── src/screens/         one component per screen
│   ├── src/components/      shared UI, including AppShell and the bottom nav
│   ├── src/lib/             each screen's logic, kept free of React so it can be tested
│   ├── src/api/             the typed client every screen goes through
│   └── test/                web tests
├── docs/                    requirements, API contract, ERD, ADRs, usability findings
├── classDiagram.vpp         Visual Paradigm model: the class diagram
├── UseCase.vpp              Visual Paradigm model: use cases and CRC cards
└── Class Diagram1.pdf       PDF export of the class diagram
```

A request goes **browser → Vite dev server → Express route → domain class → SQLite**.
Routes stay thin: they parse the request and call the domain layer, which owns validation
and persistence. Listing work goes through `ListingManager`, so its validation and
geocoding rules live in one place. The database is a single file opened with
`node:sqlite`, so there is no native module to compile.

The reasoning behind these choices is in [ADR-001](docs/adr-001-stack.md) (the stack) and
[ADR-002](docs/adr-002-rewrite.md) (rewriting the prototype).

## Class diagram to code

Every class in `classDiagram.vpp` (Class Diagram1), and where it lives.
`server/test/docs/readme.test.ts` fails if a class is added to the model without a row
here, or if a file below goes missing.

| Class | Code | Operations in the code |
| --- | --- | --- |
| `Data` | [server/src/domain/Data.ts](server/src/domain/Data.ts) | Abstract class: `validateData()`, `storeData()`, `retrieveData()` |
| `ListingData` | [server/src/domain/ListingData.ts](server/src/domain/ListingData.ts) | `validateData()`, `storeData()`, `retrieveData()`, `sortData()`, `filterData()` |
| `PhotoData` | [server/src/domain/PhotoData.ts](server/src/domain/PhotoData.ts), [web/src/lib/compressPhoto.ts](web/src/lib/compressPhoto.ts) | `validateData()`, `storeData()`, `retrieveData()`. `CompressPhoto()` is split: the browser downscales to a 1600 px long edge (`compressPhoto()`), and the server enforces `MAX_PHOTO_BYTES` (`PhotoData.decodeDataUrl()`) |
| `PricingData` | [server/src/domain/PricingData.ts](server/src/domain/PricingData.ts) | `validateData()`, `storeData()`, `retrieveData()` |
| `RoomDetails` | [server/src/domain/RoomDetails.ts](server/src/domain/RoomDetails.ts) | `validateData()`, `storeData()`, `retrieveData()` |
| `ScreenSettings` | [server/src/domain/ScreenSettings.ts](server/src/domain/ScreenSettings.ts) | `validateData()`, `storeData()`, `retrieveData()`, `encryptData()`, `decryptData()`. The private preferences are AES-256-GCM encrypted in `screen_settings.payload_enc` |
| `ListingManager` | [server/src/domain/ListingManager.ts](server/src/domain/ListingManager.ts) | `validateListing()`, `submitListing()`, `retrieveListing()`, `updateListing()`, `deleteListing()`; `operationStatus` records the last outcome |
| `Screen` | [web/src/components/AppShell.tsx](web/src/components/AppShell.tsx), [web/src/App.tsx](web/src/App.tsx) | Each screen is a React component. `screenTitle` is the shell's header; `ShowScreen()` and `DismissScreen()` are routing (the routes in `App.tsx`, the links in `BottomNav.tsx`). `LoadSettings()` is not wired up yet: `GET /api/settings` exists, but no screen reads it |
| `PostListingScreen` | [web/src/screens/Post.tsx](web/src/screens/Post.tsx), [web/src/lib/postListing.ts](web/src/lib/postListing.ts) | `InitializeScreen()` is the empty draft (`EMPTY_DRAFT`); `DisplayScreen()` is the component's render; `ValidateInput()` is `validateDraft()`; `UploadPhotos()` is `addPhotos()`; `SetPricingAvailability()` and `SpecifyRoomDetails()` are the "Price and dates" and "The room" sections; `SubmitListing()` is `onSubmit()`, which posts to `ListingManager.submitListing()` |

### Relationships

- **Generalization.** `ListingData`, `PhotoData`, `PricingData` and `RoomDetails` each
  `extends Data`. `PostListingScreen` specializes `Screen` as one of the screens rendered
  inside the shell.
- **Composition.** `ListingData` holds a `PricingData`, a `RoomDetails` and its
  `PhotoData`s, and validation cascades: `ListingData.validateData()` collects the
  problems from each part's own `validateData()`.
- **Dependencies.** `PostListingScreen` → `ListingManager` (through
  `POST /api/listings`), and `ListingManager` → `ListingData`.

### Where the code and the model differ

- `ScreenSettings extends Data` in the code. The model gives it the same three operations
  but no generalization arrow from `Data`.
- In the model, the `ScreenSettings` attribute meant to be `width : Pixels` is named
  `width Pixels`: the colon is missing, so the type became part of the name.
- The tables carry columns the diagram does not show yet, such as `pricing.deposit`,
  `room_details.furnished`, `room_details.private_bath` and `listings.lat`/`lng`. See
  [ERD.md](docs/ERD.md).

## Visual Paradigm models

| File | What is in it |
| --- | --- |
| `classDiagram.vpp` | Class Diagram1: the nine classes in the table above. The source of truth for the class table |
| `UseCase.vpp` | Use Case Diagram1, CRC Card Diagram SubletU, the Document1 report, and a copy of Class Diagram1 with the same nine classes |
| `Class Diagram1.pdf` | A PDF export of Class Diagram1, for reading without Visual Paradigm |

Open the `.vpp` files with Visual Paradigm (the free Community Edition opens them).

Working with them:

- They are binary files (SQLite databases inside), so git cannot merge two people's edits.
  Agree on who is editing a model, then commit and push it before anyone else opens it.
- Visual Paradigm writes `*.vpp.bak` backups next to the file. Those are gitignored; only
  the `.vpp` itself is committed.
- After changing classes, export the PDF again and update the table above. The README
  test fails until every class in the model has a row.

## API

All routes are under `/api` and exchange JSON. Signed-in routes take
`Authorization: Bearer <token>`. The full request and response shapes, error codes and
filter parameters are in **[docs/api-contract.md](docs/api-contract.md)**.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`, `POST /auth/password` |
| Listings | `GET /listings`, `GET /listings/deck`, `GET /listings/mine`, `GET /listings/:id`, `POST /listings`, `PATCH /listings/:id`, `DELETE /listings/:id`, `POST /listings/:id/photos`, `DELETE /listings/:id/photos/:photoId` |
| Swipes | `POST /swipes`, `POST /swipes/undo`, `DELETE /swipes`, `GET /swipes/stats` |
| Saved | `GET /saved`, `POST /saved`, `DELETE /saved/:listingId` |
| Messages | `POST /messages/conversations`, `GET /messages/conversations`, `GET /messages/conversations/:id/messages`, `POST /messages/conversations/:id/messages`, `POST /messages/conversations/:id/archive`, `GET /messages/unread-count` |
| Other | `POST /reports`, `GET /reports/reasons`, `GET` and `PUT /settings`, `GET /geo/search`, `GET /geo/campuses`, `GET /reference`, `GET /health` |

## Configuration

To change a setting, copy `server/.env.example` to `server/.env` and edit it.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated origins allowed to call the API |
| `JWT_SECRET` | development placeholder | Signs session tokens |
| `JWT_TTL_HOURS` | `720` | How long a session lasts |
| `SETTINGS_SECRET` | development placeholder | Encrypts `ScreenSettings` preferences at rest |
| `DATABASE_FILE` | `./data/subletu.db` | The SQLite file, relative to `server/` |
| `UPLOAD_DIR` | `./uploads` | Where listing photos are written |
| `MAX_PHOTO_BYTES` | `6291456` (6 MB) | Largest photo the server accepts |
| `NOMINATIM_URL` | OpenStreetMap's public server | Geocoder |
| `NOMINATIM_USER_AGENT` | project string | Required by Nominatim's usage policy |

With `NODE_ENV=production`, the server refuses to start while either secret still has
its development default.

## Tests

```bash
npm run typecheck && npm test
```

Both suites use Node's built-in test runner, so there is no test framework to install.
Server tests run each file against its own throwaway database
(`server/test/helpers/env.ts`) and drive the real Express app over a socket. Web tests
cover the logic in `web/src/lib/`.

## Documentation

| Document | What it covers |
| --- | --- |
| [requirements.md](docs/requirements.md) | Functional and non-functional requirements, with priorities |
| [personas.md](docs/personas.md) | The problem and the two student personas |
| [api-contract.md](docs/api-contract.md) | Every endpoint's request and response |
| [database-schema.md](docs/database-schema.md) | Tables, columns, migrations |
| [ERD.md](docs/ERD.md) | The data model and the soft-delete decision |
| [domain-value-objects.md](docs/domain-value-objects.md) | `PricingData`, `RoomDetails` and `PhotoData` |
| [adr-001-stack.md](docs/adr-001-stack.md), [adr-002-rewrite.md](docs/adr-002-rewrite.md) | Architecture decisions |
| [usability-findings.md](docs/usability-findings.md) | What prototype testing found, and what changed because of it |
| [style-guide.md](docs/style-guide.md) | Colours, type and components |
| [auth-screens.md](docs/auth-screens.md), [saved-screen.md](docs/saved-screen.md) | Notes on individual screens |
| [sample-listings.md](docs/sample-listings.md) | The seed data, generated by `npm run docs:sample` |
| [jira-setup.md](docs/jira-setup.md) | How the Jira board and its evidence rule work |

## Contributing

Work on a branch and open a pull request into `main`. Run
`npm run typecheck && npm test` before pushing, and link the pull request in the Jira
story's final worklog ([jira-setup.md](docs/jira-setup.md)).
