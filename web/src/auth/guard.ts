/**
 * TM09-148: the decision ProtectedRoute makes, kept apart from the component
 * that renders it so it can be tested without a DOM.
 */

export const SIGN_IN_PATH = "/signin";
export const REGISTER_PATH = "/register";
export const HOME_PATH = "/";
export const SAVED_PATH = "/saved";

export type GuardState = {
  /** The session is still being restored from a stored token. */
  loading: boolean;
  /** Null once we know for certain nobody is signed in. */
  user: unknown;
};

export type GuardDecision =
  | { kind: "wait" }
  | { kind: "redirect"; to: string; from: string }
  | { kind: "allow" };

/**
 * While `loading` is true we know nothing yet. Redirecting then would bounce a
 * signed-in person to the sign-in screen on every refresh, which is the single
 * most common way this pattern is got wrong.
 */
export function guardDecision(state: GuardState, pathname: string): GuardDecision {
  if (state.loading) return { kind: "wait" };
  if (state.user) return { kind: "allow" };
  return { kind: "redirect", to: SIGN_IN_PATH, from: pathname };
}

/**
 * Where to send someone after they sign in.
 *
 * `from` arrives through router state, so it is only ever a path this app put
 * there — but it is still untrusted input, and a value like
 * `https://example.com` or `//example.com` would turn the sign-in form into an
 * open redirect. Anything that is not a plain internal path is discarded.
 */
export function returnTo(from: unknown, fallback: string = HOME_PATH): string {
  if (typeof from !== "string" || from === "") return fallback;
  if (!from.startsWith("/")) return fallback;
  if (from.startsWith("//")) return fallback;
  if (from.includes("\\")) return fallback;
  // Bouncing back to an auth screen would strand people in a loop.
  if (from === SIGN_IN_PATH || from === REGISTER_PATH) return fallback;
  return from;
}
