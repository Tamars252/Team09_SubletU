# Problem statement and student personas

**Story:** SCRUM-9 · Sprint 1 · Chris Martinez

## Problem statement

Every spring, a few thousand Syracuse students need to hand off a lease for the summer,
and a few thousand others need somewhere to live for three or four months. Those two
groups struggle to find each other.

A student leaving for a summer internship, a semester abroad, or graduation is still on
the hook for rent on a lease that runs through August. Their options today are a
Facebook group, a GroupMe inherited from last year's tenants, a flyer on a corkboard, or
Craigslist. A student arriving for a summer research position or an internship in
Syracuse faces the same channels from the other side, usually from out of town, with no
way to tell which posts are real.

The specific failures of those channels:

- **No filtering.** A Facebook group is a reverse-chronological wall. There is no way to
  ask for "under $700, available May through August, within a mile of campus, pets OK."
  Students scroll until they give up.
- **No trust signal.** Anyone can post anything. Scams targeting incoming students —
  deposit requested before a viewing, listings for apartments the poster does not control
  — are common enough that students have learned to distrust the whole channel. There is
  no way to tell a real classmate from an outside party.
- **Stale posts.** Nothing expires. A group is full of sublets that were taken in
  February, and there is no signal distinguishing them from open ones.
- **No geography.** "Near campus" means very different things on Ackerman Ave and in
  Downtown. Addresses are posted as text, so judging the walk to campus means opening a
  separate map tab for every listing.
- **Conversations scatter.** An inquiry starts in a comment thread, moves to DMs, then to
  text, and neither party has one place to see what was agreed.

**SubletU is a sublet marketplace restricted to verified students at the same school.**
Listings are browsed by swiping, shown on a live map with real distances to campus, and
filtered by the things that actually decide the match: price, dates, bedrooms, and
distance. Because every account is tied to a school email address, both sides know they
are talking to a classmate.

Constraining the audience to one campus is what makes the product work. It is a smaller
market than Craigslist, but it is the market where "I am a student at your school"
carries real weight.

## Personas

### Maya Okafor — the renter

> *"I just need to know it's real and I can walk to the lab."*

**Who:** 21, junior in Biomedical Engineering, from Columbus. Doing a summer research
position in the Life Sciences Complex, mid-May through mid-August. Lives in a dorm
during the year, so she has never signed a Syracuse lease.

**Goals**

- Find a furnished room for under $800/month for exactly the summer term
- Live close enough to walk to campus — she will not have a car
- Be confident the listing and the person are real before sending any money

**Frustrations**

- The Facebook group is a wall of posts with no filters; most are already taken
- Addresses are text, so she opens a map tab for every one to judge the walk
- She has read about deposit scams and does not know who to trust
- Posts say "summer" but not actual dates, so she has to ask every single host

**Behaviour**

- Searches almost entirely from her phone, often in short bursts between classes
- Will discard a listing immediately if photos are missing or the dates are vague
- Wants to ask one or two questions before committing to a viewing

**What she needs from SubletU:** fast browsing she can do with a thumb, real distances
instead of claims, explicit availability dates, visible verification, and a way to
message the host without handing over her phone number.

### Daniel Reyes — the host

> *"I'm paying for an empty room either way. I just want it off my hands by May."*

**Who:** 22, senior in Information Management, lives in a four-bedroom house on Ackerman
Ave with three roommates. Graduating in May; the lease runs to August 31. Needs to cover
roughly three and a half months of rent he will not be living for.

**Goals**

- Fill the room before the lease rolls over, ideally before finals
- Post once, with photos, and not re-post it every week
- Screen inquiries lightly — his roommates have to live with whoever shows up

**Frustrations**

- Re-posting to the group every few days to stay visible
- Fielding the same three questions over and over in DMs from people who then vanish
- No idea which inquiries are serious
- Outside parties contacting him who have no connection to the school

**Behaviour**

- Will take photos on his phone and post from the same phone, in one sitting
- Abandons any form that asks for more than he can answer from memory
- Checks for replies a few times a day, not continuously

**What he needs from SubletU:** a posting flow short enough to finish in one sitting,
photo upload that does not fail on a 12 MP phone photo, a view of who has saved or asked
about the listing, and the confidence that inquiries come from actual students.

## How the personas shaped the build

| Persona need | What it became |
| --- | --- |
| Maya: browse fast on a phone | Swipe deck — right saves, left passes (SCRUM-28, SCRUM-79) |
| Maya: judge the walk to campus | Map tab plus computed great-circle distance, not an authored "0.4 mi" (SCRUM-71, SCRUM-87) |
| Maya: exact dates | Availability window on every listing; the date filter is an **overlap** test, not a start-date match (SCRUM-58) |
| Maya: is this real? | School-email-only accounts, verified badge, report button (SCRUM-30, SCRUM-110) |
| Maya: ask before committing | Per-listing conversation threads (SCRUM-90) |
| Daniel: post in one sitting | Single Post screen, photos downscaled in the browser before upload (SCRUM-88) |
| Daniel: who is interested? | `/listings/mine` returns save, like and inquiry counts (SCRUM-68) |
| Daniel: keep roommates safe | Verified-students-only posting and messaging (SCRUM-110) |

## Note on the interview evidence

SCRUM-9's acceptance criteria call for 5+ student interviews to be summarised here. The
problem statement and both personas above are written from the team's own experience of
the Syracuse sublet market and the behaviour the prototype testing surfaced
(see [usability-findings.md](usability-findings.md)). **The interview transcripts and
their summaries have not been attached to this document.** They should be added to this
section before SCRUM-9 is cited as complete.
