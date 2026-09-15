import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.ts";
import type { Listing } from "../api/types.ts";
import { LazyMapCanvas } from "../components/LazyMapCanvas.tsx";
import {
  IconArrowLeft,
  IconCheck,
  IconFlag,
  IconHeart,
  IconHeartFilled,
  IconPin,
  IconStar,
} from "../components/Icons.tsx";
import {
  bedLabel,
  dateRange,
  distanceLabel,
  fallbackGradient,
  money,
  monthsBetween,
  walkLabel,
} from "../lib/format.ts";

type Props = {
  listing: Listing;
  onBack: () => void;
  onReport: (listing: Listing) => void;
  onSavedChange: () => void;
  onMessageSent: (conversationId: string) => void;
  isOwnListing: boolean;
};

export function ListingDetail({
  listing: initial,
  onBack,
  onReport,
  onSavedChange,
  onMessageSent,
  isOwnListing,
}: Props) {
  const [listing, setListing] = useState(initial);
  const [saved, setSaved] = useState(Boolean(initial.saved));
  const [photoIndex, setPhotoIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [composing, setComposing] = useState(false);
  const composeRef = useRef<HTMLTextAreaElement>(null);

  // Re-fetch so we always show fresh photos/pricing and the true saved state.
  useEffect(() => {
    api
      .listing(initial.id)
      .then(({ listing: fresh }) => {
        setListing(fresh);
        setSaved(Boolean(fresh.saved));
      })
      .catch(() => undefined);
  }, [initial.id]);

  // Opening the composer hides the sticky action bar and renders the textarea
  // at the foot of a long page — well below the fold. Without this the button
  // just vanishes and the screen looks stuck, so bring the box into view and
  // put the cursor in it.
  useEffect(() => {
    if (!composing) return;
    const box = composeRef.current;
    if (!box) return;
    box.scrollIntoView({ block: "center", behavior: "smooth" });
    box.focus({ preventScroll: true });
  }, [composing]);

  const pricing = listing.pricing;
  const rooms = listing.roomDetails;
  const photos = listing.photos;
  const photo = photos[photoIndex]?.fileUrl ?? null;
  const months = pricing ? monthsBetween(pricing.availableFrom, pricing.availableTo) : 0;
  const walk = walkLabel(listing.distanceMiles);

  async function toggleSave() {
    try {
      if (saved) {
        await api.unsave(listing.id);
        setSaved(false);
      } else {
        await api.save(listing.id);
        setSaved(true);
      }
      onSavedChange();
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not update saved listings",
      });
    }
  }

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    setNotice(null);
    try {
      const { conversationId } = await api.startConversation(listing.id, message.trim());
      setMessage("");
      setComposing(false);
      setNotice({ kind: "success", text: "Message sent — check the Messages tab." });
      onMessageSent(conversationId);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not send" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ paddingBottom: 8 }}>
      <div
        className="detail-hero"
        style={
          photo ? { backgroundImage: `url(${photo})` } : { background: fallbackGradient(listing.id) }
        }
      >
        <button type="button" className="detail-back" onClick={onBack} aria-label="Back">
          <IconArrowLeft size={19} />
        </button>

        <div className="detail-actions">
          <button
            type="button"
            className="detail-back"
            style={{ position: "static", color: saved ? "var(--terracotta)" : "var(--ink)" }}
            onClick={() => void toggleSave()}
            aria-label={saved ? "Remove from saved" : "Save listing"}
          >
            {saved ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
          </button>
          <button
            type="button"
            className="detail-back"
            style={{ position: "static" }}
            onClick={() => onReport(listing)}
            aria-label="Report listing"
          >
            <IconFlag size={17} />
          </button>
        </div>

        {photos.length > 1 && (
          <>
            <div className="photo-dots" style={{ top: "auto", bottom: 12 }}>
              {photos.map((p, i) => (
                <i key={p.photoId} className={i === photoIndex ? "on" : ""} />
              ))}
            </div>
            <button
              type="button"
              className="photo-tap left"
              aria-label="Previous photo"
              onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
            />
            <button
              type="button"
              className="photo-tap right"
              aria-label="Next photo"
              onClick={() => setPhotoIndex((i) => Math.min(photos.length - 1, i + 1))}
            />
          </>
        )}
      </div>

      <div className="section">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700 }}>
              {money(pricing?.monthlyRent)}
              <span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--slate)" }}>
                {" "}
                /month
              </span>
            </div>
            {pricing && pricing.deposit > 0 && (
              <div className="tiny">{money(pricing.deposit)} security deposit</div>
            )}
          </div>
          {pricing?.utilitiesIncluded && <span className="chip good">Utilities included</span>}
        </div>

        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "14px 0 6px" }}>
          {listing.title}
        </h1>

        <div className="muted" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
          <IconPin size={14} />
          {listing.address}, {listing.city}, {listing.state}
        </div>
        <div className="tiny" style={{ marginTop: 3 }}>
          {distanceLabel(listing.distanceMiles)}
          {walk && ` · ${walk}`}
        </div>
      </div>

      {rooms && (
        <div className="section" style={{ paddingTop: 0 }}>
          <div className="fact-grid">
            <div className="fact">
              <b>{rooms.bedrooms === 0 ? "Studio" : rooms.bedrooms}</b>
              <span>{rooms.bedrooms === 0 ? "layout" : bedLabel(rooms.bedrooms).replace(/^\d+ /, "")}</span>
            </div>
            <div className="fact">
              <b>{rooms.bathrooms}</b>
              <span>bath{rooms.bathrooms === 1 ? "" : "s"}</span>
            </div>
            <div className="fact">
              <b>{rooms.maxRoommates}</b>
              <span>roommate{rooms.maxRoommates === 1 ? "" : "s"}</span>
            </div>
            <div className="fact">
              <b>{months}</b>
              <span>month{months === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
      )}

      {pricing && (
        <div className="section" style={{ paddingTop: 0 }}>
          <div className="card">
            <div className="field-label" style={{ marginBottom: 4 }}>
              Available
            </div>
            <div style={{ fontWeight: 600 }}>
              {dateRange(pricing.availableFrom, pricing.availableTo)}
            </div>
            <div className="tiny" style={{ marginTop: 4 }}>
              Roughly {money(pricing.monthlyRent * months)} for the full term
              {pricing.deposit > 0 && `, plus a ${money(pricing.deposit)} deposit`}.
            </div>
          </div>
        </div>
      )}

      <div className="section" style={{ paddingTop: 0 }}>
        <h2 className="section-title">About this place</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--slate)" }}>
          {listing.description}
        </p>
      </div>

      {listing.amenities.length > 0 && (
        <div className="section" style={{ paddingTop: 0 }}>
          <h2 className="section-title">Amenities</h2>
          <div className="chip-grid">
            {listing.amenities.map((a) => (
              <span key={a} className="chip">
                <IconCheck size={12} strokeWidth={3} />
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {listing.lat !== null && listing.lng !== null && (
        <div className="section" style={{ paddingTop: 0 }}>
          <h2 className="section-title">Location</h2>
          <div className="detail-map">
            <LazyMapCanvas
              listings={[listing]}
              center={{ lat: listing.lat, lng: listing.lng }}
              campus={null}
              activeId={listing.id}
              onSelect={() => undefined}
              fitOnChange={false}
              interactive={false}
              zoom={15.5}
            />
          </div>
          <div className="tiny" style={{ marginTop: 6 }}>
            Pin placed from the street address via OpenStreetMap.
          </div>
        </div>
      )}

      {listing.owner && (
        <div className="section" style={{ paddingTop: 0 }}>
          <h2 className="section-title">Hosted by</h2>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="avatar lg">{listing.owner.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}
                >
                  {listing.owner.name}
                  {listing.owner.verified && (
                    <span className="chip good" style={{ padding: "2px 7px", fontSize: 10.5 }}>
                      <IconCheck size={10} strokeWidth={3} />
                      Verified
                    </span>
                  )}
                </div>
                <div className="tiny">{listing.owner.university}</div>
              </div>
              {listing.owner.reviewCount > 0 && (
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontWeight: 700,
                      color: "var(--gold)",
                    }}
                  >
                    <IconStar size={13} />
                    {listing.owner.rating.toFixed(1)}
                  </div>
                  <div className="tiny">{listing.owner.reviewCount} reviews</div>
                </div>
              )}
            </div>
            {listing.owner.bio && (
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--slate)", lineHeight: 1.55 }}>
                {listing.owner.bio}
              </p>
            )}
          </div>
        </div>
      )}

      {notice && (
        <div className="section" style={{ paddingTop: 0 }}>
          <div className={`banner ${notice.kind}`}>{notice.text}</div>
        </div>
      )}

      {composing && !isOwnListing && (
        <div className="section" style={{ paddingTop: 0 }}>
          <label className="field">
            <span className="field-label">Message {listing.owner?.name.split(" ")[0]}</span>
            <textarea
              ref={composeRef}
              className="input"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Hi! Is ${listing.address} still available for the summer? I'd be moving in around ${
                pricing?.availableFrom ?? "May"
              }.`}
            />
          </label>
          <div className="row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setComposing(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={sending || !message.trim()}
              onClick={() => void send()}
            >
              {sending ? "Sending…" : "Send message"}
            </button>
          </div>
        </div>
      )}

      {!composing && (
        <div className="sticky-cta">
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: "0 0 auto", paddingInline: 18 }}
            onClick={() => void toggleSave()}
          >
            {saved ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
            {saved ? "Saved" : "Save"}
          </button>
          {isOwnListing ? (
            <button type="button" className="btn btn-ghost btn-block" disabled>
              This is your listing
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => setComposing(true)}
            >
              Message host
            </button>
          )}
        </div>
      )}
    </div>
  );
}
