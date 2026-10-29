# API contract

**Story:** SCRUM-51 · Sprint 5 · Team Member 4

Every endpoint the front end needs, with request and response shapes. Written in Sprint 5
so Sprint 7 could build the API and Sprints 8–9 could build the front end against a
settled contract.

**Scope:** this is the Sprint 7 surface. Institutional SSO, email verification and
password reset are Sprint 11 stories (FR-1.6, FR-1.7, FR-1.8) and are **not** part of this
contract — they extend `/api/auth` later.

## Conventions

- **Base path:** `/api`. In development Vite proxies `/api` and `/uploads` to the API on
  `:4000`, so the browser is same-origin. In production the API serves the built front end
  itself.
- **Content type:** `application/json` both ways, except photo uploads, which post a
  base64 data URL inside a JSON body (the JSON body limit is raised to 14 MB for this).
- **Authentication:** `Authorization: Bearer <token>`. Tokens are HS256 JWTs issued by
  `/auth/register` and `/auth/login`.
- **Timestamps** are ISO 8601 strings in UTC. **Dates** (availability) are `YYYY-MM-DD`.
- **Ids** are opaque prefixed strings — `usr_…`, `lst_…`, `pho_…`. Never assume a format
  or an ordering.
- **Booleans** are real JSON booleans in responses, even though SQLite stores 0/1.

### Errors

```json
{ "error": "Human-readable message", "problems": ["field: what is wrong"] }
```

`problems` is present when a validation failure has per-field detail — it is the array
returned by the domain layer's `validateData()`.

| Status | Meaning |
| --- | --- |
| `400` | Malformed request or bad JSON |
| `401` | Missing, expired or invalid token |
| `403` | Authenticated but not allowed (e.g. editing someone else's listing) |
| `404` | No such resource |
| `409` | Conflict (e.g. email already registered) |
| `422` | Validation failed — check `problems` |
| `429` | Rate limited |
| `500` | Unhandled server error |

`401` and `404` are deliberately indistinguishable in some places: asking for a listing
that does not exist and one you may not see return the same thing.

## Objects

### `User`

```json
{
  "id": "usr_qU6e2MD3U-lk",
  "email": "demo@syr.edu",
  "name": "Demo Student",
  "university": "Syracuse University",
  "bio": "",
  "avatarInitials": "DS",
  "verified": true,
  "rating": 4.8,
  "reviewCount": 12,
  "createdAt": "2026-01-14T18:02:11.000Z"
}
```

Never includes `password_hash`. A user object for *another* party (a listing owner, a
message sender) is the same shape minus `email`.

### `Listing`

```json
{
  "id": "lst_juzbXr0aVGB_",
  "ownerId": "usr_qU6e2MD3U-lk",
  "title": "5BR on Sumner Ave near South Campus buses",
  "address": "812 Sumner Ave",
  "city": "Syracuse",
  "state": "NY",
  "zip": "13210",
  "description": "Five-bedroom house one block from the South Campus bus loop…",
  "lat": 43.0360864,
  "lng": -76.1257342,
  "geocodeSource": "nominatim",
  "status": "active",
  "distanceMiles": 0.62,
  "amenities": ["WiFi", "Laundry In-Unit", "Parking"],
  "pricing": {
    "monthlyRent": 495,
    "availableFrom": "2026-05-15",
    "availableTo": "2026-08-15",
    "utilitiesIncluded": true,
    "deposit": 495
  },
  "roomDetails": {
    "bedrooms": 5,
    "bathrooms": 2,
    "maxRoommates": 4,
    "petsAllowed": false,
    "furnished": true,
    "privateBath": false
  },
  "photos": [
    { "photoId": "pho_8sT1…", "fileUrl": "/uploads/lst_juzbXr0aVGB_/pho_8sT1….jpg",
      "fileSize": 184320, "sortOrder": 0, "uploadTimestamp": "2026-10-28T00:28:34.547Z" }
  ],
  "owner": { "id": "usr_…", "name": "Daniel R.", "avatarInitials": "DR", "verified": true, "rating": 4.9 },
  "createdAt": "2026-10-28T00:28:34.547Z",
  "updatedAt": "2026-10-28T00:28:34.547Z"
}
```

- `distanceMiles` is **computed** from `lat`/`lng` against the campus anchor, never
  authored (FR-4.3). It is `null` when the listing has not been geocoded, and is rounded
  to two decimal places.
- `geocodeSource` is `nominatim`, `fallback` or `pending`.
- `pricing` and `roomDetails` are `null` on a listing whose composed records are missing —
  clients must not assume they are present.
- `saved` is added to this object on endpoints that know who is asking.

## Filter parameters

Accepted by `GET /listings` and `GET /listings/deck`. All optional; unknown parameters are
ignored.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `q` | string | Free-text match on title, address and description |
| `minPrice`, `maxPrice` | number | Monthly rent bounds, inclusive |
| `minBedrooms` | integer | At least this many bedrooms |
| `minBathrooms` | number | At least this many bathrooms (halves allowed) |
| `petsAllowed` | boolean | Only listings that allow pets |
| `furnished` | boolean | Only furnished listings |
| `utilitiesIncluded` | boolean | Only listings including utilities |
| `amenities` | string | Comma-separated; a listing must have **all** of them |
| `availableFrom`, `availableTo` | date | **Overlap** test — see below |
| `lat`, `lng` | number | Centre point for distance filtering |
| `radiusMiles` | number | Great-circle radius around `lat`/`lng` |
| `bbox` | string | `minLng,minLat,maxLng,maxLat` — for map viewport queries |
| `campus` | string | Named campus anchor; defaults to the user's university |
| `sort` | enum | `newest` (default), `price_asc`, `price_desc`, `distance`, `available_soonest` |
| `limit`, `offset` | integer | Paging. `limit` defaults to 60, caps at 200 |

**Availability is an overlap test, not a start-date match** (FR-3.2). A listing matches if
its window intersects the requested one at all — a sublet running May 15 → Aug 15 matches
a search for June 1 → July 31. Matching on start date would hide almost every useful
listing, which is finding F-6 in [usability-findings.md](usability-findings.md).

---

## Auth — `/api/auth`

### `POST /auth/register`

```json
{ "email": "student@syr.edu", "password": "…", "name": "Maya O.",
  "university": "Syracuse University", "bio": "" }
```

`email` 5–254 chars, `password` 8–200, `name` 2–80. `university` and `bio` optional.
An address on a `.edu` domain is marked `verified` (Sprint 11 replaces this with a real
email round-trip).

**`201`** → `{ "token": "<jwt>", "user": User }` · **`409`** email already registered ·
**`422`** validation failed

### `POST /auth/login`

```json
{ "email": "demo@syr.edu", "password": "sublet123" }
```

**`200`** → `{ "token": "<jwt>", "user": User }` · **`401`** → `{ "error": "Invalid email or password" }`

An unknown email and a wrong password return the **identical** 401, so the endpoint cannot
be used to discover which addresses have accounts (NFR-1.2).

### `GET /auth/me` · auth required

**`200`** → `{ "user": User }` · **`401`** no or bad token

### `PATCH /auth/me` · auth required

```json
{ "name": "Maya Okafor", "bio": "BME '27", "university": "Syracuse University" }
```

All fields optional; omitted fields keep their value. Email is not editable.

**`200`** → `{ "user": User }`

### `POST /auth/password` · auth required

```json
{ "currentPassword": "…", "newPassword": "…" }
```

`newPassword` 8–200. **`200`** → `{ "ok": true }` · **`401`** current password wrong

---

## Listings — `/api/listings`

### `GET /listings` · auth optional

Filtered, sorted browse. Takes every filter parameter above.

**`200`**

```json
{ "total": 15, "results": [ { "…Listing": "…", "saved": false } ] }
```

`total` is the match count before paging. `saved` is present only when the request carries
a token.

### `GET /listings/deck` · auth required

The swipe queue: active listings, excluding the caller's own and anything they have
already swiped (FR-2.2). Accepts the same filters. `limit` defaults to 25, caps at 60.
Defaults to distance order rather than newest.

**`200`** → `{ "remaining": 23, "results": [ Listing ] }`

`remaining` is how many are left after filtering — it drives the empty-deck state.

### `GET /listings/mine` · auth required

The caller's own listings, including removed ones, each with engagement counts for the
host (FR-5.7).

**`200`** → `{ "results": [ { "…Listing": "…", "saveCount": 4, "likeCount": 6, "inquiryCount": 2 } ] }`

### `GET /listings/:id` · auth optional

**`200`** → `{ "listing": { "…Listing": "…", "saved": false } }` · **`404`** not found or removed

### `POST /listings` · auth required

```json
{
  "title": "Sunny room on Ackerman",
  "address": "910 Ackerman Ave", "city": "Syracuse", "state": "NY", "zip": "13210",
  "description": "…",
  "pricing": { "monthlyRent": 575, "availableFrom": "2026-05-15",
               "availableTo": "2026-08-15", "utilitiesIncluded": true, "deposit": 575 },
  "roomDetails": { "bedrooms": 1, "bathrooms": 1, "maxRoommates": 2,
                   "petsAllowed": false, "furnished": true, "privateBath": false },
  "amenities": ["WiFi", "Laundry On-Site"],
  "photos": ["data:image/jpeg;base64,…"]
}
```

Goes through `ListingManager.submitListing()`, so validation cascades through
`PricingData`, `RoomDetails` and `PhotoData`. The address is geocoded server-side — the
client never sends coordinates (FR-4.2).

**`201`** → `{ "message": "…", "listing": Listing }` · **`422`** → `{ "error": "…", "problems": [...] }`

### `PATCH /listings/:id` · auth required, owner only

Same body, all fields optional. The address is re-geocoded **only if it changed**, so
editing a price does not consume a geocoder request.

**`200`** → `{ "message": "…", "listing": Listing }` · **`403`** not the owner · **`422`** validation failed

### `DELETE /listings/:id` · auth required, owner only

**Soft delete** — sets `status = 'removed'` so existing conversations keep working
(FR-5.6).

**`200`** → `{ "message": "Listing removed" }` · **`403`** not the owner

### `POST /listings/:id/photos` · auth required, owner only

```json
{ "photo": "data:image/jpeg;base64,…" }
```

Rejects anything over `MAX_PHOTO_BYTES` (default 6 MB) or outside the MIME whitelist. The
browser downscales to a 1600 px long edge first; the server is still the authority.

**`201`** → `{ "photo": { "photoId": "pho_…", "fileUrl": "/uploads/…", "fileSize": 184320,
"sortOrder": 2, "uploadTimestamp": "…" } }` · **`422`** too large or wrong type

### `DELETE /listings/:id/photos/:photoId` · auth required, owner only

Removes the row and the file on disk. **`200`** → `{ "ok": true }`

---

## Swipes — `/api/swipes`

### `POST /swipes` · auth required

```json
{ "listingId": "lst_…", "direction": "right" }
```

`direction` is `left` or `right`. **A right swipe saves the listing** — the deck, the
Saved tab and the map all read the same tables, so they cannot disagree (FR-6.4).
Re-swiping the same listing updates the existing verdict rather than duplicating it.

**`201`** → `{ "ok": true, "direction": "right", "saved": true, "remaining": 23 }`

### `POST /swipes/undo` · auth required

Reverses the most recent swipe, and unsaves it if it was a right swipe (FR-2.5).

**`200`** → `{ "ok": true, "listing": Listing }` — the restored card, so the UI can put it
back — or `{ "ok": false, "message": "Nothing to undo" }` when there is nothing to undo.

### `DELETE /swipes` · auth required

Resets browsing history so the whole deck returns (FR-2.6). Optional query
`?keepSaved=true` clears the pass history but leaves saved listings alone.

**`200`** → `{ "ok": true, "keptSaved": true }`

### `GET /swipes/stats` · auth required

**`200`** → `{ "likes": 12, "passes": 31, "total": 43, "remaining": 5 }`

---

## Saved — `/api/saved`

### `GET /saved` · auth required

**`200`** → `{ "results": [ Listing ] }`, newest save first.

### `POST /saved` · auth required

```json
{ "listingId": "lst_…" }
```

Idempotent — saving twice does not duplicate (FR-6.3).

**`201`** → `{ "ok": true, "saved": true }`

### `DELETE /saved/:listingId` · auth required

**`200`** → `{ "ok": true, "saved": false }`

---

## Messages — `/api/messages`

### `POST /messages/conversations` · auth required

```json
{ "listingId": "lst_…", "body": "Hi — is this still available for June?" }
```

Starts or reuses the thread for this renter and listing — `UNIQUE (listing_id, guest_id)`
guarantees one thread per pair, so an inquiry always lands in the same place.

**`201`** (new) or **`200`** (existing) → `{ "conversationId": "cnv_…" }`

### `GET /messages/conversations` · auth required

Query `?archived=true` for the archived list; defaults to the inbox.

**`200`**

```json
{ "results": [ {
  "id": "cnv_…", "listingId": "lst_…", "listingTitle": "…", "listingStatus": "active",
  "listingPhoto": "/uploads/…", "monthlyRent": 575,
  "role": "guest", "other": { "id": "usr_…", "name": "Daniel R." },
  "lastMessage": "…", "lastMessageAt": "…", "unread": 2, "archived": false
} ] }
```

### `GET /messages/conversations/:id/messages` · auth required, participant only

**`200`**

```json
{
  "conversation": { "id": "cnv_…", "listingId": "lst_…", "role": "guest", "listing": Listing },
  "results": [ { "id": "msg_…", "senderId": "usr_…", "body": "…",
                 "createdAt": "…", "readAt": null } ]
}
```

Oldest first. Reading a thread marks the other party's messages read.

### `POST /messages/conversations/:id/messages` · auth required, participant only

```json
{ "body": "Yes, still open." }
```

**`201`** → the created message

### `POST /messages/conversations/:id/archive` · auth required, participant only

```json
{ "archived": true }
```

Writes to `conversation_state`, which is keyed per `(conversation, user)`. **Archiving
hides the thread only for the caller** (FR-7.5) — finding F-4.

**`200`** → `{ "ok": true, "archived": true }`

### `GET /messages/unread-count` · auth required

**`200`** → `{ "unread": 3 }`. Polled for the tab badge; there is no websocket layer
(FR-7.6 is a Could).

---

## Reports — `/api/reports`

### `POST /reports` · auth required

```json
{ "listingId": "lst_…", "reason": "Suspected scam", "details": "Asked for a deposit over Venmo…" }
```

**`201`** → `{ "ok": true, "message": "Thanks — our team will review this listing." }`

### `GET /reports/reasons`

**`200`** → `{ "reasons": ["Suspected scam", "Inaccurate listing", "Inappropriate content",
"Already rented", "Discriminatory language", "Other"] }`

---

## Settings — `/api/settings`

### `GET /settings` · auth required

**`200`** → `{ "settings": { "font": "Inter", "color": "#D4603A", "theme": "light",
"widthPx": 430, "heightPx": 932, "notifications": { … } } }`

Display columns are stored plainly; the private preferences payload is encrypted at rest
with AES-256-GCM and returns defaults if the blob is missing or has been tampered with
(NFR-1.5).

### `PUT /settings` · auth required

Same shape. **`200`** → `{ "settings": { … } }` · **`422`** → `{ "error": "Settings were not saved", "problems": [...] }`

---

## Geo — `/api/geo`

### `GET /geo/search?q=…`

Place-name search through Nominatim, for recentring the map.

**`200`** → `{ "results": [ { "name": "Westcott, Syracuse", "lat": 43.0416, "lng": -76.1196 } ] }` ·
**`503`** → `{ "error": "Place search is temporarily unavailable", "results": [] }` when the
geocoder is unreachable — the UI degrades instead of breaking.

Requests are serialised to one per second and cached in `geocache`, per OSM's usage policy
(NFR-4.3).

### `GET /geo/campuses`

**`200`** → `{ "campuses": [ { "name": "Syracuse University", "lat": 43.0392, "lng": -76.1351 } ] }`

---

## Reference — `/api/reference`

One call for every enumeration the UI needs, so option lists cannot drift between client
and server.

**`200`**

```json
{
  "amenities": ["WiFi", "Laundry In-Unit", "Laundry On-Site", "Dishwasher", "Parking",
                "Gym Access", "Pool", "Furnished", "Pet Friendly", "AC", "Heating", "Balcony"],
  "universities": ["Syracuse University", "Boston University", "NYU", "Columbia University"],
  "reportReasons": ["Suspected scam", "…"],
  "sorts": [ { "value": "distance", "label": "Closest to campus" } ]
}
```

---

## Health — `/api/health`

Unauthenticated liveness check.

**`200`** → `{ "ok": true, "service": "subletu-api", "activeListings": 24, "users": 10,
"time": "2026-10-29T14:29:08.089Z" }`

---

## Shared types

The request and response shapes above are declared once as TypeScript types and imported
by both workspaces, so a contract change fails `npm run typecheck` rather than reaching
runtime. The front end consumes them through a single typed client rather than calling
`fetch` from components.
