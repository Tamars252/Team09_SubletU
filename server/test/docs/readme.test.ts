/**
 * The README's class table stays in step with the Visual Paradigm model.
 *
 * Reads the class names straight out of classDiagram.vpp, which is an SQLite
 * database, opened read-only so the test can never modify it. Only the
 * MODEL_ELEMENT table's NAME and MODEL_TYPE columns are used, not Visual
 * Paradigm's internal definition format, so re-saving the model in a newer
 * version does not break this.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function modelClasses(file: string): string[] {
  const db = new DatabaseSync(path.join(ROOT, file), { readOnly: true });
  try {
    const rows = db
      .prepare("SELECT NAME FROM MODEL_ELEMENT WHERE MODEL_TYPE = 'Class' ORDER BY NAME")
      .all() as Array<{ NAME: string }>;
    return rows.map((row) => row.NAME);
  } finally {
    db.close();
  }
}

/** The rows of the "Class diagram to code" table: class name and linked files. */
function readmeTable(): Array<{ name: string; files: string[] }> {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const section = readme.split(/^## /m).find((part) => part.startsWith("Class diagram to code"));
  assert.ok(section, 'README.md has a "Class diagram to code" section');
  return section
    .split("\n")
    .map((line) => /^\| `(\w+)` \| (.*?) \|/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      name: match[1],
      files: [...match[2].matchAll(/\]\(([^)]+)\)/g)].map((link) => link[1]),
    }));
}

describe("README class table", () => {
  it("has a row for every class in classDiagram.vpp, and no others", () => {
    const fromModel = modelClasses("classDiagram.vpp");
    assert.ok(fromModel.length > 0, "the model has classes");
    assert.deepEqual(readmeTable().map((row) => row.name).sort(), fromModel);
  });

  it("links every class to files that exist", () => {
    for (const row of readmeTable()) {
      assert.ok(row.files.length > 0, `${row.name} links to at least one file`);
      for (const file of row.files) {
        assert.ok(fs.existsSync(path.join(ROOT, file)), `${row.name}: ${file} exists`);
      }
    }
  });

  it("covers the copy of the class diagram in UseCase.vpp too", () => {
    assert.deepEqual(modelClasses("UseCase.vpp"), modelClasses("classDiagram.vpp"));
  });

  it("is next to the models it describes", () => {
    for (const file of ["classDiagram.vpp", "UseCase.vpp", "Class Diagram1.pdf"]) {
      assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is committed at the repo root`);
    }
  });
});
