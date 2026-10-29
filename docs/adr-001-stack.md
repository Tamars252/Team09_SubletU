# ADR-001: Technology stack for the prototype and the final product

**Story:** SCRUM-21 · Sprint 2 · Tamar Shuster
**Status:** Accepted
**Supersedes:** —
**Superseded in part by:** [ADR-002](adr-002-rewrite.md), which executes the move from the
prototype stack to the production stack

## Context

Sprint 3 needs a clickable prototype in front of students fast, and Sprints 6–9 need a
real implementation of the class diagram. Those two goals pull in opposite directions:

- The prototype's job is to **answer design questions** — does swiping feel right on a
  phone, is the card readable, where does the report button belong. It is thrown away.
  Time spent on architecture is time not spent learning.
- The final product's job is to **implement the class diagram** as graded coursework:
  `Data`, `ListingData`, `PricingData`, `RoomDetails`, `PhotoData`, `ScreenSettings` and
  `ListingManager` have to exist as real classes with the methods the diagram shows.

Three hard constraints apply to both:

1. **No paid API keys** (NFR-4.1). Four students on a course project cannot put a credit
   card behind a map provider, and a key that expires mid-semester breaks the demo.
2. **Must run on a teammate's laptop from a clean clone**, on Windows and macOS, without
   Docker or a native toolchain.
3. **Mobile-first.** The product is used standing outside a house on a phone.

## Decision

**Use two different stacks, deliberately, and plan the handover between them.**

### Prototype (Sprints 3–4): single HTML file + hosted BaaS

One `index.html` with inline CSS and JavaScript, no build step, backed by a
backend-as-a-service for auth and data.

- Opens by double-clicking the file; a tester needs no toolchain
- Auth, database and OAuth come for free, so Sprint 4 can wire real sign-in and persisted
  saves without writing a server
- Being one file makes it trivially shareable for usability testing

### Final product (Sprints 5–12): own API + React front end

- **API:** Node + Express, TypeScript
- **Database:** SQLite through `node:sqlite`
- **Front end:** React + Vite, TypeScript
- **Map:** MapLibre GL rendering OpenStreetMap raster tiles
- **Geocoding:** Nominatim

## Options considered

### Backend: hosted BaaS vs. our own API

| | Hosted BaaS | Own Express API |
| --- | --- | --- |
| Time to first working feature | Hours | Days |
| Auth, OAuth, row-level security | Built in | Hand-written |
| Implements the class diagram | **No** — the schema lives in a web console, not in classes | **Yes** — one file per diagram class |
| Works offline / on a plane | No | Yes |
| Free tier risk | Project can be paused for inactivity | None |
| Graded artefact | A configuration screenshot | Source code |

The deciding factor is the course requirement. A BaaS puts the data model in a hosted
console, where there is no `ListingData` class to point at and no `validateData()` to
test. That is fatal for the final product and irrelevant for the prototype — hence the
split.

### Database: SQLite vs. hosted Postgres

Postgres is the better production database and the wrong choice here. A hosted instance
reintroduces the free-tier and network dependency we just rejected; a local one means
every teammate installs and runs a server before the app starts.

SQLite via `node:sqlite` is in Node's standard library from 22.6, so the database is a
file in the repo's ignore list with **no native module to compile** — the thing most
likely to break a clean clone on Windows. `better-sqlite3` was rejected for exactly that
reason: it needs a C++ toolchain.

The cost is accepted honestly: one writer at a time, no concurrent-user story. For a
course project with a demo audience, this does not bind.

### Front end: React + Vite vs. keeping vanilla JS vs. Next.js

Vanilla JS carried the prototype well but has no component model; the Post screen alone
is a large stateful form, and the class diagram's screen classes map naturally onto
components.

Next.js brings routing, SSR and a build pipeline we do not need — this is an
authenticated app behind a login, so there is nothing to server-render for SEO, and SSR
actively complicates a token-based session.

Vite gives fast HMR, a dev proxy that makes `/api` same-origin in development (so no CORS
in the common path), and a plain static bundle the API can serve itself in production.

### Map provider — the constraint that eliminated most options

| Provider | Key required | Verdict |
| --- | --- | --- |
| Google Maps | Yes, billing account | **Rejected** — violates NFR-4.1 |
| Mapbox GL JS | Yes, free tier metered | **Rejected** — key and quota |
| Leaflet + OSM tiles | No | Viable; raster only, older API |
| **MapLibre GL + OSM raster tiles** | **No** | **Chosen** |

MapLibre is the open fork of Mapbox GL JS from before its licence change. It renders
OpenStreetMap raster tiles with no account, no key and no billing setup, and its style
object is swappable, so changing tile providers later is a one-line change in
`createOsmStyle()`.

Its weight (~1 MB) is the one real cost, which is why it is loaded through a lazy
code-split boundary rather than in the main bundle (NFR-3.2).

### Geocoding

Nominatim, OpenStreetMap's own geocoder, is free and keyless. Its usage policy caps
requests at one per second and requires an identifying User-Agent, so the client
serialises requests through a throttle queue and caches every result in the `geocache`
table. Addresses are geocoded once, at seed or post time — never per page view.

## Consequences

**Good**

- The prototype reached testers in Sprint 3 instead of Sprint 6
- The final product's domain layer is a direct, demonstrable translation of the class diagram
- `npm install && npm run dev` works from a clean clone, no services, no keys, no native build
- The whole system runs offline once the geocode cache is warm
- Zero running cost, nothing to expire before the final demo

**Bad / accepted**

- **The prototype's backend work is discarded.** Sprint 4's auth and persistence wiring is
  learning, not inventory. This is the cost of the two-stack decision and is accepted
  openly — see ADR-002.
- Auth, validation and encryption are hand-written, so they are ours to get right. Mitigated
  by using `node:crypto` primitives directly rather than inventing cryptography, and by the
  Sprint 10 test suite.
- SQLite's single-writer model rules out real concurrent load.
- MapLibre is a large dependency carried for two screens.

**Follow-ups**

- ADR-002 records the actual migration decision at the end of Sprint 5
- The prototype is kept at `legacy/prototype.html` rather than deleted (SCRUM-50), so the
  design decisions it settled stay inspectable
