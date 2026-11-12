import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api/client.ts";
import type { Listing } from "../api/types.ts";
import { EMPTY_FILTERS, activeFilterCount } from "../api/types.ts";
import { useShell } from "../components/AppShell.tsx";
import { FLY_OUT_MS, SwipeCard } from "../components/SwipeCard.tsx";
import { IconHeart, IconRewind, IconX } from "../components/Icons.tsx";
import { emptyDeckState, mergeDeck, needsRefill, withoutListing } from "../lib/deck.ts";
import type { Direction } from "../lib/deck.ts";

type Load = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

const PAGE = 20;

/**
 * The swipe deck. Right saves (the server writes the saved row, TM09-149),
 * left passes. The deck comes from GET /listings/deck, which already leaves
 * out anything this renter swiped or owns. The filters come from the shell
 * (TM09-101), so the filter sheet in the header narrows the deck.
 */
export function Browse() {
  const { filters, setFilters } = useShell();
  const onClearFilters = () => setFilters(EMPTY_FILTERS);
  const [cards, setCards] = useState<Listing[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [flyOut, setFlyOut] = useState<Direction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const fetchDeck = useCallback(
    async (replace: boolean) => {
      try {
        const { results, remaining: left } = await api.deck(filters, PAGE);
        setCards((current) => (replace ? results : mergeDeck(current, results, inFlight.current)));
        setRemaining(left);
        setLoad({ kind: "ready" });
      } catch (err) {
        setLoad({
          kind: "error",
          message: err instanceof ApiError ? err.message : "Something went wrong.",
        });
      }
    },
    [filters],
  );

  useEffect(() => {
    setLoad({ kind: "loading" });
    void fetchDeck(true);
  }, [fetchDeck]);

  const top = cards[0];

  async function decide(direction: Direction) {
    if (!top) return;
    const id = top.id;
    setFlyOut(null);
    inFlight.current.add(id);
    const next = withoutListing(cards, id);
    setCards(next);
    try {
      const res = await api.swipe(id, direction);
      setRemaining(res.remaining);
      if (needsRefill(next.length, res.remaining)) void fetchDeck(false);
    } catch (err) {
      // Put the card back so the decision isn't silently lost.
      setCards((current) => [top, ...withoutListing(current, id)]);
      setNotice(err instanceof ApiError ? err.message : "That swipe didn't go through. Try again.");
    } finally {
      inFlight.current.delete(id);
    }
  }

  function tap(direction: Direction) {
    if (!top || flyOut) return;
    setFlyOut(direction);
    window.setTimeout(() => void decide(direction), FLY_OUT_MS);
  }

  async function undo() {
    try {
      const res = await api.undoSwipe();
      if (res.ok && res.listing) {
        setCards((current) => [res.listing as Listing, ...withoutListing(current, res.listing!.id)]);
      } else {
        setNotice(res.message ?? "Nothing to undo");
      }
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Couldn't undo that swipe.");
    }
  }

  async function resetBrowsing() {
    setLoad({ kind: "loading" });
    try {
      await api.resetSwipes(true);
      await fetchDeck(true);
    } catch (err) {
      setLoad({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Couldn't reset browsing.",
      });
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") tap("right");
      if (e.key === "ArrowLeft") tap("left");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (load.kind === "loading") {
    return (
      <div className="center-state">
        <div className="spinner" />
      </div>
    );
  }

  if (load.kind === "error") {
    return (
      <div className="center-state">
        <h3>Can't load listings</h3>
        <p>{load.message}</p>
        <button type="button" className="btn btn-secondary" onClick={() => void fetchDeck(true)}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <DeckView
      cards={cards}
      remaining={remaining}
      flyOut={flyOut}
      notice={notice}
      empty={emptyDeckState(activeFilterCount(filters))}
      onDecide={(d) => void decide(d)}
      onTap={tap}
      onUndo={() => void undo()}
      onReset={() => void resetBrowsing()}
      onClearFilters={onClearFilters}
      onDismissNotice={() => setNotice(null)}
    />
  );
}

type ViewProps = {
  cards: Listing[];
  remaining: number;
  flyOut: Direction | null;
  notice: string | null;
  empty: ReturnType<typeof emptyDeckState>;
  onDecide: (d: Direction) => void;
  onTap: (d: Direction) => void;
  onUndo: () => void;
  onReset: () => void;
  onClearFilters: () => void;
  onDismissNotice: () => void;
};

/** The deck without the data fetching, so it can be rendered from fixtures. */
export function DeckView(p: ViewProps) {
  const [top, behind] = p.cards;

  if (!top) {
    return (
      <div className="center-state" data-testid="deck-empty">
        <h3>{p.empty.title}</h3>
        <p>{p.empty.body}</p>
        <button type="button" className="btn btn-primary" onClick={p.onReset} data-testid="reset-browsing">
          Reset browsing
        </button>
        {p.empty.showClear && (
          <button type="button" className="btn btn-secondary" onClick={p.onClearFilters}>
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="deck" data-testid="deck">
      {p.notice && (
        <div className="banner error" role="alert" onClick={p.onDismissNotice}>
          {p.notice}
        </div>
      )}
      <div className="deck-progress">
        <span>{p.remaining === 1 ? "1 listing left" : `${p.remaining} listings left`}</span>
        <span>Swipe right to save</span>
      </div>
      <div className="deck-stage">
        {behind && <SwipeCard key={behind.id} listing={behind} behind />}
        <SwipeCard key={top.id} listing={top} flyOut={p.flyOut} onDecide={p.onDecide} />
      </div>
      <div className="deck-controls">
        <button type="button" className="deck-btn small" onClick={p.onUndo} aria-label="Undo last swipe">
          <IconRewind size={20} />
        </button>
        <button type="button" className="deck-btn pass" onClick={() => p.onTap("left")} aria-label="Pass">
          <IconX size={26} strokeWidth={2.5} />
        </button>
        <button type="button" className="deck-btn like" onClick={() => p.onTap("right")} aria-label="Save">
          <IconHeart size={28} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
