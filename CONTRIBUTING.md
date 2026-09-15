# Contributing to SubletU

## Getting set up

You need **Node 22.6 or newer** — the server runs TypeScript directly with no
build step, which only works on runtimes that can strip types. `node --version`
to check.

```bash
git clone git@github.com:thaque05/SubletU.git
cd SubletU
npm install
```

```bash
npm run seed
```

Seeding geocodes 24 real Syracuse addresses through Nominatim, which is
rate-limited to one request per second by their usage policy — so the first run
takes about 25 seconds. After that the results are cached in the `geocache`
table and it is instant.

```bash
npm run dev
```

That starts the API on `:4000` and the front end on `:5173`. Open
**http://localhost:5173** and sign in as `demo@syr.edu` / `sublet123`.

If something looks wrong, `npm run seed -- --force` wipes and rebuilds the
database from scratch.

## Before you push

```bash
npm run typecheck && npm test
```

Both run in CI on every pull request, so running them locally just saves you a
round trip. `npm test` is the server suite; it takes well under a second.

## How we work

`main` is protected. You cannot push to it directly — every change goes through
a pull request, and CI has to be green before it can merge.

```bash
git switch -c your-name/short-description
# ... make your change, commit ...
git push -u origin your-name/short-description
```

Then open the PR on GitHub. Merges are **squash-only**, so your branch's messy
history collapses into one commit on `main`. Write the PR title as the commit
message you want to see there.

Commit messages follow the pattern already in the log:

```
feat(server): add review flow for completed sublets
fix(web): keep swipe deck height stable on iOS Safari
docs: explain the geocoding cache
test: cover the availability overlap filter
```

## Where things live

```
server/src/domain/     the class-diagram classes — Data and its subclasses
server/src/routes/     HTTP endpoints, one file per resource
server/src/lib/        crypto, geocoding, HTTP helpers
server/test/           the test suite (see below)
web/src/screens/       one file per tab
web/src/components/    shared UI
web/src/api/           typed client for the server
```

The classes in `server/src/domain/` map one-to-one onto the SubletU class
diagram, including the generalizations as real `extends` relationships. If you
change one, check that the diagram still describes it — that mapping is part of
what the project is graded on. The table in [README.md](README.md) is the
reference.

## Writing tests

Tests live in `server/test/`, mirroring the `src/` layout, and use the built-in
`node:test` runner — no framework to install.

Every test file must import the environment helper **first**:

```ts
import "../helpers/env.ts";
import { PricingData } from "../../src/domain/PricingData.ts";
```

That is not a style preference. `src/db.ts` opens the SQLite database and
creates the schema the moment it is imported, and `src/config.ts` only falls
back to `.env` for values not already in `process.env`. Because ES modules
evaluate in the order they are declared, importing `env.ts` first is what
redirects the database at a throwaway temp file. Get the order wrong and your
test run writes to `server/data/subletu.db` — your real development data.

`test/helpers/factories.ts` builds valid domain objects. Each factory returns
something that passes `validateData()` cleanly, so a test can override exactly
the one field it cares about:

```ts
const problems = makePricing({ monthlyRent: 0 }).validateData();
```

Prefer that over constructing objects by hand — it keeps each assertion about
one rule instead of a pile of unrelated setup.

### HTTP tests

`test/api/` boots the real Express app on a random port and makes real requests
through it, so the auth middleware, JSON parsing and error mapping are all
exercised rather than stubbed.

```ts
const api = await TestApi.start();
const { token } = await api.registerUser();
const res = await api.post("/api/swipes", { listingId, direction: "right" }, token);
```

`src/app.ts` builds the app and `src/index.ts` starts it — keep that split.
Anything that binds a port at import time makes the app untestable.

Posting a listing geocodes its address, so call `seedDefaultGeocodes()` in your
`before` hook. That pre-fills the `geocache` table, and `geocodeAddress` reads
the cache before it ever reaches the network.

### What is not covered yet

- **Messages and reports have no HTTP tests.** `test/api/` covers auth, listings
  and the swipe/save invariant. Conversations, archiving and reports do not.
- **No front-end tests.** `web/` has typecheck and build in CI, nothing more.
- **Nothing hits Nominatim.** `test/helpers/env.ts` points `NOMINATIM_URL` at a
  dead address on purpose, so a test can never make a live geocoding request. If
  you need to test geocoding behaviour, stub `fetch` or seed the cache.
- **Two tests are marked `todo`** in `test/api/swipeSaved.test.ts`. They describe
  behaviour the README promises but the code does not have yet — see the comment
  above them. `node:test` reports todo failures without failing the run, so they
  stay visible without blocking CI. Delete the `todo` marker when the fix lands.
