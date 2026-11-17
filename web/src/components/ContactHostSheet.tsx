import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client.ts";
import type { Listing } from "../api/types.ts";
import { MAX_MESSAGE_LENGTH, canSend, suggestedFirstMessage, threadPath } from "../lib/messages.ts";
import { IconX } from "./Icons.tsx";

/**
 * TM09-104 AC1: start a conversation from a listing.
 *
 * The first message goes out with the request that opens the thread, so the
 * host never sees an empty thread from a renter who changed their mind. The
 * same listing always reuses its thread, so writing twice lands in one place.
 *
 * Used from the Saved screen today. The listing detail screen can drop it in
 * the same way when that story lands.
 */
export function ContactHostSheet({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState(() => suggestedFirstMessage(listing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const host = listing.owner?.name ?? "the host";

  // Focus the message with the cursor at the end, ready to edit or send.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !canSend(text)) return;
    setBusy(true);
    setError(null);
    try {
      const { conversationId } = await api.startConversation(listing.id, text.trim());
      navigate(threadPath(conversationId));
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your message. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-host-title"
        onSubmit={submit}
      >
        <div className="grip" />
        <div className="sheet-head">
          <h2 id="contact-host-title">Message {host}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX size={18} />
          </button>
        </div>

        <div className="sheet-scroll">
          <p className="muted contact-about">
            About <strong>{listing.title}</strong>. Your email stays private; replies arrive in
            Messages.
          </p>
          {error && (
            <div className="banner error" role="alert">
              {error}
            </div>
          )}
          <label className="field">
            <span className="field-label">Your message</span>
            <textarea
              ref={field}
              className="input"
              rows={4}
              value={text}
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
        </div>

        <div className="sheet-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !canSend(text)}>
            {busy ? "Sending…" : "Send message"}
          </button>
        </div>
      </form>
    </>
  );
}
