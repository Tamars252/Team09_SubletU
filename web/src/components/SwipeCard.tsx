import { useRef, useState } from "react";
import type { Listing } from "../api/types.ts";
import {
  availabilityLabel,
  coverPhoto,
  distanceLabel,
  dragRotation,
  releaseDecision,
  rentLabel,
  roomLabel,
  stampOpacity,
} from "../lib/deck.ts";
import type { Direction } from "../lib/deck.ts";
import { IconPin } from "./Icons.tsx";

type Props = {
  listing: Listing;
  /** The card under the top one: drawn, but not interactive. */
  behind?: boolean;
  /** Set by the deck buttons so a tap animates the same way a drag does. */
  flyOut?: Direction | null;
  onDecide?: (direction: Direction) => void;
};

/** How long the fly-out animation runs before the deck drops the card. */
export const FLY_OUT_MS = 220;

/**
 * One listing in the deck. Drag it with a mouse, pen or finger; past the
 * threshold it flies off and reports a decision, otherwise it snaps back.
 * Sized entirely by CSS (.swipe-card fills .deck-stage), so it never needs
 * the page to scroll, whatever the screen size.
 */
export function SwipeCard({ listing, behind = false, flyOut = null, onDecide }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<Direction | null>(null);

  const width = ref.current?.offsetWidth ?? 0;
  const out = leaving ?? flyOut;
  const x = out ? (out === "right" ? 1 : -1) * Math.max(width, 320) * 1.4 : dx;

  function finish(direction: Direction) {
    setLeaving(direction);
    window.setTimeout(() => onDecide?.(direction), FLY_OUT_MS);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (behind || out) return;
    start.current = { x: e.clientX, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDx(e.clientX - start.current.x);
  }

  function end(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== e.pointerId) return;
    const moved = e.type === "pointercancel" ? 0 : e.clientX - start.current.x;
    start.current = null;
    setDragging(false);
    const decision = releaseDecision(
      e.type === "pointercancel" ? "pointercancel" : "pointerup",
      moved,
      e.currentTarget.offsetWidth,
    );
    if (decision) finish(decision);
    else setDx(0); // snap back
  }

  const photo = coverPhoto(listing);
  const room = roomLabel(listing);
  const window_ = availabilityLabel(listing);
  const distance = distanceLabel(listing);
  const opacity = stampOpacity(x, width || 320);

  return (
    <div
      ref={ref}
      className={`swipe-card${behind ? " behind" : ""}`}
      data-testid={behind ? "card-behind" : "card-top"}
      style={{
        transform: behind
          ? "scale(0.96) translateY(10px)"
          : `translateX(${x}px) rotate(${dragRotation(x, width || 320)}deg)`,
        transition: dragging ? "none" : `transform ${FLY_OUT_MS}ms ease-out`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      aria-hidden={behind || undefined}
    >
      <div
        className="swipe-photo"
        style={photo ? { backgroundImage: `url(${JSON.stringify(photo)})` } : undefined}
      >
        {!behind && x > 0 && (
          <span className="stamp like" style={{ opacity }}>
            SAVE
          </span>
        )}
        {!behind && x < 0 && (
          <span className="stamp nope" style={{ opacity }}>
            PASS
          </span>
        )}
        <div className="photo-badges">
          {listing.pricing?.utilitiesIncluded && <span className="photo-badge green">Utilities incl.</span>}
          {listing.roomDetails?.furnished && <span className="photo-badge">Furnished</span>}
        </div>
        <div className="photo-overlay">
          <div className="photo-price">
            {rentLabel(listing)} {listing.pricing && <small>/ month</small>}
          </div>
        </div>
      </div>

      <div className="swipe-body">
        <h2 className="swipe-title">{listing.title}</h2>
        <div className="swipe-meta">
          <IconPin size={14} />
          <span>{distance || `${listing.address}, ${listing.city}`}</span>
        </div>
        <div className="swipe-facts">
          {room && <span className="chip">{room}</span>}
          {window_ && <span className="chip">{window_}</span>}
          {listing.roomDetails?.petsAllowed && <span className="chip">Pets OK</span>}
        </div>
        <p className="swipe-desc">{listing.description}</p>
        {listing.owner && (
          <div className="swipe-host">
            <span className="avatar">{listing.owner.initials}</span>
            <span className="tiny">
              Hosted by <b>{listing.owner.name}</b>
              {listing.owner.verified ? " · Verified" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
