import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api/client.ts";
import type { Conversation } from "../api/types.ts";
import { SAVED_PATH } from "../auth/guard.ts";
import { useShell } from "../components/AppShell.tsx";
import { IconArchive } from "../components/Icons.tsx";
import {
  ARCHIVED_VIEW,
  formatMessageTime,
  removeThread,
  restoreThread,
  threadPath,
  unreadLabel,
} from "../lib/messages.ts";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; threads: Conversation[] };

/**
 * TM09-104: the Messages tab — the inbox, and the archive behind a toggle.
 *
 * Archiving is per user (AC3): the server writes conversation_state for the
 * caller only, so the other person keeps the thread. The screen says so,
 * because "will they still see it?" is what stopped testers archiving
 * (usability finding F-4).
 *
 * The view lives in the URL (?view=archived) so Back from a thread returns
 * to the list it came from.
 */
export function Messages() {
  const [params, setParams] = useSearchParams();
  const archivedView = params.get("view") === ARCHIVED_VIEW;
  const { refreshUnread } = useShell();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    let stale = false;
    setState({ kind: "loading" });
    setActionError(null);
    api
      .conversations(archivedView)
      .then(({ results }) => {
        if (!stale) setState({ kind: "ok", threads: results });
      })
      .catch((err: unknown) => {
        if (stale) return;
        setState({
          kind: "error",
          message: err instanceof ApiError ? err.message : "Something went wrong.",
        });
      });
    // Keep the tab badge in step with the list on screen.
    refreshUnread();
    return () => {
      stale = true;
    };
  }, [archivedView, refreshUnread]);

  useEffect(load, [load]);

  function showView(archived: boolean) {
    setParams(archived ? { view: ARCHIVED_VIEW } : {}, { replace: true });
  }

  /** Moves a thread between the inbox and the archive, optimistically. */
  async function toggleArchive(thread: Conversation) {
    if (state.kind !== "ok") return;
    const removal = removeThread(state.threads, thread.id);
    if (!removal) return;

    setActionError(null);
    setState({ kind: "ok", threads: removal.next });
    try {
      await api.archiveConversation(thread.id, !archivedView);
      refreshUnread();
    } catch (err: unknown) {
      setState((current) =>
        current.kind === "ok"
          ? { kind: "ok", threads: restoreThread(current.threads, removal) }
          : current,
      );
      setActionError(
        err instanceof ApiError ? err.message : "Couldn't update that conversation. Try again.",
      );
    }
  }

  return (
    <div className="messages">
      <div className="messages-head">
        <h2 className="section-title">Messages</h2>
        <div className="messages-views" role="group" aria-label="Show">
          <button
            type="button"
            className={`chip${archivedView ? " outline" : " on"}`}
            aria-pressed={!archivedView}
            onClick={() => showView(false)}
          >
            Inbox
          </button>
          <button
            type="button"
            className={`chip${archivedView ? " on" : " outline"}`}
            aria-pressed={archivedView}
            onClick={() => showView(true)}
          >
            Archived
          </button>
        </div>
        {archivedView && (
          <p className="tiny messages-note">
            Archiving hides a conversation only for you. The other person still has it, and a new
            message from them brings it back to your inbox.
          </p>
        )}
      </div>

      {actionError && (
        <div className="banner error" role="alert">
          {actionError}
        </div>
      )}

      {state.kind === "loading" && (
        <div className="center-state" role="status" aria-live="polite">
          <div className="spinner" />
          <span className="sr-only">Loading conversations…</span>
        </div>
      )}

      {state.kind === "error" && (
        <div className="center-state">
          <h3>Can't load your messages</h3>
          <p className="muted">{state.message}</p>
          <button type="button" className="btn btn-primary" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {state.kind === "ok" && state.threads.length === 0 && (
        <div className="center-state">
          {archivedView ? (
            <>
              <h3>Nothing archived</h3>
              <p className="muted">Conversations you archive wait here until you need them.</p>
            </>
          ) : (
            <>
              <h3>No messages yet</h3>
              <p className="muted">Message a host from any listing you've saved.</p>
              <Link className="btn btn-primary" to={SAVED_PATH}>
                Go to Saved
              </Link>
            </>
          )}
        </div>
      )}

      {state.kind === "ok" && state.threads.length > 0 && (
        <ul className="thread-list">
          {state.threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              archivedView={archivedView}
              onToggleArchive={() => void toggleArchive(thread)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  archivedView,
  onToggleArchive,
}: {
  thread: Conversation;
  archivedView: boolean;
  onToggleArchive: () => void;
}) {
  const unread = unreadLabel(thread.unread);
  const target = archivedView
    ? `${threadPath(thread.id)}?from=${ARCHIVED_VIEW}`
    : threadPath(thread.id);

  return (
    <li className="thread-row">
      <Link className={`thread-card${unread ? " unread" : ""}`} to={target}>
        <span
          className="thread-photo"
          style={thread.listingPhoto ? { backgroundImage: `url(${thread.listingPhoto})` } : undefined}
          aria-hidden="true"
        />
        <span className="thread-body">
          <span className="thread-top">
            <span className="thread-name">{thread.other.name}</span>
            <span className="tiny">{formatMessageTime(thread.lastMessageAt)}</span>
          </span>
          <span className="thread-listing">
            {thread.listingTitle}
            {thread.listingStatus === "removed" && " · listing removed"}
          </span>
          <span className="thread-preview">{thread.lastMessage ?? "No messages yet"}</span>
        </span>
        {unread && (
          <>
            <span className="unread-dot" aria-hidden="true" />
            <span className="sr-only">{unread}</span>
          </>
        )}
      </Link>
      <button
        type="button"
        className="icon-btn thread-action"
        onClick={onToggleArchive}
        aria-label={
          archivedView
            ? `Move conversation with ${thread.other.name} back to the inbox`
            : `Archive conversation with ${thread.other.name}`
        }
        title={archivedView ? "Move to inbox" : "Archive"}
      >
        <IconArchive size={17} />
      </button>
    </li>
  );
}
