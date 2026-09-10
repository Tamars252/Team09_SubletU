import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { Listing } from "../api/types.ts";
import { ListingRow } from "../components/ListingRow.tsx";
import { IconHeart } from "../components/Icons.tsx";

type Props = {
  onOpenListing: (listing: Listing) => void;
  onSavedChange: () => void;
  refreshKey: number;
  onBrowse: () => void;
};

export function Saved({ onOpenListing, onSavedChange, refreshKey, onBrowse }: Props) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { results } = await api.saved();
      setListings(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load saved listings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function unsave(listing: Listing) {
    // Optimistic: the row disappears immediately, then we reconcile.
    setListings((current) => current.filter((l) => l.id !== listing.id));
    try {
      await api.unsave(listing.id);
      onSavedChange();
    } catch {
      void load();
    }
  }

  const total = listings.reduce((sum, l) => sum + (l.pricing?.monthlyRent ?? 0), 0);
  const average = listings.length > 0 ? Math.round(total / listings.length) : 0;

  return (
    <>
      <div className="header">
        <div className="header-title">Saved</div>
        {listings.length > 0 && (
          <div className="tiny">
            {listings.length} saved · ${average}/mo avg
          </div>
        )}
      </div>

      {loading && (
        <div className="center-state">
          <div className="spinner" />
        </div>
      )}

      {!loading && error && (
        <div className="center-state">
          <h3>Couldn't load your list</h3>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && listings.length === 0 && (
        <div className="center-state">
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: 62,
              height: 62,
              borderRadius: "50%",
              background: "var(--blush)",
              color: "var(--terracotta)",
            }}
          >
            <IconHeart size={28} />
          </div>
          <h3>Nothing saved yet</h3>
          <p>
            Swipe right on a listing — or tap the heart — and it lands here so you can compare
            places side by side.
          </p>
          <button type="button" className="btn btn-primary" onClick={onBrowse}>
            Start browsing
          </button>
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div className="section">
          {listings.map((listing) => (
            <ListingRow
              key={listing.id}
              listing={listing}
              onOpen={onOpenListing}
              onUnsave={(l) => void unsave(l)}
              showUnsave
            />
          ))}
        </div>
      )}
    </>
  );
}
