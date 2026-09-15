import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client.ts";
import type { AuthConfig } from "../api/types.ts";
import { useAuth } from "../state/AuthContext.tsx";
import { MicrosoftMark } from "../components/Icons.tsx";
import { PasswordField } from "../components/PasswordField.tsx";

type Mode = "signin" | "register" | "forgot";

export function AuthScreen() {
  const { login, register } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<Mode>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    api.authConfig().then(setConfig).catch(() => undefined);
    // Surface the reason when Microsoft or the callback turned us away.
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    if (reason) {
      setNotice({ kind: "error", text: reason });
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const domains = config?.allowedDomains ?? ["syr.edu"];
  const domainLabel = domains.map((d) => `@${d}`).join(" or ");
  const minLength = config?.passwordMinLength ?? 12;

  function reset(next: Mode) {
    setMode(next);
    setNotice(null);
    setProblems([]);
    setPassword("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setProblems([]);
    try {
      if (mode === "signin") {
        await login(email.trim().toLowerCase(), password);
      } else if (mode === "register") {
        await register({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          university: "Syracuse University",
        });
      } else {
        const { message } = await api.forgotPassword(email.trim().toLowerCase());
        setNotice({ kind: "success", text: message });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setNotice({ kind: "error", text: err.message });
        setProblems(err.problems);
      } else {
        setNotice({ kind: "error", text: "Something went wrong. Try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          Sublet<span>U</span>
        </div>
        <p className="auth-tagline">
          Student sublets near campus — swipe through what's open, see it on the map, message the
          person who actually lives there.
        </p>

        {config?.ssoEnabled && (
          <>
            <a className="btn btn-sso" href="/api/auth/sso/start">
              <MicrosoftMark size={17} />
              Continue with Syracuse University
            </a>
            <p className="auth-hint">
              Signs you in with your {domainLabel} account and verifies you're a student.
            </p>
            {config.ssoDevMode && (
              <p className="auth-dev-flag">
                Development stand-in — no Microsoft app registration is configured on this server.
              </p>
            )}
            <div className="auth-divider">
              <span>or use a password</span>
            </div>
          </>
        )}

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "on" : ""}
            onClick={() => reset("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "on" : ""}
            onClick={() => reset("register")}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          {mode === "register" && (
            <label className="field">
              <span className="field-label">Full name</span>
              <input
                className="input"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}

          <label className="field">
            <span className="field-label">School email</span>
            <input
              className="input"
              type="email"
              autoComplete="username"
              placeholder={`you${domains[0] ? `@${domains[0]}` : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          {mode !== "forgot" && (
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              showStrength={mode === "register"}
              minLength={minLength}
            />
          )}

          {mode === "forgot" && (
            <p className="auth-hint">
              We'll email a link to choose a new password. It works once and expires shortly.
            </p>
          )}

          {notice && (
            <div className={`banner ${notice.kind}`}>
              {notice.text}
              {problems.length > 0 && (
                <ul className="banner-list">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy
              ? "One moment…"
              : mode === "signin"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : "Email me a reset link"}
          </button>
        </form>

        <div className="auth-links">
          {mode === "forgot" ? (
            <button type="button" className="linkish" onClick={() => reset("signin")}>
              Back to sign in
            </button>
          ) : (
            <button type="button" className="linkish" onClick={() => reset("forgot")}>
              Forgot your password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
