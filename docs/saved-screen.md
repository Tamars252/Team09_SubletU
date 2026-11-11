# Saved Screen (TM09-101)

The Saved tab: the listings a renter has kept, newest save first, with a per-card
unsave. It reads the existing `/api/saved` endpoints — TM09-101 changed no server
code.

---

## Overview

| | |
| --- | --- |
| Route | `/saved`, inside `ProtectedRoute` → `AppShell` |
| Nav | "Saved" item in the bottom tab bar, signed-in only |
| API | `GET /api/saved`, `DELETE /api/saved/:listingId` (unchanged) |
| Styling | Existing `theme.css` classes; four new rules, no new tokens |
| Tests | `web/test/saved.test.ts` (`node:test`, no DOM library) |

---

## Data flow

```
BottomNav ──navigates──▶ /saved
                          │
                          ▼
            ProtectedRoute          guardDecision() — signed out ⇒ /signin
                          │
                          ▼
                   AppShell          header · <Outlet/> · BottomNav
                          │
                          ▼
              screens/Saved.tsx      loading / error+Retry / empty / list
                   │          ▲
     api.saved()   │          │  sortBySavedAt(), beginRemove(),
     api.unsave()  │          │  rollbackRemove(), card formatters
                   ▼          │
            api/client.ts ────┴──── lib/saved.ts   (pure, no React, no fetch)
                   │
                   ▼
          GET  /api/saved          → { results: Listing[] }, newest save first
          DELETE /api/saved/:id    → { ok: true, saved: false }
```

**Load.** `Saved` calls `api.saved()` on mount. The server already orders newest
first and already drops listings a host removed, but the screen re-sorts with
`sortBySavedAt()` because it also re-renders lists it has changed locally, and
because an ordering the UI promises should not depend on the server remembering
to keep it. A `stale` flag drops the response of a request that was superseded.

**Unsave.** The card is removed from state *before* the DELETE goes out
(`beginRemove`). On success nothing more happens. On failure `rollbackRemove`
puts the card back at its original index and an error banner appears above the
list. Rollback is a no-op if the id is already present, so a reload that landed
mid-flight cannot duplicate the card.

**Persistence.** Nothing is cached in the browser. Every mount re-reads
`/api/saved`, and the route is keyed to the bearer token, so a refresh or a sign
out and back in shows the same list, and two accounts never see each other's
saves.

---

## Components and modules

| File | What it is |
| --- | --- |
| `web/src/lib/saved.ts` | **Pure logic.** `sortBySavedAt`, `savedAtTime`, `beginRemove`, `rollbackRemove`, `isUnavailable`, `unavailableLabel`, `primaryPhotoUrl`, `formatRent`, `hasRent`, `formatLocation`, `formatDay`, `formatAvailability`, `listingDetailPath`. No React, no `fetch`, no clock — this is what the tests exercise. |
| `web/src/screens/Saved.tsx` | The screen. Holds `useState`/`useEffect` and JSX only; every decision comes from `lib/saved.ts`. Contains the `SavedCard` row. |
| `web/src/components/BottomNav.tsx` | The tab bar. `NAV_ITEMS` is the whole configuration — add a screen by adding a row. |
| `web/src/components/SaveButton.tsx` | Reusable save toggle (exported). Not wired into any card yet; see below. |
| `web/src/components/AppShell.tsx` | The signed-in layout, lifted out of `App.tsx` so Saved could sit beside Browse under one header and nav. Owns the filter state and exposes it through `useShell()`. |
| `web/src/screens/Browse.tsx` | The old `AppShell` body from `App.tsx`, moved unchanged. |
| `web/src/App.tsx` | Routes only. |
| `web/src/auth/guard.ts` | `SAVED_PATH` added beside the existing path constants. |
| `web/src/api/client.ts` | `save()` / `unsave()` return types widened to `{ ok, saved }`, matching `docs/api-contract.md`. No behaviour change. |

### Why `SaveButton` is not the unsave control on this screen

They are different interactions. `SaveButton` is a **toggle in place** — it calls
the API and then reports the new state, which is what a swipe card or a detail
screen wants. The Saved screen instead needs **optimistic removal from a list**:
the card must disappear before the response arrives and come back if it fails.
Routing that through a toggle would mean the button owning list state it cannot
see. So `SaveButton` is exported and ready (AC4) while the Saved screen uses
`beginRemove` / `rollbackRemove` directly (AC3).

### Styling

Reuses `.nav` / `.nav-item` / `.list-card` / `.list-thumb` / `.list-body` /
`.list-price` / `.list-title` / `.chip.outline` / `.banner.error` /
`.center-state` / `.spinner` / `.icon-btn`, all already in `theme.css`. Four new
rules were added in a `saved` section — `.saved-list`, `.saved-cards`,
`.saved-card`, `.saved-unsave`, plus one `align-self` override. **No new design
tokens**, so `docs/style-guide.md` is unaffected.

A card with no photo falls back to the `.list-thumb` gradient rather than a
broken image.

---

## Known dependency: the listing detail screen

Cards link to `listingDetailPath(id)` → `/listings/:id`, mirroring
`GET /listings/:id` in `docs/api-contract.md`.

**The web listing-detail screen is a separate story and is not on `main`.** Until
it lands, `/listings/:id` matches no route, falls through `App.tsx`'s `*`
catch-all, and redirects to `/`. Tapping a saved card therefore lands on Browse,
not on a detail view. This is deliberate — no placeholder screen and no disabled
card. When the detail story lands, the only change needed here is the single
`listingDetailPath()` function in `web/src/lib/saved.ts`.

---

## How to run the tests

```bash
npm test          # server + web
npm run typecheck # server + web

npm test --workspace web          # web only — includes web/test/saved.test.ts
```

`web/test/saved.test.ts` uses `node:test` and `node:assert/strict` only. There is
no DOM testing library in this repo and TM09-101 did not add one, which is why
the screen's logic lives in `lib/saved.ts`. Dates are formatted by reading the
`YYYY-MM-DD` string rather than building a `Date`, so the tests give the same
result in any timezone and on Windows and macOS alike.

No server test was added: `server/test/routes/savedListings.test.ts` (TM09-149)
already covers per-user isolation, newest-first ordering, removed-listing
omission, and persistence across a restart. Duplicating it would add nothing.

---

## Acceptance criteria

The story lists ten criteria. (There is no AC11 — the documentation task's
"1–11" overcounts by one.)

| AC | What it says | Proven by |
| --- | --- | --- |
| 1 | "Saved" in the bottom nav, signed-in only, routes to `/saved` inside `ProtectedRoute` | `web/src/components/BottomNav.tsx` (`NAV_ITEMS`); `web/src/App.tsx:21-26` (nested inside `ProtectedRoute` → `AppShell`) |
| 2 | Loads `GET /api/saved`; photo or placeholder, title, rent, city/address, dates, newest saved first | `web/src/screens/Saved.tsx` (`load`, `SavedCard`); `lib/saved.ts` (`sortBySavedAt`, `primaryPhotoUrl`, `formatRent`, `formatLocation`, `formatAvailability`); tests `sortBySavedAt: newest save first` + `card fields` |
| 3 | Unsave per card; optimistic removal with rollback and a visible error on failure | `web/src/screens/Saved.tsx` (`unsave`); `lib/saved.ts` (`beginRemove`, `rollbackRemove`); tests `beginRemove / rollbackRemove: optimistic unsave` |
| 4 | Reusable `SaveButton`, exported, not required to be wired into cards that don't exist | `web/src/components/SaveButton.tsx`; see "Why SaveButton is not the unsave control" above |
| 5 | Persists across refresh and sign out/in; users can't see each other's saves | No client-side cache — `Saved.tsx` re-reads on every mount; server-side proven by `server/test/routes/savedListings.test.ts:186` (isolation), `:162` (restart). **No new server test**, per the no-duplication rule |
| 6 | Empty state with a message and a button to `/` | `web/src/screens/Saved.tsx` (`state.listings.length === 0` branch) |
| 7 | Loading and error states with Retry | `web/src/screens/Saved.tsx` (`loading` and `error` branches; `load` is the Retry handler) |
| 8 | Unavailable listings omitted or marked, without crashing | Server drops `removed` (`server/src/routes/saved.ts:21`); `pending` / `inactive` get a chip via `unavailableLabel`; tests `availability`. `pricing`/`photos`/`savedAt` all have fallbacks, so a partial listing renders rather than throwing |
| 9 | Card navigates to the detail route if one exists, else the contract's route pattern, with the dependency noted | `lib/saved.ts` (`listingDetailPath`); test `listingDetailPath`; "Known dependency" section above |
| 10 | `node:test` tests for the pure logic; no DOM library; `npm test` and `npm run typecheck` pass | `web/test/saved.test.ts` — 25 cases over `lib/saved.ts`; see "How to run the tests" |
