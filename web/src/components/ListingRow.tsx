import type { Listing } from "../api/types.ts";
import { IconCheck, IconHeartFilled } from "./Icons.tsx";
import { bedLabel, dateRange, distanceLabel, money, photoStyle } from "../lib/format.ts";

type Props = {
  listing: Listing;
  onOpen: (listing: Listing) => void;
  onUnsave?: (listing: Listing) => void;
  showUnsave?: boolean;
};

export function ListingRow({ listing, onOpen, onUnsave, showUnsave }: Props) {
  const rooms = listing.roomDetails;
  const pricing = listing.pricing;

  return (
    <div className="list-card" style={{ cursor: "pointer" }}>
      <div
        className="list-thumb"
        style={photoStyle(listing)}
        onClick={() => onOpen(listing)}
        role="button"
        tabIndex={-1}
        aria-label={`Photo of ${listing.title}`}
      />
      <div className="list-body" onClick={() => onOpen(listing)}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div className="list-price">
            {money(pricing?.monthlyRent)}
            <small> /mo</small>
          </div>
          {showUnsave && onUnsave && (
            <button
              type="button"
              className="icon-btn"
              style={{ width: 30, height: 30, background: "var(--blush)", color: "var(--terracotta)" }}
              aria-label="Remove from saved"
              onClick={(e) => {
                e.stopPropagation();
                onUnsave(listing);
              }}
            >
              <IconHeartFilled size={15} />
            </button>
          )}
        </div>

        <div className="list-title">{listing.title}</div>

        <div className="tiny">
          {listing.address} · {distanceLabel(listing.distanceMiles)}
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 2 }}>
          {rooms && <span className="chip" style={{ padding: "4px 9px", fontSize: 11 }}>{bedLabel(rooms.bedrooms)}</span>}
          {rooms && (
            <span className="chip" style={{ padding: "4px 9px", fontSize: 11 }}>
              {rooms.bathrooms} bath
            </span>
          )}
          {pricing?.utilitiesIncluded && (
            <span className="chip good" style={{ padding: "4px 9px", fontSize: 11 }}>
              Utilities
            </span>
          )}
        </div>

        {pricing && (
          <div className="tiny" style={{ marginTop: 1 }}>
            {dateRange(pricing.availableFrom, pricing.availableTo)}
          </div>
        )}

        {listing.owner && (
          <div className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {listing.owner.name}
            {listing.owner.verified && <IconCheck size={11} strokeWidth={3} />}
          </div>
        )}
      </div>
    </div>
  );
}
