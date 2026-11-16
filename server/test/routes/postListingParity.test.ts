/**
 * TM09-98 AC1: the Post form validates like ListingManager.
 *
 * Runs the web form's own validateDraft() and draftToBody() against the real
 * POST /api/listings, so the two cannot drift apart unnoticed: every draft the
 * form accepts is created (201), and every draft it rejects is refused by the
 * server too (400 or 422). It also checks AC3's server half: the listing is
 * pinned from the typed address.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, seedUser, startTestServer } from "../helpers/http.ts";
import type { TestServer } from "../helpers/http.ts";
import { db, nowIso } from "../../src/db.ts";
import {
  EMPTY_DRAFT,
  draftToBody,
  validateDraft,
} from "../../../web/src/lib/postListing.ts";
import type { ListingDraft } from "../../../web/src/lib/postListing.ts";

const PIN = { lat: 43.0412, lng: -76.1225 };

const VALID: ListingDraft = {
  ...EMPTY_DRAFT,
  title: "Sunny room on Ackerman",
  address: "910 Ackerman Ave",
  zip: "13210",
  description: "Bright furnished room two blocks from the quad, shared kitchen.",
  monthlyRent: "575",
  deposit: "575",
  availableFrom: "2027-05-15",
  availableTo: "2027-08-15",
  bedrooms: "1",
  bathrooms: "1",
  maxRoommates: "2",
};

/** Each case changes one field. `ok` is what the form's validateDraft says. */
const CASES: Array<[string, Partial<ListingDraft>]> = [
  ["a complete draft", {}],
  ["a studio with 1.5 baths and no deposit", { bedrooms: "0", bathrooms: "1.5", deposit: "" }],
  ["rent at the $20,000 ceiling", { monthlyRent: "20000" }],
  ["a lowercase state", { state: "ny" }],
  ["a 3-character title", { title: "Abc" }],
  ["a 121-character title", { title: "x".repeat(121) }],
  ["a too-short address", { address: "1 A" }],
  ["a full state name", { state: "New York" }],
  ["a short description", { description: "Nice room." }],
  ["$0 rent", { monthlyRent: "0" }],
  ["rent over $20,000", { monthlyRent: "20001" }],
  ["a negative deposit", { deposit: "-5" }],
  ["a deposit at the $20,000 ceiling", { deposit: "20000" }],
  ["a deposit over $20,000", { deposit: "20001" }],
  ["Feb 31", { availableFrom: "2027-02-31" }],
  ["a window that ends before it starts", { availableTo: "2027-05-01" }],
  ["fractional bedrooms", { bedrooms: "1.5" }],
  ["0 bathrooms", { bathrooms: "0" }],
  ["21 roommates", { maxRoommates: "21" }],
];

let server: TestServer;
let host: { id: string; token: string };

before(async () => {
  server = await startTestServer();
  host = seedUser("Parity Host");
  // Pre-fill the geocache so submit never calls Nominatim.
  db.prepare(
    `INSERT OR REPLACE INTO geocache (query, lat, lng, display_name, created_at)
     VALUES (?, ?, ?, NULL, ?)`,
  ).run("fwd:910 ackerman ave, syracuse, ny", PIN.lat, PIN.lng, nowIso());
});

after(async () => {
  await server.close();
});

describe("AC1: the form and POST /api/listings agree on every case", () => {
  for (const [name, change] of CASES) {
    it(name, async () => {
      const draft = { ...VALID, ...change };
      const formOk = Object.keys(validateDraft(draft)).length === 0;
      const res = await api(server, "POST", "/api/listings", {
        token: host.token,
        body: draftToBody(draft, []),
      });
      if (formOk) {
        assert.equal(res.status, 201, `form accepted it but the server said ${res.status}: ${JSON.stringify(res.body)}`);
      } else {
        assert.ok(
          res.status === 400 || res.status === 422,
          `form rejected it but the server said ${res.status}`,
        );
      }
    });
  }
});

describe("AC3: the listing is pinned from the typed address", () => {
  it("POST /api/listings geocodes the address; the client sends no coordinates", async () => {
    const res = await api(server, "POST", "/api/listings", {
      token: host.token,
      body: draftToBody(VALID, []),
    });
    assert.equal(res.status, 201);
    const listing = res.body.listing as { lat: number; lng: number; geocodeSource: string };
    assert.equal(listing.lat, PIN.lat);
    assert.equal(listing.lng, PIN.lng);
    assert.equal(listing.geocodeSource, "nominatim");
  });
});
