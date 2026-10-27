import { useRef, useState } from "react";
import { api } from "../api/client.ts";
import type { Listing, Reference } from "../api/types.ts";
import { IconX } from "./Icons.tsx";

type Props = {
  listing: Listing;
  reference: Reference | null;
  onClose: () => void;
  /**
   * Called once, as the sheet closes, if the report went through. The deck
   * uses it to swipe the reported card away.
   */
  onReported?: () => void;
};

const FALLBACK_REASONS = [
  "Suspected scam",
  "Inaccurate listing",
  "Inappropriate content",
  "Already rented",
  "Discriminatory language",
  "Other",
];

export function ReportSheet({ listing, reference, onClose, onReported }: Props) {
  const reasons = reference?.reportReasons ?? FALLBACK_REASONS;
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs, not state: close() also runs from the confirmation timer, which
  // would otherwise see the values from the render that started it.
  const reported = useRef(false);
  const closed = useRef(false);

  // Every way out of the sheet comes through here, so the card swipes away
  // whether the person waits for the timer or taps the backdrop first.
  function close() {
    if (closed.current) return;
    closed.current = true;
    if (reported.current) onReported?.();
    onClose();
  }

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const { message } = await api.report({ listingId: listing.id, reason, details });
      reported.current = true;
      setDone(message);
      setTimeout(close, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet" role="dialog" aria-label="Report listing">
        <div className="grip" />
        <div className="sheet-head">
          <h2>Report listing</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <IconX size={18} />
          </button>
        </div>

        <div className="sheet-scroll">
          {done ? (
            <div className="banner success">{done}</div>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                Reporting <strong>{listing.address}</strong>. Our team reviews every report — the
                host isn't told who filed it.
              </p>

              {error && (
                <div className="banner error" style={{ marginBottom: 14 }}>
                  {error}
                </div>
              )}

              <div className="field">
                <span className="field-label">What's wrong?</span>
                <div className="chip-grid">
                  {reasons.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`chip${reason === r ? " on" : " outline"}`}
                      onClick={() => setReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <label className="field">
                <span className="field-label">Anything else? (optional)</span>
                <textarea
                  className="input"
                  rows={4}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="What made you report it? For example: they asked for money before a tour, the photos don't match the address, or the price or dates are wrong."
                  maxLength={1500}
                />
              </label>
            </>
          )}
        </div>

        {!done && (
          <div className="sheet-foot">
            <button type="button" className="btn btn-secondary" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!reason || busy}
              onClick={() => void submit()}
            >
              {busy ? "Sending…" : "Submit report"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
