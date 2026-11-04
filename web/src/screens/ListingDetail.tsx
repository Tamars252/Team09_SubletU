import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client.ts";
import type { Listing, Photo } from "../api/types.ts";
import { HOME_PATH } from "../auth/guard.ts";
import {
  IconArrowLeft,
  IconBath,
  IconBed,
  IconCheck,
  IconPin,
  IconShield,
  IconStar,
  IconUser,
  IconX,
} from "../components/Icons.tsx";
import {
  bathroomsLabel,
  bedroomsLabel,
  distanceLabel,
  formatDay,
  hostRatingLabel,
  money,
  sortedPhotos,
  stepPhoto,
} from "../lib/listing.ts";
import { useAuth } from "../state/AuthContext.tsx";

type State =
  | { kind: "loading" }
  | { kind: "ok"; listing: Listing }
  | { kind: "missing" }
  | { kind: "error"; message: string };

/**
 * Listing detail view (FR-2.4): photos, price, dates, room details and host.
 *
 * Keyboard access (NFR-5.1, NFR-5.2): the card that opens this screen is a
 * link, so Enter works; focus moves to the title when the listing loads;
 * every control is a real button with a name; and the arrow keys step
 * through the photos while focus is anywhere in the gallery.
 */
export function ListingDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let stale = false;
    setState({ kind: "loading" });
    api
      .listing(id)
      .then(({ listing }) => {
        if (!stale) setState({ kind: "ok", listing });
      })
      .catch((err: unknown) => {
        if (stale) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ kind: "missing" });
        } else {
          setState({
            kind: "error",
            message: err instanceof ApiError ? err.message : "Something went wrong.",
          });
        }
      });
    return () => {
      stale = true;
    };
  }, [id, attempt]);

  const loaded = state.kind === "ok" ? state.listing : null;

  // Start keyboard and screen-reader users at the top of the new screen,
  // rather than leaving focus on a card that is no longer on the page.
  useEffect(() => {
    if (loaded) heading.current?.focus();
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    const previous = document.title;
    document.title = `${loaded.title} – SubletU`;
    return () => {
      document.title = previous;
    };
  }, [loaded]);

  function goBack() {
    // "default" is the first entry in this tab, e.g. a shared link opened
    // directly: going back would leave the app, so go to the home screen.
    if (location.key === "default") navigate(HOME_PATH, { replace: true });
    else navigate(-1);
  }

  if (!loaded) {
    return (
      <div className="app">
        <header className="header">
          <button type="button" className="icon-btn" onClick={goBack} aria-label="Back">
            <IconArrowLeft size={19} />
          </button>
          <span className="header-title">Listing</span>
          <span className="header-spacer" />
        </header>
        <main className="app-main">
          {state.kind === "loading" && (
            <div className="center-state" role="status">
              <div className="spinner" />
              <span className="sr-only">Loading listing…</span>
            </div>
          )}
          {state.kind === "missing" && (
            <div className="center-state">
              <h3>This listing isn't available</h3>
              <p>The host may have removed it.</p>
              <button type="button" className="btn btn-primary" onClick={goBack}>
                Back to listings
              </button>
            </div>
          )}
          {state.kind === "error" && (
            <div className="center-state" role="alert">
              <h3>Couldn't load this listing</h3>
              <p>{state.message}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  const { pricing, roomDetails: rooms, owner } = loaded;
  const distance = distanceLabel(loaded.distanceMiles, user?.university ?? "campus");

  return (
    <div className="app">
      <main className="app-main">
        <div className="detail-top">
          <button type="button" className="detail-back" onClick={goBack} aria-label="Back">
            <IconArrowLeft size={19} />
          </button>
          <PhotoGallery photos={loaded.photos} title={loaded.title} />
        </div>

        <div className="section">
          <h1 ref={heading} tabIndex={-1} className="detail-title">
            {loaded.title}
          </h1>
          <p className="detail-address">
            <IconPin size={15} />
            {loaded.address}, {loaded.city}, {loaded.state} {loaded.zip}
          </p>
          {distance && <p className="detail-distance">{distance}</p>}
        </div>

        <section className="section detail-section" aria-labelledby="detail-price">
          <h2 id="detail-price" className="section-title">
            Price and dates
          </h2>
          {pricing ? (
            <>
              <div className="fact-grid">
                <div className="fact">
                  <b>{money(pricing.monthlyRent)}</b>
                  <span>per month</span>
                </div>
                <div className="fact">
                  <b>{pricing.deposit > 0 ? money(pricing.deposit) : "None"}</b>
                  <span>deposit</span>
                </div>
                <div className="fact">
                  <b>{pricing.utilitiesIncluded ? "Included" : "Extra"}</b>
                  <span>utilities</span>
                </div>
              </div>
              <p className="detail-dates">
                Available <time dateTime={pricing.availableFrom}>{formatDay(pricing.availableFrom)}</time>{" "}
                to <time dateTime={pricing.availableTo}>{formatDay(pricing.availableTo)}</time>
              </p>
            </>
          ) : (
            <p className="muted">The host hasn't added a price or dates yet.</p>
          )}
        </section>

        <section className="section detail-section" aria-labelledby="detail-rooms">
          <h2 id="detail-rooms" className="section-title">
            Room details
          </h2>
          {rooms ? (
            <ul className="detail-features">
              <li>
                <IconBed size={17} />
                {bedroomsLabel(rooms.bedrooms)}
              </li>
              <li>
                <IconBath size={17} />
                {bathroomsLabel(rooms.bathrooms)}
              </li>
              <li>
                <IconUser size={17} />
                {rooms.maxRoommates === 0
                  ? "No roommates"
                  : `Up to ${rooms.maxRoommates} ${rooms.maxRoommates === 1 ? "roommate" : "roommates"}`}
              </li>
              <Feature on={rooms.furnished} yes="Furnished" no="Unfurnished" />
              <Feature on={rooms.petsAllowed} yes="Pets allowed" no="No pets" />
              <Feature on={rooms.privateBath} yes="Private bathroom" no="Shared bathroom" />
            </ul>
          ) : (
            <p className="muted">The host hasn't added room details yet.</p>
          )}
          {loaded.amenities.length > 0 && (
            <ul className="chip-grid detail-amenities" aria-label="Amenities">
              {loaded.amenities.map((amenity) => (
                <li key={amenity} className="chip">
                  {amenity}
                </li>
              ))}
            </ul>
          )}
        </section>

        {loaded.description && (
          <section className="section detail-section" aria-labelledby="detail-about">
            <h2 id="detail-about" className="section-title">
              About this place
            </h2>
            <p className="detail-description">{loaded.description}</p>
          </section>
        )}

        <section className="section detail-section" aria-labelledby="detail-host">
          <h2 id="detail-host" className="section-title">
            Host
          </h2>
          {owner ? (
            <div className="detail-host">
              <span className="avatar lg" aria-hidden="true">
                {owner.initials}
              </span>
              <div>
                <p className="detail-host-name">
                  {owner.name}
                  {owner.verified && (
                    <span className="chip good">
                      <IconShield size={13} />
                      Verified student
                    </span>
                  )}
                </p>
                <p className="detail-host-line">
                  <IconStar size={13} />
                  {hostRatingLabel(owner.rating, owner.reviewCount)}
                </p>
                {owner.university && <p className="detail-host-line">{owner.university}</p>}
                {owner.bio && <p className="detail-host-bio">{owner.bio}</p>}
              </div>
            </div>
          ) : (
            <p className="muted">Host details aren't available.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function Feature({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return (
    <li className={on ? undefined : "off"}>
      {on ? <IconCheck size={17} /> : <IconX size={17} />}
      {on ? yes : no}
    </li>
  );
}

/**
 * The photos, one at a time. Previous and Next wrap around, the thumbnails
 * jump straight to a photo, and Left/Right arrows work while focus is on any
 * of these controls. The position is announced politely as it changes.
 */
function PhotoGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [index, setIndex] = useState(0);
  const ordered = sortedPhotos(photos);
  const count = ordered.length;

  if (count === 0) {
    return (
      <div className="detail-hero detail-hero-empty">
        <span>No photos yet</span>
      </div>
    );
  }

  const current = ordered[Math.min(index, count - 1)];
  const go = (delta: number) => setIndex((i) => stepPhoto(i, delta, count));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count < 2) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
  }

  return (
    <div
      className="detail-gallery"
      role="group"
      aria-roledescription="carousel"
      aria-label={`Photos of ${title}`}
      onKeyDown={onKeyDown}
    >
      <div className="detail-hero">
        <img src={current.fileUrl} alt={`Photo ${index + 1} of ${count}, ${title}`} />
        {count > 1 && (
          <>
            <button
              type="button"
              className="gallery-btn prev"
              onClick={() => go(-1)}
              aria-label="Previous photo"
            >
              <IconArrowLeft size={18} />
            </button>
            <button
              type="button"
              className="gallery-btn next"
              onClick={() => go(1)}
              aria-label="Next photo"
            >
              <IconArrowLeft size={18} className="flip" />
            </button>
            <span className="gallery-count" aria-live="polite">
              <span aria-hidden="true">
                {index + 1} / {count}
              </span>
              <span className="sr-only">
                Photo {index + 1} of {count}
              </span>
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="gallery-thumbs">
          {ordered.map((photo, i) => (
            <button
              key={photo.photoId}
              type="button"
              className={`gallery-thumb${i === index ? " on" : ""}`}
              style={{ backgroundImage: `url(${photo.fileUrl})` }}
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1} of ${count}`}
              aria-current={i === index ? "true" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
