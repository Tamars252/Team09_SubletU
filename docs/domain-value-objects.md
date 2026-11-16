# Domain value objects: PricingData, RoomDetails, PhotoData (TM09-114)

The three classes a listing is made of. Each one owns one table, knows its own
rules, and can be written, read back and serialized without help from the
listing that holds it.

---

## Purpose

A listing is not one record. The rent and the availability window change on a
different schedule from the floor plan, and the photos are a list rather than a
row. Splitting them out means:

- **One place per rule.** "Rent must be above $0" lives in `PricingData` and
  nowhere else, so the route, the manager and the seed script cannot disagree
  about it.
- **One table per class.** Each class maps to exactly one table and writes it
  with a single upsert, so a half-saved listing is not a state the schema can
  represent.
- **Validation that composes.** `ListingData.validateData()` returns its own
  problems plus everything its parts report, so the Post form can show a host
  every mistake in one pass instead of one per submit.

---

## Relationships

```
                       Data  (abstract)
          + validateData() : string[]
          + storeData()    : void
          + retrieveData() : boolean
                            │
        ┌───────────────────┼───────────────────┬──────────────────┐
        │                   │                   │                  │
  ListingData         PricingData         RoomDetails         PhotoData
   (listings)          (pricing)         (room_details)        (photos)
        │                   ▲                   ▲                  ▲
        │                   │ 1                 │ 1                │ 0..10
        └───────────────────┴───────────────────┴──────────────────┘
                     composition: a part does not outlive its listing
```

| From | To | Cardinality | Field on `ListingData` |
| --- | --- | --- | --- |
| `ListingData` | `PricingData` | 1 : 1 (nullable in memory) | `pricingData` |
| `ListingData` | `RoomDetails` | 1 : 1 (nullable in memory) | `roomDetails` |
| `ListingData` | `PhotoData` | 1 : N, N ≤ 10 | `photoData[]` |

The two 1:1 fields are `| null` in TypeScript because a listing read from a
database with a missing row still has to be representable — but
`validateData()` reports `"Pricing is required"` / `"Room details are
required"`, so a listing in that state cannot be stored.

Composition is enforced by the schema, not by the code: every child table's
`listing_id` is `REFERENCES listings(id) ON DELETE CASCADE`, and
`PRAGMA foreign_keys = ON` is set in `db.ts`.

Each part keys itself by `listingId`, which is why `PricingData.toJSON()` and
`RoomDetails.toJSON()` leave it out — it is the key of the row, not part of the
payload — and why `fromJSON()` takes it as its first argument.

---

## PricingData → `pricing`

`server/src/domain/PricingData.ts`

| Field | TS type | DB column | Validation rule |
| --- | --- | --- | --- |
| `listingId` | `string` | `listing_id TEXT PRIMARY KEY` → `listings(id)` | Non-blank: `"Listing id is required"` |
| `monthlyRent` | `number` | `monthly_rent REAL NOT NULL` | Finite and `> 0`: `"Monthly rent must be greater than $0"` |
| | | | `≤ 20000`: `"Monthly rent looks unrealistic (over $20,000)"` |
| `availableFrom` | `string` | `available_from TEXT NOT NULL` | Parseable by `new Date()`: `"Available-from is not a valid date"` |
| `availableTo` | `string` | `available_to TEXT NOT NULL` | Parseable: `"Available-to is not a valid date"` |
| | | | Strictly after `availableFrom`: `"Available-to must be after available-from"` |
| `utilitiesIncluded` | `boolean` | `utilities_included INTEGER NOT NULL DEFAULT 0` | — (stored as 1/0) |
| `deposit` | `number` | `deposit REAL NOT NULL DEFAULT 0` | Finite and `≥ 0`: `"Deposit cannot be negative"` |
| | | | `≤ 20000`: `"Deposit looks unrealistic (over $20,000)"` |

A non-finite amount folds into the lower-bound message rather than getting one
of its own: `NaN` is not a rent of zero or more, and saying so twice about one
typo is noise.

`storeData()` is `INSERT … ON CONFLICT(listing_id) DO UPDATE`, so a listing has
exactly one pricing row and the last write wins.

---

## RoomDetails → `room_details`

`server/src/domain/RoomDetails.ts`

| Field | TS type | DB column | Validation rule |
| --- | --- | --- | --- |
| `listingId` | `string` | `listing_id TEXT PRIMARY KEY` → `listings(id)` | Non-blank: `"Listing id is required"` |
| `bedrooms` | `number` | `bedrooms INTEGER NOT NULL DEFAULT 1` | Whole number 0–12: `"Bedrooms must be a whole number between 0 and 12"` |
| `bathrooms` | `number` | `bathrooms REAL NOT NULL DEFAULT 1` | 0.5–12, halves allowed: `"Bathrooms must be between 0.5 and 12"` |
| `maxRoommates` | `number` | `max_roommates INTEGER NOT NULL DEFAULT 0` | Whole number 0–20: `"Max roommates must be a whole number between 0 and 20"` |
| `petsAllowed` | `boolean` | `pets_allowed INTEGER NOT NULL DEFAULT 0` | `typeof === "boolean"`: `"Pets allowed must be true or false"` |
| `furnished` | `boolean` | `furnished INTEGER NOT NULL DEFAULT 0` | `typeof === "boolean"`: `"Furnished must be true or false"` |
| `privateBath` | `boolean` | `private_bath INTEGER NOT NULL DEFAULT 0` | `typeof === "boolean"`: `"Private bath must be true or false"` |

Two boundaries are easy to get backwards: **0 bedrooms is a studio and is
accepted**, while **0 bathrooms is not** — the floor is half a bath. Bedrooms
and roommates must be whole; bathrooms may be fractional (1.5, 2.5).

The three flags are stored as 1/0, so a non-boolean would be coerced on the way
in and read back as something the caller never said. The rule exists for
callers TypeScript does not check: a JSON body, a seed script, a row read back
by hand. It is a `typeof` check rather than a truthiness check precisely so
that `0` is caught.

---

## PhotoData → `photos`

`server/src/domain/PhotoData.ts`

| Field | TS type | DB column | Validation rule |
| --- | --- | --- | --- |
| `photoId` | `string` | `id TEXT PRIMARY KEY` | — (generated by `newId("pho")`) |
| `listingId` | `string` | `listing_id TEXT NOT NULL` → `listings(id)` | Non-blank: `"Listing id is required"` |
| `fileUrl` | `string` | `file_url TEXT NOT NULL` | Non-empty: `"Photo is missing a file URL"` |
| | | | Matches `^(https?:\/\/\|\/uploads\/)`: `"Photo URL must be an http(s) URL or an uploaded file path"` |
| `fileSize` | `number` | `file_size INTEGER NOT NULL DEFAULT 0` | `≥ 0`: `"Photo file size cannot be negative"` |
| | | | `≤ config.maxPhotoBytes`: `"Photo is <n> MB; the limit is <n> MB"` |
| `uploadTimestamp` | `string` | `upload_timestamp TEXT NOT NULL` | — |
| `sortOrder` | `number` | `sort_order INTEGER NOT NULL DEFAULT 0` | — (orders the gallery) |

Unlike the other two, `PhotoData.toJSON()` carries `photoId` — the client needs
it for `DELETE /listings/:id/photos/:photoId` — but still not `listingId`, since
a photo is always serialized inside the listing that owns it.

`storeData()` upserts on `id` and deliberately leaves `listing_id` and
`upload_timestamp` out of the `DO UPDATE SET`: both are facts about where the
photo came from. Letting `listing_id` move would split the row from the bytes
under `UPLOAD_DIR/<listing_id>/`, and would let anyone holding a photo id
reattach someone else's photo to their own listing.

---

## The photo pipeline

```
browser                                     server
───────                                     ──────
canvas downscale (1600px long edge)
JPEG re-encode (quality 0.85)
  │  data:image/jpeg;base64,…
  ▼
POST /api/listings ──▶ express.json limit ──▶ ListingManager
                       jsonBodyLimitBytes          │
                       (maxPhotoBytes × 4/3           │ ≤ 10 photos?
                        + 64 KB)                      ▼
                                             PhotoData.decodeDataUrl()
                                               1. data-URL shape
                                               2. MIME allow-list
                                               3. size ≤ maxPhotoBytes
                                               4. magic bytes
                                               5. declared type == sniffed type
                                                   │  { bytes, ext }
                                                   ▼
                                     listing.validateData() passes?
                                                   │
                                                   ▼
                                             PhotoData.persist()
                                        writes UPLOAD_DIR/<listingId>/<id><ext>
                                                   │  PhotoData (unsaved)
                                                   ▼
                                             PhotoData.storeData()
                                                   │
                                        on failure: discardFile()
```

| Step | Where | Detail |
| --- | --- | --- |
| MIME allow-list | `ALLOWED_MIME` | `image/jpeg` → `.jpg`, `image/png` → `.png`, `image/webp` → `.webp`. Anything else: `PhotoFormatError("unsupported_type")` |
| Size limit | `config.maxPhotoBytes` | `MAX_PHOTO_BYTES`, default **6 MB** (`6 * 1024 * 1024`). Checked on the decoded bytes, before the content check — an over-sized payload is over-sized whatever it turns out to be |
| Body limit | `config.jsonBodyLimitBytes` | Derived as `ceil(maxPhotoBytes * 4 / 3) + 64 KB`, so base64 inflation cannot leave the body limit below the photo limit |
| Magic bytes | `sniffImageType()` | PNG signature, JPEG SOI marker, or RIFF/WEBP container. A `data:` URL's declared type is attacker-controlled, so the bytes have to agree with it — this is what stops an executable arriving as `data:image/png;base64,…` and being served back out of `/uploads` |
| Photo cap | `MAX_PHOTOS_PER_LISTING` in `ListingManager.ts` | **10** per listing, checked on create and again on patch (existing + incoming). `PhotoData` itself does not know about the cap |

Decoding is kept separate from writing on purpose: a photo arrives with a
listing that may still fail validation, and a rejected listing must not leave
an orphaned image behind in `UPLOAD_DIR`. `discardFile()` undoes a half-finished
save and refuses to touch anything outside the upload directory.

Rejections carry a `PhotoRejection` reason (`malformed` / `unsupported_type` /
`too_large`) which the HTTP layer maps to 400 / 415 / 413, so the domain layer
stays free of any HTTP import.

---

## Deserialization

Each class has `static fromJSON()`, the inverse of its own `toJSON()`:

```ts
PricingData.fromJSON(listingId, json)   // json: what PricingData#toJSON() returns
RoomDetails.fromJSON(listingId, json)
PhotoData.fromJSON(listingId, json)
```

All three share `domain/jsonFields.ts`, which collects every problem and throws
one `ValidationError` carrying the whole list:

```
PricingData JSON must be an object
PricingData JSON is missing "monthlyRent"
PricingData JSON field "monthlyRent" must be a number
```

`fromJSON()` deliberately does **not** call `validateData()`. "Is this payload
well-formed" and "may this be stored" are separate questions: a row written
before a rule tightened still has to deserialize, and every store path asks
`validateData()` for itself. A caller that wants both asks for both.

---

## Tests

| File | Tests | Covers |
| --- | --- | --- |
| `server/test/domain/pricingData.test.ts` | 28 | Rent, deposit and date boundaries; upsert; refresh; `chunkIds` batching; `toJSON`/`fromJSON` |
| `server/test/domain/roomDetails.test.ts` | 31 | Bedroom/bathroom/roommate boundaries; non-boolean flags; upsert; refresh; batching; `toJSON`/`fromJSON` |
| `server/test/domain/photoData.test.ts` | 24 | Decode pipeline; URL allow-list; size bounds; upsert immutability of `listing_id`; `toJSON`/`fromJSON` |
| `server/test/domain/listingData.test.ts` | 22 | Validation cascading into all three; `sortData`; `filterData`; availability overlap |
| `server/test/domain/listingManager.test.ts` | 18 | The manager above these classes |
| `server/test/domain/listingPhotos.test.ts` | 6 | Photo add/remove through the manager |
| `server/test/routes/postListingParity.test.ts` | 20 | Every web-form rule against the real `POST /api/listings` |

Totals: **237 server**, **116 web**.

Every server test file imports `test/helpers/env.ts` first, which points the
config at a throwaway SQLite file and sets `MAX_PHOTO_BYTES=4096` so an
"over the limit" photo is a few KB rather than a few MB.

---

## Known limitations

1. **The over-size message rounds to whole megabytes.** `validateData()`
   formats with `toFixed(1)` / `toFixed(0)` directly, so under the test
   config (`MAX_PHOTO_BYTES=4096`) it reads *"the limit is 0 MB"*.
   `photoTooLargeMessage()` elsewhere in the same file uses `humanBytes()` and
   gets this right; the two should be merged.
2. **The HTTP edge still bounds the deposit at $50,000.**
   `routes/listings.ts` passes `{ min: 0, max: 50_000 }`, so a deposit between
   $20,000 and $50,000 is rejected by `PricingData` as a 422 rather than by the
   route as a 400. Both refuse it; only the status code and wording differ.
3. **An unparseable deposit cannot be checked by the parity suite.**
   `Number("abc")` is `NaN`, which `JSON.stringify` writes as `null`, which the
   route reads as "not sent" and defaults to 0. The form catches it, the server
   never sees it, so the case is covered on the web side only.
4. **Date validation is looser in the domain than anywhere else.**
   `PricingData` accepts anything `new Date()` parses, including
   `"March 1 2027"`. `requireDate()` at the route and `isCalendarDate()` in the
   form both insist on `YYYY-MM-DD`, so nothing reaching the class through the
   app is that loose — but a seed script or a test could be.
5. **`fromJSON()` trusts its `listingId` argument.** Only the payload is
   checked. A blank listing id produces an object that `validateData()` will
   reject, which is the intended division of labour, but `fromJSON()` will not
   complain at the time.
6. **The 10-photo cap lives in `ListingManager`, not `PhotoData`.** Calling
   `PhotoData.storeData()` directly would happily write an eleventh row.
7. **A remote photo reports `fileSize` 0.** `fromRemoteUrl()` does not fetch
   the bytes (that would make seeding fail offline), so the size rule never
   constrains a remote image. This is safe only because the limit exists to cap
   what *this* server stores.
8. **`retrieveForListings()` omits ids it found nothing for**, rather than
   mapping them to `null`. Callers use `?? null` / `?? []`; see
   `ListingData.hydrateMany()`.
