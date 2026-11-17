# SubletU database schema

What is actually in the database, how it gets there, and how to change it.
[`ERD.md`](ERD.md) is the picture and the reasoning behind the relationships;
this page is the reference.

The tables below are generated from the DDL a migrated database reports
(`PRAGMA table_info`, `foreign_key_list`, `index_list`), not written from
memory. Regenerate them after adding a migration.

## Driver and pragmas

| | |
|---|---|
| Driver | `node:sqlite`'s `DatabaseSync` — in the standard library from Node 22.5, so there is no native dependency to build. Synchronous, one connection for the process. |
| Node | >= 22.18 (`engines` in the root `package.json`): the first 22.x that runs `.ts` files without a flag |
| File | `DATABASE_FILE`, default `server/data/subletu.db`, resolved relative to `server/` |
| Opened in | [`server/src/db.ts`](../server/src/db.ts) |

Two pragmas run on that connection before anything else, in
`server/src/db.ts`:

| Pragma | Why |
|---|---|
| `journal_mode = WAL` | Readers do not block the writer. It also creates the `-wal` and `-shm` sidecars next to the database file — delete them together with the database or the next connection tries to recover a journal belonging to a file that is gone. |
| `foreign_keys = ON` | SQLite defaults this **off**, per connection. Every `ON DELETE CASCADE` below is inert without it, so it is set before the migrations run and before any query. |

Both have to come first: journal mode cannot be changed inside a transaction,
and `foreign_keys` is a connection setting rather than a stored one.

## Migrations

The schema is an ordered list of migrations in
[`server/src/migrations.ts`](../server/src/migrations.ts), with
`PRAGMA user_version` as the marker for how far a database has got.

| Version | Description |
|---|---|
| 1 | Baseline schema — 14 tables, 9 indexes |
| 2 | `users.token_version` (adds the column when an older database is missing it) |

`runMigrations(db)` applies every migration above the database's
`user_version`, oldest first. Each one runs in its own transaction **together
with its version bump**, so a migration that throws leaves neither its
statements nor the marker behind and the next run retries it from the same
place. The error is re-thrown rather than swallowed: a half-migrated database
is not something to start serving requests on.

`db.ts` calls it at import time, so every module that imports `db` gets a
database that is already current. `runMigrations` takes the database as a
parameter rather than importing `db` — `db.ts` calls it, so importing back
would be a cycle, and the tests migrate throwaway databases of their own.

An existing database created before any of this reports `user_version` 0 with
all its tables already present. Every statement in migration 1 is
`IF NOT EXISTS`, so it is adopted in place rather than rebuilt.

### Adding a migration

1. Append an entry to `migrations` with the next version number.
2. **Never edit a migration that has shipped.** A database that already ran it
   will not run it again, so the edit only ever reaches databases that have not
   seen it — and the two drift apart, silently. Fix a shipped migration with
   another migration.
3. `ALTER TABLE ... ADD COLUMN` has no `IF NOT EXISTS`; use
   `addColumnIfMissing()` so the migration is a no-op where the column is
   already there.
4. Run `npm run db:migrate` and add a case to
   `server/test/data/migrations.test.ts`.

### Commands

| Command | What it does |
|---|---|
| `npm run db:migrate` | Applies pending migrations against `DATABASE_FILE` and prints `user_version <old> -> <new>`. Safe to run on a database that is already current; it applies nothing. |
| `npm run db:reset` | Deletes `DATABASE_FILE` and its `-wal`/`-shm`, migrates from nothing, then seeds. **Destroys data**, and refuses to run under `NODE_ENV=production`. |
| `npm run seed` | Seeds without deleting anything; skips when listings already exist. |

Both accept `DATABASE_FILE`, which is how you try a migration against a copy
of a real database before running it on the real one:

```sh
cp server/data/subletu.db*            /tmp/check/
DATABASE_FILE=/tmp/check/subletu.db   npm run db:migrate
```

## Tables

14 tables, 9 declared indexes. `TEXT` timestamps are ISO-8601
(`new Date().toISOString()`), and SQLite has no boolean type, so a flag is an
`INTEGER` holding 0 or 1. `UNIQUE` rows that name several columns are one
composite constraint, listed against each column it covers.

#### `conversation_state`

| Column | Type | Constraints |
|---|---|---|
| `conversation_id` | TEXT | PK (composite, part 1), FK -> conversations(id) ON DELETE CASCADE |
| `user_id` | TEXT | PK (composite, part 2), FK -> users(id) ON DELETE CASCADE |
| `archived` | INTEGER | NOT NULL, DEFAULT 0 |

#### `conversations`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK |
| `listing_id` | TEXT | NOT NULL, UNIQUE (listing_id, guest_id), FK -> listings(id) ON DELETE CASCADE |
| `guest_id` | TEXT | NOT NULL, UNIQUE (listing_id, guest_id), FK -> users(id) ON DELETE CASCADE |
| `host_id` | TEXT | NOT NULL, FK -> users(id) ON DELETE CASCADE |
| `created_at` | TEXT | NOT NULL |
| `last_message_at` | TEXT | NOT NULL |

Indexes: `idx_convo_host` (host_id), `idx_convo_guest` (guest_id)

#### `geocache`

| Column | Type | Constraints |
|---|---|---|
| `query` | TEXT | PK |
| `lat` | REAL | — |
| `lng` | REAL | — |
| `display_name` | TEXT | — |
| `created_at` | TEXT | NOT NULL |

#### `listing_amenities`

| Column | Type | Constraints |
|---|---|---|
| `listing_id` | TEXT | PK (composite, part 1), FK -> listings(id) ON DELETE CASCADE |
| `name` | TEXT | PK (composite, part 2) |

#### `listings`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK |
| `owner_id` | TEXT | NOT NULL, FK -> users(id) ON DELETE CASCADE |
| `title` | TEXT | NOT NULL |
| `address` | TEXT | NOT NULL |
| `city` | TEXT | NOT NULL, DEFAULT 'Syracuse' |
| `state` | TEXT | NOT NULL, DEFAULT 'NY' |
| `zip` | TEXT | NOT NULL, DEFAULT '' |
| `description` | TEXT | NOT NULL, DEFAULT '' |
| `lat` | REAL | — |
| `lng` | REAL | — |
| `geocode_source` | TEXT | NOT NULL, DEFAULT 'pending' |
| `status` | TEXT | NOT NULL, DEFAULT 'active' |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Indexes: `idx_listings_geo` (lat, lng), `idx_listings_status` (status), `idx_listings_owner` (owner_id)

#### `messages`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK |
| `conversation_id` | TEXT | NOT NULL, FK -> conversations(id) ON DELETE CASCADE |
| `sender_id` | TEXT | NOT NULL, FK -> users(id) ON DELETE CASCADE |
| `body` | TEXT | NOT NULL |
| `created_at` | TEXT | NOT NULL |
| `read_at` | TEXT | — |

Indexes: `idx_messages_convo` (conversation_id, created_at)

#### `photos`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK |
| `listing_id` | TEXT | NOT NULL, FK -> listings(id) ON DELETE CASCADE |
| `file_url` | TEXT | NOT NULL |
| `file_size` | INTEGER | NOT NULL, DEFAULT 0 |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 |
| `upload_timestamp` | TEXT | NOT NULL |

Indexes: `idx_photos_listing` (listing_id, sort_order)

#### `pricing`

| Column | Type | Constraints |
|---|---|---|
| `listing_id` | TEXT | PK, FK -> listings(id) ON DELETE CASCADE |
| `monthly_rent` | REAL | NOT NULL |
| `available_from` | TEXT | NOT NULL |
| `available_to` | TEXT | NOT NULL |
| `utilities_included` | INTEGER | NOT NULL, DEFAULT 0 |
| `deposit` | REAL | NOT NULL, DEFAULT 0 |

#### `reports`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK |
| `reporter_id` | TEXT | NOT NULL, FK -> users(id) ON DELETE CASCADE |
| `listing_id` | TEXT | NOT NULL, FK -> listings(id) ON DELETE CASCADE |
| `reason` | TEXT | NOT NULL |
| `details` | TEXT | NOT NULL, DEFAULT '' |
| `status` | TEXT | NOT NULL, DEFAULT 'open' |
| `created_at` | TEXT | NOT NULL |

#### `room_details`

| Column | Type | Constraints |
|---|---|---|
| `listing_id` | TEXT | PK, FK -> listings(id) ON DELETE CASCADE |
| `bedrooms` | INTEGER | NOT NULL, DEFAULT 1 |
| `bathrooms` | REAL | NOT NULL, DEFAULT 1 |
| `max_roommates` | INTEGER | NOT NULL, DEFAULT 0 |
| `pets_allowed` | INTEGER | NOT NULL, DEFAULT 0 |
| `furnished` | INTEGER | NOT NULL, DEFAULT 0 |
| `private_bath` | INTEGER | NOT NULL, DEFAULT 0 |

#### `saved_listings`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK |
| `user_id` | TEXT | NOT NULL, UNIQUE (user_id, listing_id), FK -> users(id) ON DELETE CASCADE |
| `listing_id` | TEXT | NOT NULL, UNIQUE (user_id, listing_id), FK -> listings(id) ON DELETE CASCADE |
| `created_at` | TEXT | NOT NULL |

Indexes: `idx_saved_user` (user_id)

#### `screen_settings`

| Column | Type | Constraints |
|---|---|---|
| `user_id` | TEXT | PK, FK -> users(id) ON DELETE CASCADE |
| `font` | TEXT | NOT NULL, DEFAULT 'Inter' |
| `color` | TEXT | NOT NULL, DEFAULT '#D4603A' |
| `theme` | TEXT | NOT NULL, DEFAULT 'light' |
| `width_px` | INTEGER | NOT NULL, DEFAULT 430 |
| `height_px` | INTEGER | NOT NULL, DEFAULT 932 |
| `payload_enc` | TEXT | — |
| `updated_at` | TEXT | NOT NULL |

#### `swipes`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK |
| `user_id` | TEXT | NOT NULL, UNIQUE (user_id, listing_id), FK -> users(id) ON DELETE CASCADE |
| `listing_id` | TEXT | NOT NULL, UNIQUE (user_id, listing_id), FK -> listings(id) ON DELETE CASCADE |
| `direction` | TEXT | NOT NULL, CHECK (direction IN ('left','right')) |
| `created_at` | TEXT | NOT NULL |

Indexes: `idx_swipes_user` (user_id)

#### `users`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK |
| `email` | TEXT | NOT NULL, UNIQUE |
| `name` | TEXT | NOT NULL |
| `password_hash` | TEXT | NOT NULL |
| `university` | TEXT | NOT NULL, DEFAULT 'Syracuse University' |
| `bio` | TEXT | NOT NULL, DEFAULT '' |
| `avatar_initials` | TEXT | NOT NULL, DEFAULT '' |
| `verified` | INTEGER | NOT NULL, DEFAULT 0 |
| `token_version` | INTEGER | NOT NULL, DEFAULT 0 |
| `rating` | REAL | NOT NULL, DEFAULT 0 |
| `review_count` | INTEGER | NOT NULL, DEFAULT 0 |
| `created_at` | TEXT | NOT NULL |

## Classes and the tables they own

Table-per-concrete-class: `Data` is abstract and has no table of its own, and
each subclass reads and writes exactly one table (plus, for `ListingData`, the
multi-valued side table). See [`ERD.md`](ERD.md) for why each relationship is
shaped the way it is, and [`domain-value-objects.md`](domain-value-objects.md)
for the three value objects.

| Class | File | Table(s) | Notes |
|---|---|---|---|
| `Data` (abstract) | `server/src/domain/Data.ts` | none | Declares `validateData()`, `storeData()`, `retrieveData()`. Also defines `ValidationError`, which the error middleware turns into a 422. |
| `ListingData` | `server/src/domain/ListingData.ts` | `listings`, `listing_amenities` | Owns the composed objects below and hydrates them. `filterData()` and `sortData()` are the search path. |
| `PricingData` | `server/src/domain/PricingData.ts` | `pricing` | 1:1, shared primary key. |
| `RoomDetails` | `server/src/domain/RoomDetails.ts` | `room_details` | 1:1, shared primary key. |
| `PhotoData` | `server/src/domain/PhotoData.ts` | `photos` | 1:many. Also owns the files under `UPLOAD_DIR`. |
| `ScreenSettings` | `server/src/domain/ScreenSettings.ts` | `screen_settings` | 1:1 with `users`; private preferences are AES-256-GCM in `payload_enc`. |
| `ListingManager` | `server/src/domain/ListingManager.ts` | none | Service class. Its state lives for one request. |

The remaining tables have no class. `users` exists because `listings.owner_id`
needs something to point at. `swipes`, `saved_listings`, `conversations`,
`messages`, `conversation_state` and `reports` come from the use cases and are
queried directly from their routes. `geocache` stores Nominatim results keyed
by query string.

## ListingManager

The one entry point the listing routes use, so validation, geocoding and
persistence rules stay in one place. Every method leaves
`manager.operationStatus` set, and the four that return an `OperationStatus`
carry the same value back as `status.state`.

`OperationState` is a union of all 13 values, which is what makes the route
comparisons compile-checked — a misspelt case is a tsc error rather than a
branch that silently never matches:

```
idle · validating · valid · invalid · photo_rejected · rejected · submitted
retrieving · retrieved · not_found · forbidden · updated · deleted
```

| Method | What it does | SQL it runs | States it sets |
|---|---|---|---|
| `validateListing(listing)` | Runs `ListingData.validateData()`, which cascades into `PricingData`, `RoomDetails` and every `PhotoData`. Returns the problems. | none | `validating`, then `valid` or `invalid` |
| `submitListing(input)` | Geocodes the address, decodes the photos (at most `MAX_PHOTOS_PER_LISTING` = 10) **before** writing any file, validates, then stores listing + pricing + room details + photos + amenities in one transaction. | `SELECT` / `INSERT` on `geocache`; `INSERT ... ON CONFLICT DO UPDATE` on `listings`, `pricing`, `room_details`, `photos`; `DELETE` then `INSERT OR IGNORE` on `listing_amenities` | `photo_rejected`, `validating` / `valid` / `invalid`, `rejected`, `submitted` |
| `retrieveListing(id)` | One listing by id, with owner and composed objects. Does **not** filter removed listings — the route does. | `SELECT` on `listings` joined to `users`, plus one batched `SELECT` each on `photos`, `pricing`, `room_details`, `listing_amenities` | `retrieving`, then `retrieved` or `not_found` |
| `retrieveListings(filter, sort)` | `ListingData.filterData()` then `sortData()`. Indexable filters run in SQL; amenity-set matching and radius run in memory over the narrowed set. Defaults to `status = 'active'`. | the same `SELECT` plus `LEFT JOIN pricing` and `LEFT JOIN room_details`, with a `WHERE` built from fixed fragments and bound values | `retrieving`, then `retrieved` |
| `updateListing(id, ownerId, patch)` | Loads the listing, refuses it if it is missing, removed, or owned by somebody else; applies the patch; re-geocodes only when the address changed; validates; stores. | `SELECT` as above, then the same writes as `submitListing` | `not_found`, `forbidden`, `photo_rejected`, `validating` / `valid` / `invalid`, `rejected`, `updated` |
| `deleteListing(id, ownerId)` | Soft delete. Sets `status = 'removed'` and clears the listing out of everyone's saved list. | `SELECT owner_id FROM listings`; `UPDATE listings SET status = 'removed'`; `DELETE FROM saved_listings` | `not_found`, `forbidden`, `deleted` |

`retrieveListing()` returning a removed listing is deliberate: the route
decides what a removed listing means to a caller (404), while the manager
still has to be able to load one. `updateListing()` does treat removed as not
found, which together with `PATCH` only accepting `active` or `paused` is what
makes removal final.

## Transactions

`transaction(fn)` in `server/src/db.ts` is the only way anything writes more
than one row.

- **Outermost call**: `BEGIN` / `COMMIT`, or `ROLLBACK` and re-throw.
- **Nested call**: `SAVEPOINT sp_<depth>` / `RELEASE`, or `ROLLBACK TO` then
  `RELEASE` and re-throw. SQLite has no nested `BEGIN` — a second one fails
  outright, and a nested `COMMIT` would commit the outer caller's work early.
  `ROLLBACK TO` leaves the savepoint on the stack, so it is released
  separately; otherwise an outer call that swallows repeated inner failures
  grows the stack by one each time.

The unit of atomicity is the **outermost** call. An inner failure the outer
call catches undoes only the inner statements; an outer failure undoes
everything, including inner work that had already been released.

## Photo files

Photo rows live in `photos`; the bytes live under `UPLOAD_DIR` (default
`server/uploads/<listingId>/`) and are served as `/uploads/...`. The
filesystem is not transactional, so the two are kept in step by hand:

| Moment | What happens |
|---|---|
| Decode | `PhotoData.decodeDataUrl()` runs on every photo **before** anything is written. A payload over `MAX_PHOTO_BYTES` or of an unsupported type is rejected with nothing on disk and nothing in the database. |
| Write | Inside `transaction()`: each file is written, then its row inserted, then the listing stored. |
| Write failure | The transaction rolls the rows back, and `storeWithPhotos()` calls `PhotoData.discardFile()` for each file it had already written. Without that a failed save leaves images nothing references. |
| Delete one photo | `DELETE FROM photos WHERE id = ?`, then `discardFile()`. |
| Delete a listing | Neither. Soft delete keeps the rows and the files — see [`ERD.md`](ERD.md), "Soft-delete decision for listings". |

`discardFile()` resolves the URL back to a path and unlinks it only if it is
still inside `UPLOAD_DIR`, so a crafted `file_url` cannot reach outside it.

## SQL safety

Every value reaching SQLite goes through a bound parameter. Three places build
SQL from template literals, and each states the invariant in a comment where
the next person will edit it:

| Place | What is interpolated |
|---|---|
| `ListingData.filterData()` | Fragment strings written in that file. A filter decides *whether* a fragment is added, never what it says; its value is pushed onto `params`. |
| `migrations.ts`, `addColumnIfMissing()` | Table, column and DDL — identifiers, which `PRAGMA` and `ALTER TABLE` cannot bind. All three are literals in the migration list. |
| `migrations.ts`, `runMigrations()` | The version number in `PRAGMA user_version = N`, which is also not bindable. It comes from the migration list. |

`placeholders(n)` builds `?, ?, ?` from a **count**, and `chunkIds()` splits a
long `IN` list into statements SQLite will accept — neither touches a value.

## Tests

| File | Tests | Covers |
|---|---|---|
| `server/test/data/migrations.test.ts` | 12 | Fresh database reaches the latest version with all 14 tables and 9 indexes; a pre-runner database is adopted and gains `token_version`; a second run applies nothing; a failing migration rolls back, leaves `user_version` alone and is retried next run. |
| `server/test/data/transaction.test.ts` | 13 | Nested success, inner failure caught by the outer, outer failure, three-deep nesting, depth restored after a throw. |
| `server/test/domain/listingData.test.ts` | 23 | `validateData()` cascade, `sortData()`, `filterData()` including the availability overlap and a SQL payload in `q`. |
| `server/test/domain/listingManager.test.ts` | 20 | Every documented filter, the deck exclusions, owner-only edit and delete, the `state` in the result, and that a removed listing cannot be edited or reactivated. |
| `server/test/domain/listingPhotos.test.ts` | 6 | The 10-photo cap, no files left behind on a rejected save, and photo retention through a soft delete. |
| `server/test/domain/photoData.test.ts` | 24 | Decoding, validation, `storeData()` upsert, `fromJSON()`. |
| `server/test/domain/pricingData.test.ts` | 28 | Validation bounds, upsert, `fromJSON()`. |
| `server/test/domain/roomDetails.test.ts` | 31 | Validation bounds, upsert, `fromJSON()`. |
| `server/test/data/sampleListings.test.ts` | 26 | The committed seed dataset. |
| `server/test/routes/listingPhotos.test.ts` | 14 | Photo endpoints end to end. |
| `server/test/routes/postListingParity.test.ts` | 20 | `POST /listings` against the API contract. |
| `server/test/routes/savedListings.test.ts` | 17 | Saved tab. |
| `server/test/routes/swipesSavedReports.test.ts` | 22 | Swipes, saves and reports. |
| `server/test/lib/crypto.test.ts` | 5 | Hashing and token helpers. |
| `server/test/lib/http.test.ts` | 4 | Request-body helpers. |

265 tests in `server`, 116 in `web`. Run them with `npm test` from the repo
root; `npm run typecheck` runs `tsc --noEmit` over both workspaces.

Every test file imports `test/helpers/env.ts` first, which points
`DATABASE_FILE` and `UPLOAD_DIR` at a fresh temporary directory for that
process. `src/db.ts` opens the database and migrates at import time, so the
order matters — and the real `server/data/subletu.db` is never touched by a
test run. `test/data/migrations.test.ts` is the exception: it opens its own
databases, because the thing it is testing is what `db.ts` does on import.
