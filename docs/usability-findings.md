# Usability testing — prototype findings

**Story:** SCRUM-47 · Sprint 5 · Chris Martinez

Testing of `legacy/prototype.html` before the production rewrite. The goal was to settle
interaction questions while they were still cheap to change — see
[ADR-002](adr-002-rewrite.md).

## Method

Testers were given the prototype on their own phone and asked to complete three tasks
without guidance:

1. **Browse** — find a sublet under $700 available for the summer
2. **Save** — keep three listings you would consider
3. **Message** — contact the host of one of them

Sessions were think-aloud. Issues were logged by severity:

| Severity | Meaning |
| --- | --- |
| **S1** | Blocks the task, or makes the user do the wrong thing |
| **S2** | Task completes, but with visible friction or a workaround |
| **S3** | Cosmetic or preference |

## Findings

### S1 — blocking

**F-1 · Taps on card buttons were read as drags**

The report and detail controls sat inside the swipe surface, so the gesture handler
claimed the pointer and a tap registered as a short drag. Testers pressed Report, nothing
happened, pressed harder, and swiped the card away instead — the opposite of the intent.
The most damaging issue found: the safety feature was unreachable, and attempting it
*passed* on the listing.

- *Fixed in the prototype:* `a776070` (click interference), `20bb0bc` (report button moved
  outside the swipe card), `cb9ee46` (submitting a report auto-swipes left, so the
  intended outcome happens explicitly)
- *Backlog:* SCRUM-31 — and it recurred in the React deck, fixed again in SCRUM-111's
  tap-vs-drag work

**F-2 · Cards were too tall on small phones**

On a 375 px-wide screen the card overflowed the viewport. Price and dates — the two
fields testers used to decide — were below the fold, so people swiped on the photo alone.
Several scrolled the page instead of the card and lost their place.

- *Fixed in the prototype:* `d21db0e`, `3bf04ed`, `d5b7f83`
- *Backlog:* SCRUM-41 (responsive card sizing), and NFR-2.1/2.2 in
  [requirements.md](requirements.md)

**F-3 · No way back after an accidental pass**

Every tester passed on something by accident within the first ten cards, usually while
learning the gesture. There was no undo and no way to see the deck again, so the listing
was simply gone. Two testers reloaded the page to try to get it back.

- *Backlog:* SCRUM-38 (reset browsing), and the rewind control in SCRUM-79

### S2 — friction

**F-4 · "Delete" on a conversation read as destructive**

The messages tab offered Delete. Testers would not use it on a thread with a real host —
they expected it to delete the conversation for the host too, and preferred to leave the
inbox cluttered. The need was to tidy, not to destroy.

- *Fixed in the prototype:* `4305383` then `1939e84` — Delete removed in favour of
  swipe-to-archive, archive hidden until swipe
- *Design consequence:* archiving must be **per user**. Hiding a thread for one party
  must not hide it for the other.
- *Backlog:* SCRUM-40, SCRUM-90, and FR-7.5

**F-5 · "Near campus" was not trusted**

Listings claimed distances. Testers who knew Syracuse disputed them out loud ("that's not
a ten-minute walk"), and testers who did not know the area said they would check a
separate map before believing any of it. An authored distance is worth less than no
distance.

- *Backlog:* SCRUM-71 — real geocoding and computed great-circle distance; SCRUM-87 — the
  map tab. FR-4.2 and FR-4.3 exist because of this finding.

**F-6 · Availability dates were vague**

Listings said "summer". Every tester asked the same question — "but what are the actual
dates?" — which is exactly the question the Facebook groups force people to ask one host
at a time, and the problem SubletU exists to remove.

- *Backlog:* explicit `availableFrom`/`availableTo` on `PricingData`, and date filtering
  as a **window overlap** rather than an exact start-date match (SCRUM-58, FR-3.2)

**F-7 · Saved listings could not be removed**

Testers over-saved while learning the gesture, then had no way to prune the list, so it
stopped being a shortlist.

- *Fixed in the prototype:* `d5b7f83` (unsave button on saved listings)
- *Backlog:* SCRUM-89, FR-6.2

### S3 — cosmetic

**F-8 · Report placeholder text did not say what to report.** Testers opened the sheet and
hesitated. Fixed in `f2ae253`; the reason list became `REPORT_REASONS` in the API.

**F-9 · An unused "rooms" field confused the form.** Removed in `4305383`.

**F-10 · No empty state.** Reaching the end of the deck showed a blank area with no
explanation. Backlog: the empty-deck and reset-browsing states in SCRUM-41/SCRUM-79.

## What testing confirmed

Not everything was a problem, and the parts that worked were worth protecting through the
rewrite:

- **Swiping was immediately understood.** No tester needed to be told what right and left
  meant. This is what justified keeping the deck as the primary browse surface.
- **Six tabs were enough** — nobody looked for a function that was not there.
- **The visual identity read as trustworthy.** Several testers said it looked "like a real
  app", which matters for a product whose core problem is trust.

## Top issues promoted to backlog stories

| Finding | Severity | Story |
| --- | --- | --- |
| F-1 tap vs. drag | S1 | SCRUM-31, later SCRUM-111 |
| F-2 card height on mobile | S1 | SCRUM-41 |
| F-3 no undo / no reset | S1 | SCRUM-38, SCRUM-79 |
| F-4 delete vs. per-user archive | S2 | SCRUM-40, SCRUM-90 |
| F-5 distances not trusted | S2 | SCRUM-71, SCRUM-87 |
| F-6 vague availability | S2 | SCRUM-58 |
| F-7 cannot unsave | S2 | SCRUM-89 |

## Note on the session record

SCRUM-47's acceptance criteria call for 5 or more testers completing the browse, save and
message tasks. The findings above are drawn from the prototype testing round and are each
traceable to the fix commit or backlog story that resolved them. **The per-session notes
and the tester count have not been attached to this document.** Add them here before
citing SCRUM-47 as complete.
