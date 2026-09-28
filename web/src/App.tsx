import { useCallback, useEffect, useState } from "react";
import { api } from "./api/client.ts";
import type { Filters, Listing, Reference, User } from "./api/types.ts";
import { EMPTY_FILTERS } from "./api/types.ts";
import { useAuth } from "./state/AuthContext.tsx";
import { AuthScreen } from "./screens/AuthScreen.tsx";
import { DevSso, ResetPassword, SsoCallback, matchAuthRoute } from "./screens/AuthRoutes.tsx";
import { VerifyEmail } from "./screens/VerifyEmail.tsx";
import { Browse } from "./screens/Browse.tsx";
import { MapScreen } from "./screens/MapScreen.tsx";
import { Saved } from "./screens/Saved.tsx";
import { Messages } from "./screens/Messages.tsx";
import { Post } from "./screens/Post.tsx";
import { Settings } from "./screens/Settings.tsx";
import { ListingDetail } from "./screens/ListingDetail.tsx";
import { ReportSheet } from "./components/ReportSheet.tsx";
import {
  IconCards,
  IconChat,
  IconHeart,
  IconMap,
  IconUser,
} from "./components/Icons.tsx";

type Tab = "browse" | "map" | "post" | "saved" | "messages" | "settings";

const TABS: Array<{ key: Tab; label: string; icon: typeof IconCards }> = [
  { key: "browse", label: "Browse", icon: IconCards },
  { key: "map", label: "Map", icon: IconMap },
  { key: "saved", label: "Saved", icon: IconHeart },
  { key: "messages", label: "Messages", icon: IconChat },
  { key: "settings", label: "Profile", icon: IconUser },
];

export function App() {
  const { user, loading, setUser } = useAuth();
  // Read once on mount: these paths are entered by a full page load (a redirect
  // back from Microsoft, or a link out of an email), never by in-app routing.
  const [authRoute, setAuthRoute] = useState(() => matchAuthRoute(window.location.pathname));
  const [reference, setReference] = useState<Reference | null>(null);
  const [tab, setTab] = useState<Tab>("browse");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [detail, setDetail] = useState<Listing | null>(null);
  const [reporting, setReporting] = useState<Listing | null>(null);
  const [savedKey, setSavedKey] = useState(0);
  const [unread, setUnread] = useState(0);
  const [openConversation, setOpenConversation] = useState<string | null>(null);

  useEffect(() => {
    api
      .reference()
      .then(setReference)
      .catch(() => undefined);
  }, []);

  const refreshUnread = useCallback(() => {
    if (!user) return;
    api
      .unreadCount()
      .then(({ unread: n }) => setUnread(n))
      .catch(() => undefined);
  }, [user]);

  useEffect(() => {
    refreshUnread();
    if (!user) return;
    // Light polling keeps the badge honest without a websocket layer.
    const timer = setInterval(refreshUnread, 20_000);
    return () => clearInterval(timer);
  }, [refreshUnread, user]);

  // Default the campus filter anchor to the signed-in user's school.
  useEffect(() => {
    if (user) setFilters((f) => ({ ...f }));
  }, [user?.university]);

  const bumpSaved = useCallback(() => setSavedKey((k) => k + 1), []);

  /**
   * Finishes an auth route. Clearing the route matters as much as setting the
   * user: these screens are chosen from the URL at mount, so without this the
   * callback screen would stay mounted over a signed-in app.
   */
  const completeAuth = useCallback(
    (signedIn: User) => {
      setUser(signedIn);
      setAuthRoute(null);
    },
    [setUser],
  );

  function openListing(listing: Listing) {
    setDetail(listing);
  }

  // These own the screen whether or not a session already exists — arriving at
  // a reset link while signed in still has to let you set a new password.
  if (authRoute) {
    return (
      <div className="app">
        <div className="app-main">
          {authRoute === "callback" && <SsoCallback onSignedIn={completeAuth} />}
          {authRoute === "dev-sso" && <DevSso onSignedIn={completeAuth} />}
          {authRoute === "reset" && <ResetPassword onSignedIn={completeAuth} />}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app">
        <div className="center-state" style={{ flex: 1 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app">
        <div className="app-main">
          <AuthScreen />
        </div>
      </div>
    );
  }

  // Signed in but the address is unconfirmed. Accounts created through
  // Microsoft arrive verified and never see this.
  if (!user.verified) {
    return (
      <div className="app">
        <div className="app-main">
          <VerifyEmail onVerified={setUser} />
        </div>
      </div>
    );
  }

  const detailOpen = detail !== null;
  const fullBleed = tab === "browse" || tab === "map";

  return (
    <div className="app">
      {detailOpen ? (
        <div className="app-main">
          <ListingDetail
            listing={detail}
            isOwnListing={detail.ownerId === user.id}
            onBack={() => setDetail(null)}
            onReport={setReporting}
            onSavedChange={bumpSaved}
            onMessageSent={(conversationId) => {
              setOpenConversation(conversationId);
              setDetail(null);
              setTab("messages");
              refreshUnread();
            }}
          />
        </div>
      ) : (
        <div className={`app-main${fullBleed ? " no-scroll" : ""}`}>
          {tab === "browse" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <Browse
                filters={filters}
                onFiltersChange={setFilters}
                reference={reference}
                onOpenListing={openListing}
                onReport={setReporting}
                onSavedChange={bumpSaved}
                onOpenPost={() => setTab("post")}
              />
            </div>
          )}

          {tab === "map" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <MapScreen
                filters={filters}
                onFiltersChange={setFilters}
                reference={reference}
                university={user.university}
                onOpenListing={openListing}
              />
            </div>
          )}

          {tab === "post" && (
            <Post reference={reference} onPosted={openListing} onOpenListing={openListing} />
          )}

          {tab === "saved" && (
            <Saved
              refreshKey={savedKey}
              onOpenListing={openListing}
              onSavedChange={bumpSaved}
              onBrowse={() => setTab("browse")}
            />
          )}

          {tab === "messages" && (
            <Messages
              openConversationId={openConversation}
              onConsumeOpen={() => setOpenConversation(null)}
              onUnreadChange={refreshUnread}
            />
          )}

          {tab === "settings" && <Settings reference={reference} />}
        </div>
      )}

      {!detailOpen && (
        <nav className="nav">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`nav-item${tab === key ? " active" : ""}`}
              onClick={() => setTab(key)}
              aria-current={tab === key}
            >
              <Icon size={21} strokeWidth={tab === key ? 2.4 : 2} />
              {label}
              {key === "messages" && unread > 0 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
      )}

      {reporting && (
        <ReportSheet
          listing={reporting}
          reference={reference}
          onClose={() => setReporting(null)}
        />
      )}
    </div>
  );
}
