import { Navigate, Outlet, useLocation } from "react-router-dom";
import { guardDecision } from "../auth/guard.ts";
import { useAuth } from "../state/AuthContext.tsx";

/**
 * Wraps the routes that need somebody signed in. Used as a layout route, so
 * the screens underneath render through <Outlet/> and never have to think
 * about the session themselves.
 *
 * The decision itself lives in auth/guard.ts so it can be tested without a DOM.
 */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const decision = guardDecision({ loading, user }, `${location.pathname}${location.search}${location.hash}`);

  if (decision.kind === "wait") {
    return (
      <div className="center-state" role="status" aria-live="polite">
        <div className="spinner" />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  if (decision.kind === "redirect") {
    // `replace` so the guarded URL does not sit in history — otherwise Back
    // from the sign-in screen lands straight back on the redirect.
    return <Navigate to={decision.to} state={{ from: decision.from }} replace />;
  }

  return <Outlet />;
}
