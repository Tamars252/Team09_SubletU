import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ApiError, api } from "./api/client.ts";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { HOME_PATH, REGISTER_PATH, SIGN_IN_PATH } from "./auth/guard.ts";
import { Register } from "./screens/Register.tsx";
import { SignIn } from "./screens/SignIn.tsx";
import { useAuth } from "./state/AuthContext.tsx";
import type { Filters, Listing, Reference } from "./api/types.ts";
import { EMPTY_FILTERS, activeFilterCount } from "./api/types.ts";
import { FilterSheet } from "./components/FilterSheet.tsx";
import { IconSliders } from "./components/Icons.tsx";
import { ListingCard } from "./components/ListingCard.tsx";
import { LISTING_PATH } from "./lib/listing.ts";
import { ListingDetail } from "./screens/ListingDetail.tsx";

type Results =
  | { kind: "loading" }
  | { kind: "ok"; total: number; listings: Listing[] }
  | { kind: "error"; message: string };

/**
 * The signed-in shell. Screens (swipe deck, map, post, saved, messages,
 * profile) plug into `app-main` in later stories.
 *
 * The filter state lives here so every screen that lists listings (the deck,
 * the map) reads the same filters. Until the deck lands, the main area shows
 * how many listings match and the first few as cards that open the detail
 * view.
 */
function AppShell() {
  const { user, logout } = useAuth();
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
          <button type="button" className="btn btn-sm btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="center-state">
          {results.kind === "loading" && <div className="spinner" />}

          {results.kind === "ok" && (
            <>
              {user && <p className="muted">Signed in as {user.name}</p>}
              <h3 data-testid="match-count">
                {results.total === 1 ? "1 listing" : `${results.total} listings`}
                {filterCount === 0 ? " near campus" : results.total === 1 ? " matches your filters" : " match your filters"}
              </h3>
              {results.listings.length > 0 && (
                <ul className="listing-list">
                  {results.listings.map((l) => (
                    <li key={l.id}>
                      <ListingCard listing={l} />
                    </li>
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

/**
 * Routes. The auth screens are public; everything else sits behind
 * ProtectedRoute, which sends signed-out visitors to the sign-in screen and
 * remembers where they were headed.
 */
export function App() {
  return (
    <Routes>
      <Route path={SIGN_IN_PATH} element={<SignIn />} />
      <Route path={REGISTER_PATH} element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route path={HOME_PATH} element={<AppShell />} />
        <Route path={LISTING_PATH} element={<ListingDetail />} />
      </Route>
      {/* Unknown URLs go through the guard rather than 404-ing, so a stale
          deep link still ends at sign-in when there is no session. */}
      <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
    </Routes>
  );
}
