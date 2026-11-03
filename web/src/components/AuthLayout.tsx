import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { REGISTER_PATH, SIGN_IN_PATH } from "../auth/guard.ts";

/**
 * The shell both auth screens sit in. The two tabs are real links, so the
 * screens are reachable by URL and the browser's Back button behaves.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { pathname, state } = useLocation();
  // Carry the "where they were headed" marker across the tab switch, so
  // someone bounced to sign-in who registers instead still lands where they meant to.
  const carry = { state };

  return (
    <div className="auth">
      <h1 className="auth-logo">
        Sublet<span>U</span>
      </h1>
      <p className="auth-tag">Student sublets near campus.</p>

      <nav className="auth-switch" aria-label="Sign in or create an account">
        <Link
          to={SIGN_IN_PATH}
          {...carry}
          className={pathname === SIGN_IN_PATH ? "on" : undefined}
          aria-current={pathname === SIGN_IN_PATH ? "page" : undefined}
        >
          Sign in
        </Link>
        <Link
          to={REGISTER_PATH}
          {...carry}
          className={pathname === REGISTER_PATH ? "on" : undefined}
          aria-current={pathname === REGISTER_PATH ? "page" : undefined}
        >
          Create account
        </Link>
      </nav>

      {children}
    </div>
  );
}
