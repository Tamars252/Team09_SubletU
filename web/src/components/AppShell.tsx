import { useEffect, useState } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { api } from "../api/client.ts";
import { useAuth } from "../state/AuthContext.tsx";
import { BottomNav } from "./BottomNav.tsx";
import { FilterSheet } from "./FilterSheet.tsx";
import { IconSliders } from "./Icons.tsx";
import { HOME_PATH } from "../auth/guard.ts";
import { EMPTY_FILTERS, activeFilterCount } from "../api/types.ts";
import type { Filters, Reference } from "../api/types.ts";

export type ShellContext = {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  reference: Reference | null;
};

/** The shell's filter state, read by the screens rendered through `Outlet`. */
export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}

/**
 * The signed-in shell: header, the screen itself, and the bottom nav.
 *
 * Used as a layout route inside ProtectedRoute, so every screen underneath is
 * signed-in only without checking the session itself.
 *
 * The filter state lives here so every screen that lists listings (the deck,
 * the map) reads the same filters. The filter control only appears on the
 * screens that actually filter — Saved shows everything the renter saved.
 */
export function AppShell() {
  const { logout } = useAuth();
  const location = useLocation();
  const [reference, setReference] = useState<Reference | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api
      .reference()
      .then(setReference)
      .catch(() => undefined);
  }, []);

  const filterCount = activeFilterCount(filters);
  const filterable = location.pathname === HOME_PATH;

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">SubletU</span>
        <div className="header-actions">
          {filterable && (
            <button
              type="button"
              className={`icon-btn${filterCount > 0 ? " active" : ""}`}
              onClick={() => setShowFilters(true)}
              aria-label="Filters"
            >
              <IconSliders size={19} />
              {filterCount > 0 && <span className="badge">{filterCount}</span>}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet context={{ filters, setFilters, reference } satisfies ShellContext} />
      </main>

      <BottomNav />

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
