import { useEffect, useRef, useState } from "react";
import type { Listing } from "../api/types.ts";
import { IconCheck, IconPin, IconStar } from "./Icons.tsx";
import {
  bedLabel,
  dateRange,
  distanceLabel,
  fallbackGradient,
  money,
  walkLabel,
} from "../lib/format.ts";

export type SwipeDirection = "left" | "right";

type Props = {
  listing: Listing;
  /** Only the top card is interactive. */
  interactive: boolean;
  /** Set to trigger a programmatic fly-out (from the pass/like buttons). */
  flyOut: SwipeDirection | null;
  onSwiped: (direction: SwipeDirection) => void;
  onOpen: (listing: Listing) => void;
  depth: number;
};

const SWIPE_THRESHOLD = 96;
const FLICK_VELOCITY = 0.55;

export function SwipeCard({ listing, interactive, flyOut, onSwiped, onOpen, depth }: Props) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exiting, setExiting] = useState<SwipeDirection | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  const pointerId = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0, t: 0 });
  const moved = useRef(false);

  const photos = listing.photos;
  const photo = photos[photoIndex]?.fileUrl ?? null;

  // Fly the card out when a control button asks for it.
  useEffect(() => {
    if (flyOut && !exiting) setExiting(flyOut);
  }, [flyOut, exiting]);

  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => onSwiped(exiting), 260);
    return () => clearTimeout(timer);
  }, [exiting, onSwiped]);

  function onPointerDown(event: React.PointerEvent) {
    if (!interactive || exiting) return;
    // Controls marked [data-no-drag] own the gesture outright. The photo-tap
    // zones deliberately are not marked: they cover most of the photo, and
    // blocking drags there left the card swipeable only from a narrow strip
    // down the middle. They tell a tap from a drag in `step()` instead.
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    pointerId.current = event.pointerId;
    start.current = { x: event.clientX, y: event.clientY, t: Date.now() };
    moved.current = false;
    setDrag({ x: 0, y: 0, active: true });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (pointerId.current !== event.pointerId) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved.current = true;
    setDrag({ x: dx, y: dy, active: true });
  }

  function onPointerUp(event: React.PointerEvent) {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;

    const dx = event.clientX - start.current.x;
    const elapsed = Math.max(1, Date.now() - start.current.t);
    const velocity = Math.abs(dx) / elapsed;

    // Commit on either a long enough drag or a fast flick.
    if (Math.abs(dx) > SWIPE_THRESHOLD || velocity > FLICK_VELOCITY) {
      setExiting(dx > 0 ? "right" : "left");
      return;
    }

    setDrag({ x: 0, y: 0, active: false });
  }

  function activate(event: React.MouseEvent) {
    // Opening lives on click, not pointerup, so keyboard and assistive-tech
    // activation work as well as a tap. A drag also fires click, hence the guard.
    if (!interactive || exiting || moved.current) return;
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    onOpen(listing);
  }

  function step(delta: number, event: React.MouseEvent) {
    event.stopPropagation();
    // A drag that happens to finish over a photo-tap zone still fires a click.
    // Only advance the photo when the pointer actually stayed put.
    if (moved.current) return;
    setPhotoIndex((i) => Math.min(photos.length - 1, Math.max(0, i + delta)));
  }

  const rotation = drag.x / 22;
  const likeOpacity = Math.min(1, Math.max(0, drag.x / SWIPE_THRESHOLD));
  const nopeOpacity = Math.min(1, Math.max(0, -drag.x / SWIPE_THRESHOLD));

  const transform = exiting
    ? `translate(${exiting === "right" ? 640 : -640}px, ${drag.y - 40}px) rotate(${
        exiting === "right" ? 26 : -26
      }deg)`
    : `translate(${drag.x}px, ${drag.y * 0.32}px) rotate(${rotation}deg) scale(${
        depth === 0 ? 1 : 1 - depth * 0.03
      })`;

  const pricing = listing.pricing;
  const rooms = listing.roomDetails;
  const walk = walkLabel(listing.distanceMiles);

  return (
    <div
      className={`swipe-card${interactive ? "" : " behind"}`}
      style={{
        transform,
        transition: drag.active ? "none" : "transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)",
        opacity: exiting ? 0 : 1,
        zIndex: 10 - depth,
        top: depth * 8,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={activate}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-label={`${listing.title} — open details`}
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(listing);
        }
      }}
    >
      <div
        className="swipe-photo"
        style={
          photo
            ? { backgroundImage: `url(${photo})` }
            : { background: fallbackGradient(listing.id) }
        }
      >
        {photos.length > 1 && (
          <div className="photo-dots">
            {photos.map((p, i) => (
              <i key={p.photoId} className={i === photoIndex ? "on" : ""} />
            ))}
          </div>
        )}

        {photos.length > 1 && (
          <>
            <button
              type="button"
              className="photo-tap left"
              aria-label="Previous photo"
              onClick={(e) => step(-1, e)}
            />
            <button
              type="button"
              className="photo-tap right"
              aria-label="Next photo"
              onClick={(e) => step(1, e)}
            />
          </>
        )}

        <div className="photo-badges">
          {pricing?.utilitiesIncluded && <span className="photo-badge green">Utilities incl.</span>}
          {rooms?.furnished && <span className="photo-badge">Furnished</span>}
          {rooms?.petsAllowed && <span className="photo-badge">Pets OK</span>}
        </div>

        <div className="photo-overlay">
          <div className="photo-price">
            {money(pricing?.monthlyRent)}
            <small> /mo</small>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}>
            <IconPin size={13} strokeWidth={2.2} />
            {listing.address}
            {walk && <span style={{ opacity: 0.85 }}>· {walk}</span>}
          </div>
        </div>

        {likeOpacity > 0.08 && (
          <div className="stamp like" style={{ opacity: likeOpacity }}>
            SAVE
          </div>
        )}
        {nopeOpacity > 0.08 && (
          <div className="stamp nope" style={{ opacity: nopeOpacity }}>
            PASS
          </div>
        )}
      </div>

      <div className="swipe-body">
        <h3 className="swipe-title">{listing.title}</h3>

        <div className="swipe-meta">
          <span>{distanceLabel(listing.distanceMiles)}</span>
          {pricing && <span>· {dateRange(pricing.availableFrom, pricing.availableTo)}</span>}
        </div>

        <div className="swipe-facts">
          {rooms && <span className="chip tint">{bedLabel(rooms.bedrooms)}</span>}
          {rooms && <span className="chip tint">{rooms.bathrooms} bath</span>}
          {rooms && rooms.maxRoommates > 0 && (
            <span className="chip">{rooms.maxRoommates} roommate{rooms.maxRoommates > 1 ? "s" : ""}</span>
          )}
          {listing.amenities.slice(0, 2).map((a) => (
            <span key={a} className="chip">
              {a}
            </span>
          ))}
        </div>

        <p className="swipe-desc">{listing.description}</p>

        {listing.owner && (
          <div className="swipe-host">
            <div className="avatar">{listing.owner.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {listing.owner.name}
                {listing.owner.verified && (
                  <IconCheck size={13} strokeWidth={3} className="verified" />
                )}
              </div>
              <div className="tiny">{listing.owner.university}</div>
            </div>
            {listing.owner.reviewCount > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--gold)",
                }}
              >
                <IconStar size={12} />
                {listing.owner.rating.toFixed(1)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
