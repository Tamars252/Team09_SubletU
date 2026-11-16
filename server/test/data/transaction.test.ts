/**
 * TM09-121: transaction() nesting.
 *
 * SQLite cannot BEGIN inside a BEGIN, so before this the only safe way to call
 * transaction() was from somewhere that was definitely not already in one —
 * a rule nothing enforced. The nested form has to behave the way a caller
 * wrapping two already-atomic operations expects:
 *
 *   - both succeed      -> everything commits
 *   - inner throws,
 *     outer catches     -> only the inner statements are undone
 *   - outer throws       -> everything is undone, inner work included
 *
 * Writes go to `geocache`: one text key, no foreign keys, and nothing else in
 * this file cares what is in it.
 */
import "../helpers/env.ts";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { db, nowIso, transaction } from "../../src/db.ts";

function write(key: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO geocache (query, lat, lng, display_name, created_at) VALUES (?, 1, 2, NULL, ?)",
  ).run(key, nowIso());
}

function stored(): string[] {
  const rows = db.prepare("SELECT query FROM geocache ORDER BY query").all() as Array<{
    query: string;
  }>;
  return rows.map((r) => r.query);
}

beforeEach(() => {
  db.exec("DELETE FROM geocache");
});

describe("transaction: not nested", () => {
  it("commits what the callback wrote", () => {
    transaction(() => write("a"));

    assert.deepEqual(stored(), ["a"]);
  });

  it("rolls back and re-throws when the callback fails", () => {
    assert.throws(() => {
      transaction(() => {
        write("a");
        throw new Error("nope");
      });
    }, /nope/);

    assert.deepEqual(stored(), []);
  });

  it("returns the callback's value", () => {
    assert.equal(
      transaction(() => 42),
      42,
    );
  });
});

describe("transaction: nested, both succeed", () => {
  it("commits the outer and the inner writes together", () => {
    transaction(() => {
      write("outer");
      transaction(() => write("inner"));
      write("outer-after");
    });

    assert.deepEqual(stored(), ["inner", "outer", "outer-after"]);
  });

  it("leaves the released inner write in place for the rest of the outer call", () => {
    let seenMidway: string[] = [];
    transaction(() => {
      write("outer");
      transaction(() => write("inner"));
      seenMidway = stored();
    });

    // RELEASE ends the savepoint without undoing anything, so the outer call
    // goes on to see what the inner one wrote.
    assert.deepEqual(seenMidway, ["inner", "outer"]);
    assert.deepEqual(stored(), ["inner", "outer"]);
  });

  it("nests three deep", () => {
    transaction(() => {
      write("one");
      transaction(() => {
        write("two");
        transaction(() => write("three"));
      });
    });

    assert.deepEqual(stored(), ["one", "three", "two"]);
  });
});

describe("transaction: inner throws, outer catches", () => {
  it("rolls back only the inner writes", () => {
    transaction(() => {
      write("outer");
      try {
        transaction(() => {
          write("inner");
          throw new Error("inner failed");
        });
      } catch {
        // Swallowed on purpose: the outer operation carries on without it.
      }
      write("outer-after");
    });

    assert.deepEqual(stored(), ["outer", "outer-after"]);
  });

  it("lets the outer call keep writing afterwards", () => {
    transaction(() => {
      try {
        transaction(() => {
          write("inner");
          throw new Error("inner failed");
        });
      } catch {
        // See above.
      }
      transaction(() => write("inner-two"));
    });

    assert.deepEqual(stored(), ["inner-two"]);
  });

  it("does not leave a savepoint behind when the outer swallows several", () => {
    transaction(() => {
      for (const key of ["a", "b", "c"]) {
        try {
          transaction(() => {
            write(key);
            throw new Error(`${key} failed`);
          });
        } catch {
          // See above.
        }
      }
      write("survivor");
    });

    assert.deepEqual(stored(), ["survivor"]);
  });
});

describe("transaction: outer throws", () => {
  it("rolls back the inner writes too, even though they were released", () => {
    assert.throws(() => {
      transaction(() => {
        write("outer");
        transaction(() => write("inner"));
        throw new Error("outer failed");
      });
    }, /outer failed/);

    assert.deepEqual(stored(), []);
  });

  it("rolls back everything when the inner failure is what reaches the outer", () => {
    assert.throws(() => {
      transaction(() => {
        write("outer");
        transaction(() => {
          write("inner");
          throw new Error("inner failed");
        });
      });
    }, /inner failed/);

    assert.deepEqual(stored(), []);
  });
});

describe("transaction: depth bookkeeping", () => {
  it("is back at the top level after a failed transaction", () => {
    assert.throws(() => {
      transaction(() => {
        throw new Error("nope");
      });
    });

    // If the depth counter had not been restored, this would try to open a
    // savepoint with no transaction around it and commit nothing.
    transaction(() => write("after"));
    assert.deepEqual(stored(), ["after"]);
  });

  it("is back at the top level after a failed nested transaction", () => {
    assert.throws(() => {
      transaction(() => {
        transaction(() => {
          throw new Error("nope");
        });
      });
    });

    transaction(() => write("after"));
    assert.deepEqual(stored(), ["after"]);
  });
});
