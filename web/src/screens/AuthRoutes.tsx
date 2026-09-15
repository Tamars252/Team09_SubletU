import { useEffect, useState } from "react";
import { ApiError, api, setToken } from "../api/client.ts";
import type { User } from "../api/types.ts";
import { PasswordField } from "../components/PasswordField.tsx";
import { MicrosoftMark } from "../components/Icons.tsx";

/**
 * The app has no router, so these are driven off window.location by
 * <App>. Each one ends by handing a session to onSignedIn, or by sending the
 * visitor back to "/" where the normal sign-in screen takes over.
 */
type Props = { onSignedIn: (user: User) => void };

function goHome(): void {
  window.history.replaceState({}, "", "/");
  window.location.reload();
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          Sublet<span>U</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------- /auth/callback?code=… */

/** Trades the one-time code from the SSO redirect for a session. */
export function SsoCallback({ onSignedIn }: Props) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setError("That sign-in link is incomplete.");
      return;
    }
    api
      .ssoExchange(code)
      .then(({ token, user }) => {
        setToken(token);
        // Drop the code from the URL before anything else can read it out of
        // history or a Referer header.
        window.history.replaceState({}, "", "/");
        onSignedIn(user);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Could not complete sign-in."),
      );
  }, [onSignedIn]);

  return (
    <Shell>
      {error ? (
        <>
          <div className="banner error">{error}</div>
          <button type="button" className="btn btn-primary btn-block" onClick={goHome}>
            Back to sign in
          </button>
        </>
      ) : (
        <div className="center-state">
          <div className="spinner" />
          <p className="auth-hint">Finishing sign-in…</p>
        </div>
      )}
    </Shell>
  );
}

/* -------------------------------------------------------- /auth/dev-sso */

/**
 * Stands in for the Microsoft sign-in page when the server has no app
 * registration. The server refuses this route in production.
 */
export function DevSso({ onSignedIn }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { code } = await api.ssoDevComplete({ email: email.trim(), name: name.trim() });
      const { token, user } = await api.ssoExchange(code);
      setToken(token);
      window.history.replaceState({}, "", "/");
      onSignedIn(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="sso-stub-head">
        <MicrosoftMark size={20} />
        <span>Sign in — development stand-in</span>
      </div>
      <p className="auth-dev-flag">
        This server has no Microsoft app registration, so this screen stands in for it. It proves
        nothing about who you are and is refused in production.
      </p>
      <form onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">School email</span>
          <input
            className="input"
            type="email"
            placeholder="you@syr.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Full name (optional)</span>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error && <div className="banner error">{error}</div>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Signing in…" : "Continue"}
        </button>
      </form>
      <div className="auth-links">
        <button type="button" className="linkish" onClick={goHome}>
          Cancel
        </button>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------ /auth/reset?token= */

export function ResetPassword({ onSignedIn }: Props) {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [minLength, setMinLength] = useState(12);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    // Checked before asking for a password, so a dead link says so up front
    // instead of after the user has typed one.
    api
      .checkResetToken(token)
      .then((res) => {
        setMinLength(res.passwordMinLength);
        setState(res.valid ? "ready" : "invalid");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    setProblems([]);
    try {
      const { token: session, user } = await api.resetPassword({ token, password });
      setToken(session);
      window.history.replaceState({}, "", "/");
      onSignedIn(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setProblems(err.problems);
      } else {
        setError("Could not reset your password.");
      }
      setBusy(false);
    }
  }

  if (state === "checking") {
    return (
      <Shell>
        <div className="center-state">
          <div className="spinner" />
          <p className="auth-hint">Checking your link…</p>
        </div>
      </Shell>
    );
  }

  if (state === "invalid") {
    return (
      <Shell>
        <h1 className="auth-heading">This link has expired</h1>
        <p className="auth-hint">
          Reset links work once and expire quickly. Request a fresh one and it'll arrive in a
          moment.
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={goHome}>
          Back to sign in
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="auth-heading">Choose a new password</h1>
      <form onSubmit={submit} noValidate>
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          showStrength
          minLength={minLength}
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {error && (
          <div className="banner error">
            {error}
            {problems.length > 0 && (
              <ul className="banner-list">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="auth-hint">
          Setting a new password signs out anyone else using this account.
        </p>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Saving…" : "Save and sign in"}
        </button>
      </form>
    </Shell>
  );
}

/* ---------------------------------------------------------- route matching */

export type AuthRoute = "callback" | "dev-sso" | "reset" | null;

export function matchAuthRoute(pathname: string): AuthRoute {
  if (pathname === "/auth/callback") return "callback";
  if (pathname === "/auth/dev-sso") return "dev-sso";
  if (pathname === "/auth/reset") return "reset";
  return null;
}
