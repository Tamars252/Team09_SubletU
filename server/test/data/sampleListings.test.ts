/**
 * TM09-134: Sample listing data for Syracuse.
 *
 * One block per acceptance criterion:
 *   1. The committed dataset satisfies all of them — count, required fields,
 *      valid date ranges, beds/baths, two or more photos, bed mix, price tiers,
 *      and University Hill / Westcott addresses.
 *   2. Each rule actually fails when the data breaks it. A validator that only
 *      ever returns "fine" is worse than no validator, so every rule is proved
 *      against a deliberately broken clone of the real data.
 *   3. The CLI exits non-zero on bad data and zero on the real file.
 *
 * Nothing here opens a database or touches the network: the dataset is a plain
 * JSON file and photos are recorded as URLs, never fetched.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  ALLOWED_STREETS,
  loadSampleListings,
  PRICE_TIERS,
  REQUIRED_BEDROOM_COUNTS,
  SAMPLE_LISTINGS_PATH,
  streetOf,
  validateSampleData,
} from "../../src/lib/sampleListings.ts";
import type { SampleListingFile } from "../../src/lib/sampleListings.ts";

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(SERVER_ROOT, "scripts", "validate-sample-listings.ts");

/** A fresh deep copy of the real dataset, so a test can break one field. */
function cloneSample(): SampleListingFile {
  return structuredClone(loadSampleListings());
}

/** Runs the validator CLI against one file and resolves with its exit code. */
function runCli(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", CLI, file], {
      cwd: SERVER_ROOT,
      stdio: "ignore",
    });
    child.on("error", reject);
    // "close" rather than "exit": it fires once the child's streams are done,
    // so the test never finishes while a handle is still open.
    child.on("close", (code) => resolve(code ?? -1));
  });
}

describe("the committed sample data", () => {
  const data = loadSampleListings();

  it("passes every rule", () => {
    assert.deepEqual(validateSampleData(data), []);
  });

  it("is labelled as fictional sample data", () => {
    assert.equal(data.sampleData, true);
    assert.match(data.notice, /FICTIONAL SAMPLE DATA/);
    assert.equal(data.jira, "TM09-134");
  });

  it("has at least 20 listings", () => {
    assert.ok(data.listings.length >= 20, `only ${data.listings.length} listings`);
    assert.equal(data.listings.length, 24);
  });

  it("covers a studio and each of 1-4 bedrooms", () => {
    const beds = new Set(data.listings.map((l) => l.bedrooms));
    for (const n of REQUIRED_BEDROOM_COUNTS) {
      assert.ok(beds.has(n), `no listing with ${n} bedroom(s)`);
    }
  });

  it("spreads across at least three price tiers", () => {
    const filled = PRICE_TIERS.filter((tier) =>
      data.listings.some((l) => l.monthlyRent >= tier.min && l.monthlyRent <= tier.max),
    );
    assert.ok(filled.length >= 3, `only ${filled.length} tier(s) in use`);
  });

  it("gives every listing at least two photos and a valid date range", () => {
    for (const listing of data.listings) {
      assert.ok(listing.photos.length >= 2, `${listing.title} has ${listing.photos.length} photo(s)`);
      assert.ok(
        Date.parse(listing.availableFrom) < Date.parse(listing.availableTo),
        `${listing.title} has an inverted date range`,
      );
    }
  });

  it("puts every address on a University Hill / Westcott street", () => {
    for (const listing of data.listings) {
      assert.ok(streetOf(listing.address) !== null, `${listing.address} is off the allowed list`);
    }
  });

  it("uses Marshall St, which the story calls out by name", () => {
    assert.ok(data.listings.some((l) => streetOf(l.address) === "Marshall St"));
  });

  it("gives every host an obviously fake contact address", () => {
    for (const host of data.hosts) {
      assert.match(host.email, /@example\.edu$/, `${host.key} has a real-looking email`);
    }
  });
});

describe("validateSampleData rejects", () => {
  it("a dataset with fewer than 20 listings", () => {
    const data = cloneSample();
    data.listings = data.listings.slice(0, 19);
    assert.match(validateSampleData(data).join("\n"), /only 19 listings/);
  });

  it("an availability window that ends before it starts", () => {
    const data = cloneSample();
    data.listings[0].availableTo = "2026-01-01";
    assert.match(validateSampleData(data).join("\n"), /does not start before it ends/);
  });

  it("a date that is not YYYY-MM-DD", () => {
    const data = cloneSample();
    data.listings[0].availableFrom = "May 2026";
    assert.match(validateSampleData(data).join("\n"), /availableFrom is not a YYYY-MM-DD date/);
  });

  it("a listing with only one photo", () => {
    const data = cloneSample();
    data.listings[0].photos = [data.listings[0].photos[0]];
    assert.match(validateSampleData(data).join("\n"), /has 1 photo\(s\)/);
  });

  it("a photo that is not an https URL", () => {
    const data = cloneSample();
    data.listings[0].photos[1] = "/uploads/local.png";
    assert.match(validateSampleData(data).join("\n"), /photo\[1\] is not an https URL/);
  });

  it("an address off the allowed street list", () => {
    const data = cloneSample();
    data.listings[0].address = "1 Fake Blvd";
    assert.match(validateSampleData(data).join("\n"), /is not on an allowed/);
  });

  it("non-numeric beds and baths", () => {
    const data = cloneSample();
    // Deliberately wrong type: the file is hand-editable, so the validator
    // cannot trust the declared shape.
    (data.listings[0] as unknown as { bedrooms: unknown }).bedrooms = "two";
    (data.listings[1] as unknown as { bathrooms: unknown }).bathrooms = null;
    const problems = validateSampleData(data).join("\n");
    assert.match(problems, /bedrooms is not an integer/);
    assert.match(problems, /bathrooms is not a number/);
  });

  it("a missing required field", () => {
    const data = cloneSample();
    (data.listings[0] as unknown as { title?: string }).title = "";
    assert.match(validateSampleData(data).join("\n"), /missing title/);
  });

  it("a listing pointing at a host that does not exist", () => {
    const data = cloneSample();
    data.listings[0].host = "nobody";
    assert.match(validateSampleData(data).join("\n"), /unknown host "nobody"/);
  });

  it("a dataset missing the sample-data marker", () => {
    const data = cloneSample();
    (data as unknown as { sampleData: unknown }).sampleData = false;
    assert.match(validateSampleData(data).join("\n"), /missing the sample-data marker/);
  });

  it("a dataset with no studio", () => {
    const data = cloneSample();
    for (const listing of data.listings) {
      if (listing.bedrooms === 0) listing.bedrooms = 1;
    }
    assert.match(validateSampleData(data).join("\n"), /no listing for: studio/);
  });

  it("something that is not a JSON object at all", () => {
    assert.deepEqual(validateSampleData([1, 2, 3]), ["the file does not contain a JSON object"]);
  });
});

describe("the validate:sample CLI", () => {
  it("exits 0 for the committed data file", async () => {
    assert.equal(await runCli(SAMPLE_LISTINGS_PATH), 0);
  });

  it("exits non-zero for bad data", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subletu-sample-"));
    const bad = path.join(dir, "bad.json");
    const data = cloneSample();
    data.listings[0].availableTo = "2000-01-01";
    fs.writeFileSync(bad, JSON.stringify(data), "utf8");

    assert.equal(await runCli(bad), 1);

    // Best-effort cleanup; see the note in test/helpers/env.ts about Windows.
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore.
    }
  });

  it("exits non-zero for a file that does not exist", async () => {
    assert.equal(await runCli(path.join(os.tmpdir(), "subletu-does-not-exist.json")), 1);
  });
});

describe("ALLOWED_STREETS", () => {
  it("contains every street the story names", () => {
    const named = [
      "Euclid Ave",
      "Walnut Ave",
      "Ostrom Ave",
      "Comstock Ave",
      "Livingston Ave",
      "Westcott St",
      "Lancaster Ave",
      "Marshall St",
      "Harrison St",
    ];
    for (const street of named) assert.ok(ALLOWED_STREETS.includes(street), `${street} is missing`);
  });

  it("matches on the street, not on a coincidental substring", () => {
    assert.equal(streetOf("300 Euclid Ave"), "Euclid Ave");
    assert.equal(streetOf("300 euclid ave"), "Euclid Ave");
    assert.equal(streetOf("Euclid Ave Extension"), null);
    assert.equal(streetOf("12 Nowhere Rd"), null);
  });
});
