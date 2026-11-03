# ADR-002: Rewrite the prototype as an Express + SQLite API and a React front end

**Story:** SCRUM-48 · Sprint 5 · Tareq Haque
**Status:** Accepted
**Builds on:** [ADR-001](adr-001-stack.md), which chose this stack in principle
**Amended:** 2026-11-03 — the prototype has been removed from the working tree, reversing
the SCRUM-50 decision recorded under *Consequences*. It remains reachable in history at
`36d1774` and earlier.

## Context

Sprints 3 and 4 produced a working prototype: one HTML file, a swipeable deck, sample
listings, reporting, hosted auth with Google OAuth, persisted saves, and a messages tab
with swipe-to-archive. Usability testing in Sprint 5
([usability-findings.md](usability-findings.md)) confirmed the interaction design was
right.

It cannot become the product, for three reasons.

**1. The class diagram is not implemented.** This is the binding one. The prototype has no
`Data`, no `ListingData`, no `ListingManager`. Validation is inline in event handlers and
the schema lives in a hosted console. There is nothing to point at and say "this is
`validateData()`", and nothing to unit test.

**2. One file does not scale.** The prototype was ~436 KB of markup, CSS and
JavaScript in a single document. Two people cannot work in it without conflicting on
every commit, and by the end of Sprint 4 the fix commits were visibly fighting each other
over card height and gesture handling.

**3. The prototype's own fixes had outgrown it.** Sprint 3's `a776070` (button clicks
interfering with swipes) and Sprint 4's card-sizing fixes were patches to a gesture
handler that needed to be a component with a real state machine.

The question for this ADR is not *which stack* — ADR-001 settled that — but **whether to
migrate incrementally or rewrite**, and what to carry across.

## Decision

**Rewrite, in one repository with two npm workspaces, and carry the design across rather
than the code.**

```
SubletU/
├── server/    Express + SQLite API (TypeScript, no build step)
└── web/       React + Vite front end (TypeScript)
```

Sequenced so the API is finished before the front end starts:

| Sprint | Work |
| --- | --- |
| 5 | Workspaces, archive the prototype, write the API contract |
| 6 | Domain layer + SQLite schema — the class diagram in code |
| 7 | REST API on top of the domain layer |
| 8–9 | React front end against the finished API |

### What is carried across

- **The design tokens.** Terracotta `#D4603A` on cream `#FBF8F4`, Fraunces for display and
  Inter for body move verbatim into `theme.css`. The visual identity was settled in
  Sprint 2 and tested in Sprints 3–5; re-deciding it would be waste.
- **The interaction model.** Six tabs, right-swipe-to-save, report outside the card,
  per-user archive — all validated by testing and all re-implemented, not re-litigated.
- **The seed content.** Real Syracuse addresses, upgraded from authored coordinates to
  geocoded ones.

### What is discarded

- All prototype JavaScript
- The hosted BaaS integration, including the Google OAuth wiring
- The prototype's schema

## Options considered

### Incremental migration — strangler pattern

Stand up the API behind the existing prototype, replacing one tab at a time.

**Rejected.** The strangler pattern pays off when the legacy system is large, in
production, and has users who cannot be interrupted. None of that holds: the prototype
has no real users, and the thing we are migrating *away from* is a single file whose
coupling is the actual problem. Running both would mean maintaining two data models and
two auth paths across several sprints, for a system that could be rewritten in two.

### Keep the BaaS, rewrite only the front end

Tempting — it preserves Sprint 4's work and the OAuth flow.

**Rejected** on the same ground as ADR-001: it leaves the data model in a hosted console,
so the class diagram still is not implemented in code. It also keeps a free-tier
dependency that can be paused for inactivity between the last sprint and the final demo.

### Rewrite both, two separate repositories

**Rejected.** Two repos means two clones, two PR streams and version skew between the API
types and the client that consumes them. The acceptance criteria for SCRUM-49 — one
`npm install` at the root, one `npm run dev` starting both, one `npm run typecheck`
covering both — are only achievable in one repo.

## Consequences

**Good**

- The domain layer is a one-to-one translation of the diagram: one file per class, real
  `extends` relationships, `ListingData` genuinely composing `PhotoData`, `PricingData`
  and `RoomDetails`, with validation cascading into each
- The validation logic became unit-testable, which is what made Sprint 10 possible at all
- One `npm install` at the root installs both workspaces; `npm run dev` starts the API on
  `:4000` and the front end on `:5173` with Vite proxying `/api` and `/uploads`, so
  development is same-origin
- Shared TypeScript types between client and server, so a contract change breaks the
  typecheck rather than production
- Runtime dependencies reduced to `express`, `cors`, `react`, `react-dom` and `maplibre-gl`;
  env loading, validation, JWTs, hashing and encryption are all standard library
- No hosted service and no API key anywhere in the stack

**Bad / accepted**

- **Sprint 3–4 implementation work is written off.** Four sprints of product behaviour are
  rebuilt. Accepted because the prototype's deliverable was *knowledge*, and the knowledge
  transferred intact.
- Auth is now ours: scrypt password hashing and HS256 session tokens, written against
  `node:crypto`. Google OAuth is lost and institutional SSO becomes a Sprint 11 story.
- The front end has to be rebuilt tab by tab across Sprints 8–9, and some gesture bugs
  recur in the new implementation before the deck is stable again.
- Server TypeScript runs through Node's type-stripping with no build step, which forbids
  parameter properties and enums. `erasableSyntaxOnly` in `server/tsconfig.json` enforces
  this so the restriction fails at typecheck rather than at runtime.

## Implementation notes

- **No build step for the server.** Node 22.6+ runs TypeScript directly, so the API is
  `node src/index.ts`.
- **SQLite via `node:sqlite`** — no native module to compile.
- **Passwords** are scrypt-hashed; sessions are HS256 JWTs. Login returns an identical
  error for an unknown email and a wrong password, so it cannot be used to enumerate
  accounts.
- **Deleting a listing is a soft delete** (`status = 'removed'`) so existing conversations
  keep working for both parties. See [ERD.md](ERD.md).
- **Photos** are downscaled to a 1600 px long edge in the browser before upload; the server
  independently enforces `MAX_PHOTO_BYTES`. The client half implements
  `PhotoData.compressPhoto()` from the diagram; the server half is the authority.
- **The prototype has been removed from the working tree.** It was kept at
  `legacy/prototype.html` under SCRUM-50 while the rewrite was in progress; now that the
  rewrite is done the repository carries no prototype material outside history. The last
  commit containing it is `36d1774`. The swipe deck and the screens it demonstrated are
  rebuilt on the React scaffold rather than ported.
