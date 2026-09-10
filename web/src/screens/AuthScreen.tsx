import { useState } from "react";
import { useAuth } from "../state/AuthContext.tsx";
import type { Reference } from "../api/types.ts";

type Props = { reference: Reference | null };

export function AuthScreen({ reference }: Props) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [university, setUniversity] = useState("Syracuse University");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register({ email: email.trim(), password, name: name.trim(), university });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function useDemo() {
    setMode("login");
    setEmail("demo@syr.edu");
    setPassword("sublet123");
    setError(null);
  }

  return (
    <div className="auth">
      <div className="auth-logo">
        Sublet<span>U</span>
      </div>
      <p className="auth-tag">
        Student sublets near campus — swipe through what's open, see it on the map, message the
        person who actually lives there.
      </p>

      <div className="auth-switch">
        <button
          type="button"
          className={mode === "login" ? "on" : ""}
          onClick={() => setMode("login")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "register" ? "on" : ""}
          onClick={() => setMode("register")}
        >
          Create account
        </button>
      </div>

      {error && (
        <div className="banner error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={submit}>
        {mode === "register" && (
          <>
            <label className="field">
              <span className="field-label">Full name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">University</span>
              <select
                className="input"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
              >
                {(reference?.universities ?? ["Syracuse University"]).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="field">
          <span className="field-label">School email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@syr.edu"
            autoComplete="email"
            required
          />
          {mode === "register" && (
            <span className="field-hint">A .edu address gets your account verified right away.</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "register" ? 8 : undefined}
            required
          />
          {mode === "register" && <span className="field-hint">At least 8 characters.</span>}
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div className="auth-demo">
        <strong>Just looking around?</strong> Use the seeded demo account —{" "}
        <code>demo@syr.edu</code> / <code>sublet123</code>.
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-block"
          style={{ marginTop: 10 }}
          onClick={useDemo}
        >
          Fill in demo login
        </button>
      </div>
    </div>
  );
}
