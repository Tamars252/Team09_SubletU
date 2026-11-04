import { Link } from "react-router-dom";
import type { Listing } from "../api/types.ts";
import { dateRange, listingPath, money, sortedPhotos } from "../lib/listing.ts";

/**
 * A compact listing summary that opens the full detail view.
 *
 * It is a real link rather than a div with a click handler, so a tap, a click
 * and Enter on the keyboard all open it, and it is announced as a link
 * (NFR-5.1). The swipe deck's card can open the same route with
 * `navigate(listingPath(id))`.
 */
export function ListingCard({ listing }: { listing: Listing }) {
  const photo = sortedPhotos(listing.photos)[0]?.fileUrl ?? null;
  const pricing = listing.pricing;

  return (
    <Link to={listingPath(listing.id)} className="listing-card">
      <span
        className="listing-card-photo"
        style={photo ? { backgroundImage: `url(${photo})` } : undefined}
        aria-hidden="true"
      />
      <span className="listing-card-text">
        <span className="listing-card-title">{listing.title}</span>
        <span className="listing-card-meta">
          {pricing ? `${money(pricing.monthlyRent)}/mo` : "Price not listed"}
        </span>
        {pricing && (
          <span className="listing-card-meta">
            {dateRange(pricing.availableFrom, pricing.availableTo)}
          </span>
        )}
      </span>
    </Link>
  );
}
