/**
 * TM09-134: checks the committed sample dataset against its acceptance
 * criteria. Exits non-zero when anything is wrong, so CI can gate on it.
 *
 *     npm run validate:sample
 *     npm run validate:sample -- path/to/other.json
 *
 * It reads one JSON file and nothing else: no database, no network, no photo
 * downloads. The rules live in src/lib/sampleListings.ts so the tests can
 * exercise them directly.
 */
import {
  loadSampleListings,
  SAMPLE_LISTINGS_PATH,
  validateSampleData,
} from "../src/lib/sampleListings.ts";

function main(): number {
  const file = process.argv[2] ?? SAMPLE_LISTINGS_PATH;

  let data: unknown;
  try {
    data = loadSampleListings(file);
  } catch (err) {
    // Missing or malformed JSON is itself a validation failure, not a crash.
    console.error(`\n  ✗ could not read ${file}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  const problems = validateSampleData(data);

  if (problems.length > 0) {
    console.error(`\n  ✗ ${file}`);
    console.error(`    ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`      - ${problem}`);
    console.error("");
    return 1;
  }

  const { listings } = data as { listings: unknown[] };
  console.log(`\n  ✓ ${file}`);
  console.log(`    ${listings.length} sample listings, all rules passed.\n`);
  return 0;
}

process.exitCode = main();
