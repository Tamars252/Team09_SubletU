import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client.ts";
import type { Conversation, Message } from "../api/types.ts";
import {
  IconArchive,
  IconArrowLeft,
  IconChat,
  IconCheck,
  IconSend,
} from "../components/Icons.tsx";
import { clockTime, money, relativeTime } from "../lib/format.ts";

type Props = {
  openConversationId: string | null;
  onConsumeOpen: () => void;
  onUnreadChange: () => void;
};

export function Messages({ openConversationId, onConsumeOpen, onUnreadChange }: Props) {
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { results } = await api.conversations(showArchived);
      setThreads(results);
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep-link in from "message host" on the detail screen.
  useEffect(() => {
    if (!openConversationId) return;
    setActiveId(openConversationId);
    onConsumeOpen();
  }, [openConversationId, onConsumeOpen]);

  async function archive(thread: Conversation, archived: boolean) {
    setThreads((current) => current.filter((t) => t.id !== thread.id));
    try {
      await api.archiveConversation(thread.id, archived);
    } catch {
      void load();
    }
  }

  if (activeId) {
    return (
      <Thread
        conversationId={activeId}
        onBack={() => {
          setActiveId(null);
          void load();
          onUnreadChange();
        }}
      />
    );
  }

  return (
    <>
      <div className="header">
        <div className="header-title">{showArchived ? "Archived" : "Messages"}</div>
        <button
          type="button"
          className={`icon-btn${showArchived ? " active" : ""}`}
          onClick={() => setShowArchived((v) => !v)}
          aria-label={showArchived ? "Show inbox" : "Show archived"}
        >
          <IconArchive size={18} />
        </button>
      </div>

      {loading && (
        <div className="center-state">
          <div className="spinner" />
        </div>
      )}

      {!loading && threads.length === 0 && (
        <div className="center-state">
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: 62,
              height: 62,
              borderRadius: "50%",
              background: "var(--blush)",
              color: "var(--terracotta)",
            }}
          >
            <IconChat size={28} />
          </div>
          <h3>{showArchived ? "Nothing archived" : "No messages yet"}</h3>
          <p>
            {showArchived
              ? "Threads you swipe away land here. Swipe them back to restore."
              : "Open a listing and tap “Message host” to start a conversation. Swipe a thread left to archive it."}
          </p>
        </div>
      )}

      {!loading &&
        threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            archived={showArchived}
            onOpen={() => setActiveId(thread.id)}
            onArchive={() => void archive(thread, !showArchived)}
          />
        ))}
    </>
  );
}

/* ----------------------------------------------------------- swipe-to-archive */

function ThreadRow({
  thread,
  archived,
  onOpen,
  onArchive,
}: {
  thread: Conversation;
  archived: boolean;
  onOpen: () => void;
  onArchive: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const base = useRef(0);
  const moved = useRef(false);
  const pointer = useRef<number | null>(null);

  const REVEAL = 96;

  function down(event: React.PointerEvent) {
    pointer.current = event.pointerId;
    startX.current = event.clientX;
    base.current = offset;
    moved.current = false;
    setDragging(true);
  }

  function move(event: React.PointerEvent) {
    if (pointer.current !== event.pointerId) return;
    const dx = event.clientX - startX.current;
    if (Math.abs(dx) > 5) moved.current = true;
    // Clamp so the row only ever slides left, far enough to reveal the action.
    setOffset(Math.min(0, Math.max(-REVEAL - 24, base.current + dx)));
  }

  function up(event: React.PointerEvent) {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    setDragging(false);
    // Past halfway commits the reveal; otherwise snap back closed. Opening the
    // thread is left to onClick so keyboard activation works too.
    setOffset(moved.current ? (offset < -REVEAL / 2 ? -REVEAL : 0) : 0);
  }

  function activate() {
    // A drag still fires click afterwards, so ignore it unless this was a tap
    // on a closed row.
    if (moved.current || offset < -4) return;
    onOpen();
  }

  return (
    <div className="thread-row">
      {offset < -4 && (
        <button type="button" className="thread-archive" onClick={onArchive}>
          <IconArchive size={19} />
          {archived ? "Restore" : "Archive"}
        </button>
      )}
      <button
        type="button"
        className={`thread-card${thread.unread > 0 ? " unread" : ""}`}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 0.2s ease-out",
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={activate}
      >
        <div
          className="thread-photo"
          style={
            thread.listingPhoto ? { backgroundImage: `url(${thread.listingPhoto})` } : undefined
          }
        />
        <div className="thread-body">
          <div className="thread-top">
            <span className="thread-name">
              {thread.other.name}
              {thread.other.verified && (
                <IconCheck size={11} strokeWidth={3} className="muted" />
              )}
            </span>
            <span className="tiny" style={{ flexShrink: 0 }}>
              {relativeTime(thread.lastMessageAt)}
            </span>
          </div>
          <div className="thread-listing">
            {thread.role === "host" ? "Asking about" : "You asked about"} {thread.listingTitle}
            {thread.monthlyRent !== null && ` · ${money(thread.monthlyRent)}/mo`}
          </div>
          <div className="thread-preview">{thread.lastMessage ?? "No messages yet"}</div>
        </div>
        {thread.unread > 0 && <div className="unread-dot" />}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- chat */

function Thread({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [header, setHeader] = useState<{ title: string; rent: number | null } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .messages(conversationId)
      .then(({ conversation, results }) => {
        setMessages(results);
        setHeader({
          title: conversation.listing?.title ?? "Listing",
          rent: conversation.listing?.pricing?.monthlyRent ?? null,
        });
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      const { message } = await api.sendMessage(conversationId, body);
      setMessages((current) => [...current, message]);
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat">
      <div className="header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to messages">
          <IconArrowLeft size={19} />
        </button>
        <div className="header-title" style={{ flex: 1, fontSize: 16 }}>
          {header?.title ?? "Conversation"}
        </div>
      </div>

      {header?.rent !== null && header !== null && (
        <div className="chat-listing">
          <span style={{ fontWeight: 600 }}>{money(header.rent)}/mo</span>
          <span className="tiny">Keep payments and tours on campus and in person.</span>
        </div>
      )}

      <div className="chat-scroll" ref={scroller}>
        {loading && <div className="spinner" style={{ margin: "24px auto" }} />}
        {!loading &&
          messages.map((message) => (
            <div key={message.id} className={`bubble ${message.mine ? "mine" : "theirs"}`}>
              {message.body}
              <div className="bubble-time">{clockTime(message.createdAt)}</div>
            </div>
          ))}
      </div>

      <div className="chat-compose">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Write a message…"
          rows={1}
        />
        <button
          type="button"
          className="send-btn"
          disabled={!draft.trim() || sending}
          onClick={() => void send()}
          aria-label="Send message"
        >
          <IconSend size={18} />
        </button>
      </div>
    </div>
  );
}
