# Data model (ERD)

**Story:** SCRUM-20 · Sprint 2 · Team Member 4

The relational translation of the class diagram (`classDiagram.vpp` /
`Class Diagram1.pdf`). Implemented in [`server/src/db.ts`](../server/src/db.ts) on SQLite
via `node:sqlite`, with `PRAGMA foreign_keys = ON` and WAL journalling.

## Diagram

```mermaid
erDiagram
    users ||--o| screen_settings : "has preferences"
    users ||--o{ listings : "owns"
    users ||--o{ swipes : "makes"
    users ||--o{ saved_listings : "saves"
    users ||--o{ reports : "files"
    users ||--o{ messages : "sends"
    users ||--o{ conversations : "is guest in"
    users ||--o{ conversations : "is host of"
    users ||--o{ conversation_state : "archives"

    listings ||--|| pricing : "priced by"
    listings ||--|| room_details : "described by"
    listings ||--o{ photos : "shows"
    listings ||--o{ listing_amenities : "offers"
    listings ||--o{ swipes : "is swiped on"
    listings ||--o{ saved_listings : "is saved as"
    listings ||--o{ reports : "is reported in"
    listings ||--o{ conversations : "is discussed in"

    conversations ||--o{ messages : "contains"
    conversations ||--o{ conversation_state : "has per-user state"

    users {
        TEXT    id PK
        TEXT    email UK "school domain only"
        TEXT    name
        TEXT    password_hash
        TEXT    university
        TEXT    bio
        TEXT    avatar_initials
        INTEGER verified
        REAL    rating
        INTEGER review_count
        TEXT    created_at
    }

    screen_settings {
        TEXT    user_id PK_FK
        TEXT    font
        TEXT    color
        TEXT    theme
        INTEGER width_px
        INTEGER height_px
        TEXT    payload_enc "AES-256-GCM at rest"
        TEXT    updated_at
    }

    listings {
        TEXT id PK
        TEXT owner_id FK
        TEXT title
        TEXT address
        TEXT city
        TEXT state
        TEXT zip
        TEXT description
        REAL lat "from geocoder"
        REAL lng "from geocoder"
        TEXT geocode_source
        TEXT status "active | removed"
        TEXT created_at
        TEXT updated_at
    }

    pricing {
        TEXT    listing_id PK_FK
        REAL    monthly_rent
        TEXT    available_from
        TEXT    available_to
        INTEGER utilities_included
        REAL    deposit
    }

    room_details {
        TEXT    listing_id PK_FK
        INTEGER bedrooms
        REAL    bathrooms
        INTEGER max_roommates
        INTEGER pets_allowed
        INTEGER furnished
        INTEGER private_bath
    }

    photos {
        TEXT    id PK
        TEXT    listing_id FK
        TEXT    file_url
        INTEGER file_size
        INTEGER sort_order
        TEXT    upload_timestamp
    }

    listing_amenities {
        TEXT listing_id PK_FK
        TEXT name PK
    }

    swipes {
        TEXT id PK
        TEXT user_id FK
        TEXT listing_id FK
        TEXT direction "left | right"
        TEXT created_at
    }

    saved_listings {
        TEXT id PK
        TEXT user_id FK
        TEXT listing_id FK
        TEXT created_at
    }

    conversations {
        TEXT id PK
        TEXT listing_id FK
        TEXT guest_id FK
        TEXT host_id FK
        TEXT created_at
        TEXT last_message_at
    }

    messages {
        TEXT id PK
        TEXT conversation_id FK
        TEXT sender_id FK
        TEXT body
        TEXT created_at
        TEXT read_at "NULL until read"
    }

    conversation_state {
        TEXT    conversation_id PK_FK
        TEXT    user_id PK_FK
        INTEGER archived
    }

    reports {
        TEXT id PK
        TEXT reporter_id FK
        TEXT listing_id FK
        TEXT reason
        TEXT details
        TEXT status "open"
        TEXT created_at
    }

    geocache {
        TEXT query PK
        REAL lat
        REAL lng
        TEXT display_name
        TEXT created_at
    }
```

`geocache` has no relationships — it is an infrastructure table keyed by the geocoder
query string, so a given address is only ever looked up once.

## How each class-diagram entity is covered

| Diagram class | Table(s) | Notes |
| --- | --- | --- |
| `Data` (abstract) | — | Not a table. Every table below is written and read through a subclass of `Data` in `server/src/domain/`, which is where `validateData()` / `storeData()` / `retrieveData()` live. |
| `ListingData` | `listings` + `listing_amenities` | The aggregate root. Amenities are a child table rather than a delimited column so they can be filtered by set intersection. |
| `PricingData` | `pricing` | One-to-one with `listings`, enforced by using `listing_id` as the primary key. |
| `RoomDetails` | `room_details` | One-to-one, same pattern. |
| `PhotoData` | `photos` | One-to-many, ordered by `sort_order`. |
| `ScreenSettings` | `screen_settings` | One-to-one with `users`. Public display columns are plain; the private preferences blob is in `payload_enc`. |
| `ListingManager` | — | A service, not an entity. It orchestrates writes across `listings`, `pricing`, `room_details` and `photos` inside one transaction. |
| Screen classes | — | No persistence. They became React components. |

Tables with no class-diagram counterpart — `users`, `swipes`, `saved_listings`,
`conversations`, `messages`, `conversation_state`, `reports`, `geocache` — carry the
behaviour the use-case diagram requires (Sign In, Swipe/Save, Message Host, Report
Listing) and are managed directly by the route layer.

## Keys and constraints

**Primary keys** are application-generated opaque text ids with a type prefix
(`usr_`, `lst_`, `pho_`), produced by `newId()` in `server/src/lib/crypto.ts`. They are
random rather than sequential, so an id in a URL leaks neither record count nor creation
order.

**Foreign keys** all cascade on delete, so removing a user or a listing cannot leave
orphaned pricing, photos or messages behind.

| Constraint | Table | Why |
| --- | --- | --- |
| `UNIQUE (email)` | `users` | One account per school address |
| `UNIQUE (user_id, listing_id)` | `swipes` | A user has exactly one verdict per listing; re-swiping updates rather than duplicating |
| `UNIQUE (user_id, listing_id)` | `saved_listings` | Satisfies FR-6.3 — saving twice cannot duplicate |
| `UNIQUE (listing_id, guest_id)` | `conversations` | One thread per renter per listing, so an inquiry always lands in the same place |
| `CHECK (direction IN ('left','right'))` | `swipes` | Keeps the swipe vocabulary closed |
| `PRIMARY KEY (listing_id, name)` | `listing_amenities` | An amenity is listed once per listing |
| `PRIMARY KEY (conversation_id, user_id)` | `conversation_state` | Exactly one archive flag per party per thread |

### Indexes

| Index | Columns | Serves |
| --- | --- | --- |
| `idx_listings_owner` | `listings(owner_id)` | "My listings" for a host |
| `idx_listings_status` | `listings(status)` | Excluding soft-deleted rows from every browse query |
| `idx_listings_geo` | `listings(lat, lng)` | Bounding-box prefilter before the haversine pass |
| `idx_photos_listing` | `photos(listing_id, sort_order)` | Fetching a listing's photos already ordered |
| `idx_swipes_user` | `swipes(user_id)` | Subtracting seen listings from the deck |
| `idx_saved_user` | `saved_listings(user_id)` | The Saved tab |
| `idx_messages_convo` | `messages(conversation_id, created_at)` | Reading a thread in order |
| `idx_convo_guest`, `idx_convo_host` | `conversations(guest_id)`, `conversations(host_id)` | The inbox, from either side |

## Decision: soft delete for listings

`listings.status` is `active` or `removed`; `DELETE /api/listings/:id` sets
`status = 'removed'` rather than deleting the row.

A hard delete would cascade into `conversations` and `messages` and destroy a thread for
*both* parties — including a renter who had already agreed terms and needed the history.
It would also break a host's own record of what they had posted. Browse, deck and map
queries all filter on `status = 'active'`, so a removed listing disappears from discovery
immediately while the conversation around it keeps working.

The trade-off is that rows accumulate; there is no purge job. At this scale that is
cheaper than the alternative.

## Note on the diagram image

The timeline cites `/docs/erd.png` as this story's evidence. The authoritative version is
the Mermaid source above, which is diffable in review and cannot drift silently from the
schema. To produce the PNG:

```bash
npx -y @mermaid-js/mermaid-cli -i docs/erd.md -o docs/erd.png
```
