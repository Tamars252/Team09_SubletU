import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client.ts";
import type { Filters, Listing, Reference } from "../api/types.ts";
import { activeFilterCount } from "../api/types.ts";
import { SwipeCard } from "../components/SwipeCard.tsx";
import type { SwipeDirection } from "../components/SwipeCard.tsx";
import { FilterSheet } from "../components/FilterSheet.tsx";
import {
  IconHeart,
  IconPlus,
  IconRewind,
  IconSliders,
  IconX,
  IconFlag,
} from "../components/Icons.tsx";

type Props = {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  reference: Reference | null;
  onOpenListing: (listing: Listing) => void;
  onReport: (listing: Listing) => void;
  onSavedChange: () => void;
  onOpenPost: () => void;
};

const PREFETCH_BELOW = 4;

export function Browse({
  filters,
  onFiltersChange,
  reference,
  onOpenListing,
  onReport,
  onSavedChange,
  onOpenPost,
}: Props) {
  const [deck, setDeck] = useState<Listing[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flyOut, setFlyOut] = useState<SwipeDirection | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  // Guards against a second swipe landing while the first is still animating.
  const busy = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { results, remaining: left } = await api.deck(filters);
      setDeck(results);
      setRemaining(left);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load listings");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const top = deck[0] ?? null;

  const commit = useCallback(
    async (direction: SwipeDirection) => {
      const listing = deck[0];
      setFlyOut(null);
      setDeck((d) => d.slice(1));
      busy.current = false;
      if (!listing) return;

      setCanUndo(true);
      try {
        const result = await api.swipe(listing.id, direction);
        setRemaining(result.remaining);
        if (direction === "right") {
          setToast(`Saved ${listing.address}`);
          onSavedChange();
        }
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Swipe did not save");
      }
    },
    [deck, onSavedChange],
  );

  // Top up the deck before it runs dry.
  useEffect(() => {
    if (loading || deck.length > PREFETCH_BELOW || remaining <= deck.length) return;
    let cancelled = false;
    api
      .deck(filters)
      .then(({ results, remaining: left }) => {
        if (cancelled) return;
        setRemaining(left);
        setDeck((current) => {
          const have = new Set(current.map((l) => l.id));
          return [...current, ...results.filter((l) => !have.has(l.id))];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [deck.length, remaining, loading, filters]);

  function trigger(direction: SwipeDirection) {
    if (busy.current || !top) return;
    busy.current = true;
    setFlyOut(direction);
  }

  async function undo() {
    try {
      const { ok, listing } = await api.undoSwipe();
      if (!ok || !listing) {
        setToast("Nothing to undo");
        setCanUndo(false);
        return;
      }
      setDeck((d) => [listing, ...d]);
      setRemaining((r) => r + 1);
      setCanUndo(false);
      onSavedChange();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not undo");
    }
  }

  async function reset() {
    try {
      await api.resetSwipes(true);
      setCanUndo(false);
      await load();
      setToast("Browsing reset — saved listings kept");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not reset");
    }
  }

  const filterCount = activeFilterCount(filters);

  return (
    <>
      <div className="header">
        <div className="wordmark">
          Sublet<span>U</span>
        </div>
        <div className="header-actions">
          <button type="button" className="icon-btn" onClick={onOpenPost} aria-label="Post a listing">
            <IconPlus size={19} />
          </button>
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
      </div>

      <div className="deck">
        <div className="deck-progress">
          <span>
            {remaining > 0 ? `${remaining} listing${remaining === 1 ? "" : "s"} left` : "All caught up"}
          </span>
          {filterCount > 0 && (
            <button
              type="button"
              style={{ color: "var(--terracotta)", fontWeight: 600, fontSize: 11.5 }}
              onClick={() => onFiltersChange({ ...filters, ...emptyButSort(filters.sort) })}
            >
              Clear {filterCount} filter{filterCount === 1 ? "" : "s"}
            </button>
          )}
        </div>

        <div className="deck-stage">
          {loading && (
            <div className="center-state">
              <div className="spinner" />
              <p>Finding sublets near campus…</p>
            </div>
          )}

          {!loading && error && (
            <div className="center-state">
              <h3>Couldn't load listings</h3>
              <p>{error}</p>
              <button type="button" className="btn btn-primary" onClick={() => void load()}>
                Try again
              </button>
            </div>
          )}

          {!loading && !error && deck.length === 0 && (
            <div className="center-state">
              <h3>{filterCount > 0 ? "No matches" : "You've seen everything"}</h3>
              <p>
                {filterCount > 0
                  ? "Nothing matches these filters right now. Loosen them and try again."
                  : "You've been through every active sublet. Reset to browse them again, or check your saved list."}
              </p>
              {filterCount > 0 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onFiltersChange({ ...filters, ...emptyButSort(filters.sort) })}
                >
                  Clear filters
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => void reset()}>
                  Reset browsing
                </button>
              )}
            </div>
          )}

          {/* Render three cards deep so the stack has visible depth. */}
          {deck.slice(0, 3).map((listing, index) => (
            <SwipeCard
              key={listing.id}
              listing={listing}
              depth={index}
              interactive={index === 0}
              flyOut={index === 0 ? flyOut : null}
              onSwiped={commit}
              onOpen={onOpenListing}
            />
          ))}
        </div>

        {top && (
          <div className="deck-controls">
            <button
              type="button"
              className="deck-btn small"
              onClick={() => void undo()}
              disabled={!canUndo}
              aria-label="Undo last swipe"
            >
              <IconRewind size={19} />
            </button>
            <button
              type="button"
              className="deck-btn pass"
              onClick={() => trigger("left")}
              aria-label="Pass"
            >
              <IconX size={26} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              className="deck-btn like"
              onClick={() => trigger("right")}
              aria-label="Save"
            >
              <IconHeart size={30} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="deck-btn small"
              onClick={() => onReport(top)}
              aria-label="Report this listing"
            >
              <IconFlag size={18} />
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(var(--nav-height) + 84px)",
            left: 20,
            right: 20,
            padding: "11px 16px",
            borderRadius: 14,
            background: "rgba(45,52,54,0.92)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            textAlign: "center",
            zIndex: 40,
            pointerEvents: "none",
          }}
        >
          {toast}
        </div>
      )}

      {showFilters && (
        <FilterSheet
          filters={filters}
          reference={reference}
          onApply={onFiltersChange}
          onClose={() => setShowFilters(false)}
        />
      )}
    </>
  );
}

function emptyButSort(sort: string) {
  return {
    q: "",
    maxPrice: null,
    minBedrooms: null,
    minBathrooms: null,
    petsAllowed: false,
    furnished: false,
    utilitiesIncluded: false,
    amenities: [] as string[],
    availableFrom: "",
    availableTo: "",
    radiusMiles: null,
    sort,
  };
}
