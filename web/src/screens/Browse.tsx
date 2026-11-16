import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client.ts";
import { useAuth } from "../state/AuthContext.tsx";
import { useShell } from "../components/AppShell.tsx";
import { EMPTY_FILTERS, activeFilterCount } from "../api/types.ts";
import type { Listing } from "../api/types.ts";

type Results =
  | { kind: "loading" }
  | { kind: "ok"; total: number; listings: Listing[] }
  | { kind: "error"; message: string };

/**
 * The home screen. Until the swipe deck lands it shows how many listings match
 * the current filters and the first few titles.
 *
 * Moved out of App.tsx in TM09-101 so Saved could sit beside it under the same
 * header and nav; the behaviour is unchanged. The filters come from the shell
 * so every screen that lists listings reads the same ones.
 */
export function Browse() {
  const { user } = useAuth();
  const { filters, setFilters } = useShell();
  const [results, setResults] = useState<Results>({ kind: "loading" });

  useEffect(() => {
    let stale = false;
    setResults({ kind: "loading" });
    api
      .listings(filters, { limit: "5" })
      .then(({ total, results: listings }) => {
        if (!stale) setResults({ kind: "ok", total, listings });
      })
      .catch((err: unknown) => {
        if (stale) return;
        setResults({
          kind: "error",
          message: err instanceof ApiError ? err.message : "Something went wrong.",
        });
      });
    return () => {
      stale = true;
    };
  }, [filters]);

  const filterCount = activeFilterCount(filters);

  return (
    <div className="center-state">
      {results.kind === "loading" && <div className="spinner" />}

      {results.kind === "ok" && (
        <>
          {user && <p className="muted">Signed in as {user.name}</p>}
          <h3 data-testid="match-count">
            {results.total === 1 ? "1 listing" : `${results.total} listings`}
            {filterCount === 0
              ? " near campus"
              : results.total === 1
                ? " matches your filters"
                : " match your filters"}
          </h3>
          {results.listings.length > 0 && (
            <ul className="muted" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {results.listings.map((l) => (
                <li key={l.id}>{l.title}</li>
              ))}
            </ul>
          )}
          {filterCount > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Clear filters
            </button>
          )}
        </>
      )}

      {results.kind === "error" && (
        <>
          <h3>Can't reach the API</h3>
          <p className="muted">{results.message}</p>
          <p className="muted">
            Start it with <code>npm run dev</code> from the repo root.
          </p>
        </>
      )}
    </div>
  );
}
