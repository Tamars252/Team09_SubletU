# Functional and non-functional requirements

**Story:** SCRUM-10 · Sprint 1 · Team Member 4

Priorities use MoSCoW: **Must** ships or the product has no reason to exist, **Should**
ships if the sprint budget holds, **Could** is deferred without regret.

Each requirement traces to a persona need in [personas.md](personas.md) — **M** for Maya
(renter), **D** for Daniel (host).

## Functional requirements

### FR-1 Accounts

| ID | Requirement | Priority | Traces to |
| --- | --- | --- | --- |
| FR-1.1 | A student can register with a school email address and a password | Must | M, D |
| FR-1.2 | A registered student can sign in and stay signed in across a page refresh | Must | M, D |
| FR-1.3 | Only addresses on the school's domain may register | Must | M, D |
| FR-1.4 | A student can edit their display name, bio and university | Should | D |
| FR-1.5 | A student can change their password | Should | M, D |
| FR-1.6 | A student's email address is verified by an out-of-band code before they can post or message | Should | M, D |
| FR-1.7 | A student can sign in with their institutional SSO account instead of a password | Could | M, D |
| FR-1.8 | A student who forgets their password can recover the account | Could | M, D |

FR-1.3 is enforced at registration. FR-1.6 and FR-1.8 are scheduled into Sprint 11, and
FR-1.7 depends on an app registration from Syracuse ITS, which is why they are not Must.

### FR-2 Browse

| ID | Requirement | Priority | Traces to |
| --- | --- | --- | --- |
| FR-2.1 | A renter can browse listings one card at a time and swipe right to save, left to pass | Must | M |
| FR-2.2 | The browse deck excludes listings the renter has already swiped | Must | M |
| FR-2.3 | Swiping works with touch, mouse and trackpad | Must | M |
| FR-2.4 | A renter can open a listing's full detail — photos, price, dates, room details, host | Must | M |
| FR-2.5 | A renter can undo their last swipe | Should | M |
| FR-2.6 | A renter can reset their browsing history and see the whole deck again | Should | M |
| FR-2.7 | The deck prefetches ahead so swiping never waits on the network | Could | M |

### FR-3 Filter and search

| ID | Requirement | Priority | Traces to |
| --- | --- | --- | --- |
| FR-3.1 | A renter can filter by minimum and maximum monthly rent | Must | M |
| FR-3.2 | A renter can filter by availability dates, matched as a window overlap rather than an exact start date | Must | M |
| FR-3.3 | A renter can filter by minimum bedrooms and bathrooms | Must | M |
| FR-3.4 | A renter can filter by distance from campus | Must | M |
| FR-3.5 | A renter can filter by utilities included, furnished and pets allowed | Should | M |
| FR-3.6 | A renter can filter by amenities | Should | M |
| FR-3.7 | A renter can sort by newest, price ascending or descending, distance, or soonest available | Should | M |
| FR-3.8 | Clearing filters restores the full deck | Should | M |
| FR-3.9 | A renter can search listings by free text | Could | M |

### FR-4 Map

| ID | Requirement | Priority | Traces to |
| --- | --- | --- | --- |
| FR-4.1 | A renter can see listings as pins on a map of the campus area | Must | M |
| FR-4.2 | Each listing's pin is placed from its street address, not hand-entered coordinates | Must | M, D |
| FR-4.3 | Distance to campus is computed from coordinates, not authored by the host | Must | M |
| FR-4.4 | Selecting a pin shows that listing's summary | Should | M |
| FR-4.5 | The map shows which listings are already saved | Should | M |
| FR-4.6 | A renter can search a place name or pick a campus to recentre the map | Could | M |

### FR-5 Post a listing

| ID | Requirement | Priority | Traces to |
| --- | --- | --- | --- |
| FR-5.1 | A host can post a sublet with title, address, description, rent, availability window and room details | Must | D |
| FR-5.2 | A host can attach photos to a listing | Must | D, M |
| FR-5.3 | A listing is validated before it is stored, with errors shown per field | Must | D |
| FR-5.4 | A host can edit and delete their own listings | Must | D |
| FR-5.5 | Only the owner may edit or delete a listing | Must | D |
| FR-5.6 | Deleting a listing is a soft delete, so existing conversations keep working | Should | D, M |
| FR-5.7 | A host can see save, like and inquiry counts for each of their listings | Should | D |
| FR-5.8 | Photos are downscaled in the browser before upload so a phone photo does not fail | Should | D |

### FR-6 Saved

| ID | Requirement | Priority | Traces to |
| --- | --- | --- | --- |
| FR-6.1 | A renter can review the listings they swiped right on | Must | M |
| FR-6.2 | A renter can unsave a listing | Must | M |
| FR-6.3 | Saving the same listing twice does not create a duplicate | Must | M |
| FR-6.4 | The deck, the Saved tab and the map read the same saved state and cannot disagree | Must | M |

### FR-7 Messaging

| ID | Requirement | Priority | Traces to |
| --- | --- | --- | --- |
| FR-7.1 | A renter can start a conversation with a host from a listing | Must | M, D |
| FR-7.2 | Both parties can read a thread and send replies | Must | M, D |
| FR-7.3 | A user sees an unread indicator when they have new messages | Should | M, D |
| FR-7.4 | A user can archive a conversation they are finished with | Should | M, D |
| FR-7.5 | Archiving hides a thread only for the user who archived it | Should | D |
| FR-7.6 | Real-time delivery without polling | Could | M, D |

### FR-8 Safety

| ID | Requirement | Priority | Traces to |
| --- | --- | --- | --- |
| FR-8.1 | A renter can report a suspicious listing with a reason and optional details | Must | M |
| FR-8.2 | Reports are stored with the listing, the reporter and the reason | Must | M |
| FR-8.3 | The report control must not trigger a swipe | Must | M |
| FR-8.4 | A moderation interface for reviewing reports | Could | — |

### FR-9 Profile and settings

| ID | Requirement | Priority | Traces to |
| --- | --- | --- | --- |
| FR-9.1 | A user can view and edit their profile | Should | D |
| FR-9.2 | A user can set display preferences, stored per account | Should | M, D |
| FR-9.3 | A user can see their swipe statistics | Could | M |
| FR-9.4 | A user can sign out | Must | M, D |

## Non-functional requirements

### NFR-1 Privacy and security

| ID | Requirement | Priority |
| --- | --- | --- |
| NFR-1.1 | Passwords are stored only as salted hashes from a memory-hard function, never reversible | Must |
| NFR-1.2 | Login returns an identical error for an unknown email and a wrong password, so the API cannot be used to enumerate accounts | Must |
| NFR-1.3 | Sessions are signed tokens the server can invalidate when credentials change | Must |
| NFR-1.4 | A renter's contact details are never exposed to a host except through the in-app thread | Must |
| NFR-1.5 | User preference payloads are encrypted at rest with authenticated encryption; tampered ciphertext is rejected | Should |
| NFR-1.6 | Uploaded files are served with `X-Content-Type-Options: nosniff` and a MIME whitelist | Should |
| NFR-1.7 | The server refuses to start in production with placeholder secrets | Should |

### NFR-2 Mobile-first

| ID | Requirement | Priority |
| --- | --- | --- |
| NFR-2.1 | Every screen is usable on a 375 px-wide viewport without horizontal scrolling | Must |
| NFR-2.2 | A listing card fits on screen without scrolling the page | Must |
| NFR-2.3 | The page does not scroll while a card is being dragged | Must |
| NFR-2.4 | A horizontal drag must not trigger the browser's back-navigation gesture | Must |
| NFR-2.5 | Primary actions are reachable one-handed; navigation is a bottom tab bar | Should |

### NFR-3 Performance

| ID | Requirement | Priority |
| --- | --- | --- |
| NFR-3.1 | Swipe animation tracks the pointer without visible lag on a mid-range phone | Must |
| NFR-3.2 | The map library is code-split so it does not block first paint of the deck | Should |
| NFR-3.3 | Listing queries are indexed on owner, status and coordinates | Should |

### NFR-4 Cost and dependencies

| ID | Requirement | Priority |
| --- | --- | --- |
| NFR-4.1 | No paid API key is required to run the product — including the map | Must |
| NFR-4.2 | Runtime dependencies are kept minimal; prefer the standard library | Should |
| NFR-4.3 | Third-party usage policies are honoured, including geocoder rate limits | Must |

### NFR-5 Accessibility

| ID | Requirement | Priority |
| --- | --- | --- |
| NFR-5.1 | A listing can be opened from the keyboard, not only by tapping | Should |
| NFR-5.2 | Controls have accessible names and visible focus | Should |
| NFR-5.3 | Text meets WCAG AA contrast against its background | Should |

### NFR-6 Maintainability

| ID | Requirement | Priority |
| --- | --- | --- |
| NFR-6.1 | The domain layer mirrors the class diagram one-to-one, class for class | Must |
| NFR-6.2 | The codebase typechecks with no errors | Must |
| NFR-6.3 | Automated tests cover domain validation and the main API routes | Should |
| NFR-6.4 | Checks run automatically on every pull request to `main` | Should |
| NFR-6.5 | A new contributor can go from clone to running app using only the README | Should |

## Review

SCRUM-10's acceptance criteria require review by every team member. Record the review
here — reviewer, date, and any requirement changed as a result — before citing SCRUM-10
as complete.

| Reviewer | Date | Notes |
| --- | --- | --- |
| Tareq Haque | | |
| Tamar Shuster | | |
| Chris Martinez | | |
| Team Member 4 | | |
