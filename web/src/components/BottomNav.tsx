import { NavLink } from "react-router-dom";
import { HOME_PATH, MESSAGES_PATH, POST_PATH, SAVED_PATH } from "../auth/guard.ts";
import { IconCards, IconChat, IconHeart, IconPlus } from "../components/Icons.tsx";
import { unreadLabel } from "../lib/messages.ts";

type NavItem = {
  path: string;
  label: string;
  Icon: (props: { size?: number }) => JSX.Element;
  /** True when a child path such as /saved/xyz should still light this item. */
  matchChildren?: boolean;
};

/**
 * The tab bar. Add a screen by adding a row here — nothing else in this file
 * is per-screen. TM09-106 adds Profile; the swipe deck, map and messages
 * screens slot in the same way as their stories land.
 */
export const NAV_ITEMS: NavItem[] = [
  { path: HOME_PATH, label: "Browse", Icon: IconCards },
  { path: POST_PATH, label: "Post", Icon: IconPlus },
  { path: SAVED_PATH, label: "Saved", Icon: IconHeart, matchChildren: true },
  { path: MESSAGES_PATH, label: "Messages", Icon: IconChat, matchChildren: true },
];

/**
 * TM09-101: the bottom nav.
 *
 * Rendered inside the signed-in shell, which already sits behind
 * ProtectedRoute, so "signed-in only" (AC1) comes from the existing guard
 * rather than a second session check here.
 *
 * NavLink sets `active` for us; `end` on the home item stops "/" matching
 * every path, since every path starts with it.
 *
 * `badges` maps a path to a count. A count above zero shows the dot and adds
 * the number to the link's accessible name — TM09-104 uses it for unread
 * messages.
 */
export function BottomNav({ badges = {} }: { badges?: Partial<Record<string, number>> }) {
  return (
    <nav className="nav" aria-label="Main">
      {NAV_ITEMS.map(({ path, label, Icon, matchChildren }) => {
        const badge = unreadLabel(badges[path] ?? 0);
        return (
          <NavLink
            key={path}
            to={path}
            end={!matchChildren}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <Icon size={21} />
            <span>{label}</span>
            {badge && (
              <>
                <span className="nav-dot" aria-hidden="true" />
                <span className="sr-only">, {badge}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
