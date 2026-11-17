import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { api } from "../api/client.ts";
import { useAuth } from "../state/AuthContext.tsx";
import { BottomNav } from "./BottomNav.tsx";
import { FilterSheet } from "./FilterSheet.tsx";
import { IconSliders } from "./Icons.tsx";
import { HOME_PATH, MESSAGES_PATH } from "../auth/guard.ts";
import { startUnreadPoller } from "../lib/messages.ts";
import type { UnreadPoller } from "../lib/messages.ts";
import { EMPTY_FILTERS, activeFilterCount } from "../api/types.ts";
import type { Filters, Reference } from "../api/types.ts";

export type ShellContext = {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  reference: Reference | null;
  /** Unread messages across the inbox, polled every 20 s (TM09-104). */
  unread: number;
  /** Ask for the unread count now, e.g. after a thread marked messages read. */
  refreshUnread: () => void;
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
 *
 * The unread count lives here too, so the Messages tab badge keeps polling
 * whichever screen is showing.
 */
export function AppShell() {
  const { logout } = useAuth();
  const location = useLocation();
  const [reference, setReference] = useState<Reference | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [unread, setUnread] = useState(0);
  const poller = useRef<UnreadPoller | null>(null);

  // TM09-104 AC2: the badge polls every 20 s for as long as someone is signed
  // in. Signing out unmounts the shell, which stops it.
  useEffect(() => {
    const started = startUnreadPoller(
      () => api.unreadCount().then(({ unread: count }) => count),
      setUnread,
    );
    poller.current = started;
    return () => {
      started.stop();
      poller.current = null;
    };
  }, []);

  const refreshUnread = useCallback(() => {
    void poller.current?.refresh();
  }, []);

  useEffect(() => {
    api
      .reference()
      .then(setReference)
      .catch(() => undefined);
  }, []);

  const filterCount = activeFilterCount(filters);
  const filterable = location.pathname === HOME_PATH;
  // A thread scrolls its own message list and pins the composer to the bottom.
  const inThread = location.pathname.startsWith(`${MESSAGES_PATH}/`);

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

      <main className={`app-main${filterable ? " deck-host" : ""}${inThread ? " no-scroll" : ""}`}>
        <Outlet
          context={{ filters, setFilters, reference, unread, refreshUnread } satisfies ShellContext}
        />
      </main>

      <BottomNav badges={{ [MESSAGES_PATH]: unread }} />

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
