import { useState } from "react";
import { api } from "../api/client.ts";
import type { Listing, Reference } from "../api/types.ts";
import { IconX } from "./Icons.tsx";

type Props = {
  listing: Listing;
  reference: Reference | null;
  onClose: () => void;
};

const FALLBACK_REASONS = [
  "Suspected scam",
  "Inaccurate listing",
  "Inappropriate content",
  "Already rented",
  "Discriminatory language",
  "Other",
];

export function ReportSheet({ listing, reference, onClose }: Props) {
  const reasons = reference?.reportReasons ?? FALLBACK_REASONS;
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const { message } = await api.report({ listingId: listing.id, reason, details });
      setDone(message);
      setTimeout(onClose, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Report listing">
        <div className="grip" />
        <div className="sheet-head">
          <h2>Report listing</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
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
                  placeholder="Tell us what you noticed."
                  maxLength={1500}
                />
              </label>
            </>
          )}
        </div>

        {!done && (
          <div className="sheet-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
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
