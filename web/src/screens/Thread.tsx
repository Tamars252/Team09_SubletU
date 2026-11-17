import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api/client.ts";
import type { Listing, Message } from "../api/types.ts";
import { MESSAGES_PATH } from "../auth/guard.ts";
import { useShell } from "../components/AppShell.tsx";
import { IconArrowLeft, IconSend } from "../components/Icons.tsx";
import {
  ARCHIVED_VIEW,
  MAX_MESSAGE_LENGTH,
  canSend,
  formatMessageTime,
  isSendShortcut,
  otherPartyName,
} from "../lib/messages.ts";

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ok"; role: string; listing: Listing | null; messages: Message[] };

/**
 * TM09-104: one conversation. Opening it marks the other party's messages
 * read on the server, so the tab badge is refreshed straight after.
 */
export function Thread() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const back =
    params.get("from") === ARCHIVED_VIEW ? `${MESSAGES_PATH}?view=${ARCHIVED_VIEW}` : MESSAGES_PATH;
  const { refreshUnread } = useShell();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    let stale = false;
    setState({ kind: "loading" });
    api
      .messages(id)
      .then(({ conversation, results }) => {
        if (stale) return;
        setState({
          kind: "ok",
          role: conversation.role,
          listing: conversation.listing,
          messages: results,
        });
        refreshUnread();
      })
      .catch((err: unknown) => {
        if (stale) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
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
  }, [id, refreshUnread]);

  useEffect(load, [load]);

  const messageCount = state.kind === "ok" ? state.messages.length : 0;
  // Newest message in view on open and after each send.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount]);

  async function send() {
    if (state.kind !== "ok" || sending || !canSend(draft)) return;
    setSending(true);
    setSendError(null);
    try {
      const { message } = await api.sendMessage(id, draft.trim());
      setState((current) =>
        current.kind === "ok" ? { ...current, messages: [...current.messages, message] } : current,
      );
      setDraft("");
    } catch (err: unknown) {
      // The draft stays, so nothing the person typed is lost.
      setSendError(err instanceof ApiError ? err.message : "Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const shortcut = {
      key: event.key,
      shiftKey: event.shiftKey,
      keyCode: event.keyCode,
      isComposing: event.nativeEvent.isComposing,
    };
    if (isSendShortcut(shortcut)) {
      event.preventDefault();
      void send();
    }
  }

  const name = state.kind === "ok" ? otherPartyName(state.role, state.listing, state.messages) : "";

  return (
    <div className="chat">
      <div className="chat-head">
        <Link className="icon-btn" to={back} aria-label="Back to messages">
          <IconArrowLeft size={19} />
        </Link>
        {state.kind === "ok" && (
          <div className="chat-head-text">
            <h2 className="chat-title">{name}</h2>
            {state.listing && <span className="tiny">{state.listing.title}</span>}
          </div>
        )}
      </div>

      {state.kind === "loading" && (
        <div className="center-state" role="status" aria-live="polite">
          <div className="spinner" />
          <span className="sr-only">Loading conversation…</span>
        </div>
      )}

      {state.kind === "missing" && (
        <div className="center-state">
          <h3>This conversation isn't available</h3>
          <Link className="btn btn-primary" to={MESSAGES_PATH}>
            Back to messages
          </Link>
        </div>
      )}

      {state.kind === "error" && (
        <div className="center-state">
          <h3>Can't load this conversation</h3>
          <p className="muted">{state.message}</p>
          <button type="button" className="btn btn-primary" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {state.kind === "ok" && (
        <>
          {state.listing?.status === "removed" && (
            <div className="banner info">
              The host removed this listing. You can still message each other here.
            </div>
          )}

          <div className="chat-scroll" ref={scroller} role="log" aria-label={`Conversation with ${name}`}>
            {state.messages.length === 0 && (
              <p className="muted chat-empty">No messages yet. Say hello.</p>
            )}
            {state.messages.map((message) => (
              <div key={message.id} className={`bubble ${message.mine ? "mine" : "theirs"}`}>
                <span className="sr-only">{message.mine ? "You" : name}: </span>
                {message.body}
                <div className="bubble-time">
                  <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                </div>
              </div>
            ))}
          </div>

          {sendError && (
            <div className="banner error" role="alert">
              {sendError}
            </div>
          )}

          <form className="chat-compose" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="chat-draft">
              Message {name}
            </label>
            <textarea
              id="chat-draft"
              rows={1}
              value={draft}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Write a message"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              type="submit"
              className="icon-btn chat-send"
              disabled={sending || !canSend(draft)}
              aria-label="Send"
            >
              <IconSend size={18} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
