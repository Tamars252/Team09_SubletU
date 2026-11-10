import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api/client.ts";
import { HOME_PATH } from "../auth/guard.ts";
import { IconX } from "../components/Icons.tsx";
import {
  beginRemove,
  formatAvailability,
  formatLocation,
  formatRent,
  hasRent,
  listingDetailPath,
  primaryPhotoUrl,
  rollbackRemove,
  sortBySavedAt,
  unavailableLabel,
} from "../lib/saved.ts";
import type { Listing } from "../api/types.ts";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; listings: Listing[] };

/**
 * TM09-101: the Saved screen.
 *
 * Reads GET /api/saved, which returns only the signed-in renter's saves and
 * already leaves out listings a host removed. Everything it decides — the
 * ordering, the optimistic unsave and its rollback, the card's fallbacks —
 * lives in lib/saved.ts so it can be tested without a DOM.
 */
export function Saved() {
  const [state, setState] = useState<State>({ kind: "loading" });
  /** A failed unsave, shown above the list after the card is put back. */
  const [unsaveError, setUnsaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    let stale = false;
    setState({ kind: "loading" });
    setUnsaveError(null);
    api
      .saved()
      .then(({ results }) => {
        if (!stale) setState({ kind: "ok", listings: sortBySavedAt(results) });
      })
      .catch((err: unknown) => {
        if (stale) return;
        setState({
          kind: "error",
          message: err instanceof ApiError ? err.message : "Something went wrong.",
        });
      });
    return () => {
      stale = true;
    };
  }, []);

  useEffect(load, [load]);

  /**
   * AC3: the card goes straight away, then the DELETE runs. If it fails the
   * card comes back where it was and the renter is told why — losing a save
   * silently would be worse than the error.
   */
  async function unsave(listingId: string) {
    if (state.kind !== "ok") return;
    const removal = beginRemove(state.listings, listingId);
    if (!removal) return;

    setUnsaveError(null);
    setState({ kind: "ok", listings: removal.next });

    try {
      await api.unsave(listingId);
    } catch (err: unknown) {
      setState((current) =>
        current.kind === "ok"
          ? { kind: "ok", listings: rollbackRemove(current.listings, removal) }
          : current,
      );
      setUnsaveError(
        err instanceof ApiError
          ? err.message
          : "Couldn't remove that listing. It is still saved.",
      );
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="center-state" role="status" aria-live="polite">
        <div className="spinner" />
        <span className="sr-only">Loading your saved listings…</span>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="center-state">
        <h3>Can't load your saved listings</h3>
        <p className="muted">{state.message}</p>
        <button type="button" className="btn btn-primary" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  if (state.listings.length === 0) {
    return (
      <div className="center-state">
        <h3>Nothing saved yet</h3>
        <p className="muted">
          Listings you save while browsing show up here, newest first.
        </p>
        <Link className="btn btn-primary" to={HOME_PATH}>
          Browse listings
        </Link>
      </div>
    );
  }

  return (
    <div className="saved-list">
      {unsaveError && (
        <div className="banner error" role="alert">
          {unsaveError}
        </div>
      )}

      <h2 className="section-title">
        {state.listings.length === 1 ? "1 saved listing" : `${state.listings.length} saved listings`}
      </h2>

      <ul className="saved-cards">
        {state.listings.map((listing) => (
          <SavedCard key={listing.id} listing={listing} onUnsave={() => unsave(listing.id)} />
        ))}
      </ul>
    </div>
  );
}

function SavedCard({ listing, onUnsave }: { listing: Listing; onUnsave: () => void }) {
  const photo = primaryPhotoUrl(listing);
  const unavailable = unavailableLabel(listing);
  const location = formatLocation(listing);

  return (
    <li className="saved-card">
      {/* The whole card is the link. The web listing-detail screen is a
          separate story — see docs/saved-screen.md. */}
      <Link className="list-card" to={listingDetailPath(listing.id)}>
        <div
          className="list-thumb"
          style={photo ? { backgroundImage: `url(${photo})` } : undefined}
          role="img"
          aria-label={photo ? `Photo of ${listing.title}` : "No photo yet"}
        />
        <div className="list-body">
          <span className="list-price">
            {formatRent(listing)}
            {/* No "/mo" on "Rent not listed" — it would read as a price. */}
            {hasRent(listing) && <small>/mo</small>}
          </span>
          <span className="list-title">{listing.title}</span>
          {location && <span className="tiny">{location}</span>}
          <span className="tiny">{formatAvailability(listing)}</span>
          {unavailable && <span className="chip outline">{unavailable}</span>}
        </div>
      </Link>

      <div className="saved-unsave">
        <button
          type="button"
          className="icon-btn"
          onClick={onUnsave}
          aria-label={`Remove ${listing.title} from saved`}
        >
          <IconX size={17} />
        </button>
      </div>
    </li>
  );
}
