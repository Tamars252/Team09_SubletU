import { NavLink } from "react-router-dom";
import { HOME_PATH, SAVED_PATH } from "../auth/guard.ts";
import { IconCards, IconHeart } from "../components/Icons.tsx";

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
  { path: SAVED_PATH, label: "Saved", Icon: IconHeart, matchChildren: true },
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
 */
export function BottomNav() {
  return (
    <nav className="nav" aria-label="Main">
      {NAV_ITEMS.map(({ path, label, Icon, matchChildren }) => (
        <NavLink
          key={path}
          to={path}
          end={!matchChildren}
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
        >
          <Icon size={21} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
