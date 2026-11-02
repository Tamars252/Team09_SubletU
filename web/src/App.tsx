import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client.ts";
import type { Filters, Listing, Reference } from "./api/types.ts";
import { EMPTY_FILTERS, activeFilterCount } from "./api/types.ts";
import { FilterSheet } from "./components/FilterSheet.tsx";
import { IconSliders } from "./components/Icons.tsx";

type Results =
  | { kind: "loading" }
  | { kind: "ok"; total: number; listings: Listing[] }
  | { kind: "error"; message: string };

/**
 * Front-end shell. Screens (sign-in, swipe deck, map, post, saved, messages,
 * profile) plug into `app-main` in later stories.
 *
 * The filter state lives here so every screen that lists listings (the deck,
 * the map) reads the same filters. Until the deck lands, the main area shows
 * how many listings match and the first few titles.
 */
export function App() {
  const [reference, setReference] = useState<Reference | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState<Results>({ kind: "loading" });

  useEffect(() => {
    api
      .reference()
      .then(setReference)
      .catch(() => undefined);
  }, []);

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
    <div className="app">
      <header className="header">
        <span className="header-title">SubletU</span>
        <div className="header-actions">
          <button
            type="button"
            className={`icon-btn${filterCount > 0 ? " active" : ""}`}
            onClick={() => setShowFilters(true)}
            aria-label="Filters"
          >
            <IconSliders size={19} />
            {filterCount > 0 && <span className="badge">{filterCount}</span>}
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="center-state">
          {results.kind === "loading" && <div className="spinner" />}

          {results.kind === "ok" && (
            <>
              <h3 data-testid="match-count">
                {results.total === 1 ? "1 listing" : `${results.total} listings`}
                {filterCount === 0 ? " near campus" : results.total === 1 ? " matches your filters" : " match your filters"}
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
      </main>

      {showFilters && (
        <FilterSheet
          filters={filters}
          reference={reference}
          onApply={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}
