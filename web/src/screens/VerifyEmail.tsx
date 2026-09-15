import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, setToken } from "../api/client.ts";
import type { User } from "../api/types.ts";
import { useAuth } from "../state/AuthContext.tsx";

const LENGTH = 6;

/**
 * Shown to a signed-in account that has not yet confirmed its address. The
 * server enforces the same rule on anything outward-facing, so this screen is
 * the explanation rather than the control.
 */
export function VerifyEmail({ onVerified }: { onVerified: (user: User) => void }) {
  const { user, logout } = useAuth();
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentOnce = useRef(false);

  const send = useCallback(async (announce: boolean) => {
    setError(null);
    try {
      const res = await api.sendVerificationCode();
      if (announce && res.email) setSentTo(res.email);
      setCooldown(res.cooldownSeconds ?? 60);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(err.message);
        setCooldown(60);
      } else if (announce) {
        setError("Could not send a code just now. Try again in a moment.");
      }
    }
  }, []);

  // A code already went out with the registration response. Don't send a
  // second one on mount — that would double every new account's email and
  // immediately trip the cooldown.
  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    setCooldown(60);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const submit = useCallback(
    async (code: string) => {
      setBusy(true);
      setError(null);
      try {
        const { token, user: verified } = await api.verifyEmail(code);
        setToken(token);
        onVerified(verified);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not check that code.");
        setDigits("");
        inputRef.current?.focus();
        setBusy(false);
      }
    },
    [onVerified],
  );

  function onDigits(next: string) {
    const cleaned = next.replace(/\D/g, "").slice(0, LENGTH);
    setDigits(cleaned);
    setError(null);
    // Submitting on the last digit saves a tap; the code is fixed-length so
    // there is nothing ambiguous about when it is complete.
    if (cleaned.length === LENGTH) void submit(cleaned);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          Sublet<span>U</span>
        </div>
        <h1 className="auth-heading">Confirm your school email</h1>
        <p className="auth-tagline">
          We sent a {LENGTH}-digit code to <strong>{sentTo ?? user?.email}</strong>. Entering it
          confirms the address is really yours.
        </p>

        <label className="field">
          <span className="field-label">Verification code</span>
          <input
            ref={inputRef}
            className="input code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            // Lets iOS and Chrome offer the code straight from the message.
            pattern="[0-9]*"
            maxLength={LENGTH}
            placeholder="000000"
            value={digits}
            disabled={busy}
            onChange={(e) => onDigits(e.target.value)}
            aria-describedby="code-help"
          />
        </label>

        {error && <div className="banner error">{error}</div>}

        <p className="auth-hint" id="code-help">
          The code expires in 15 minutes. You can browse listings while you wait — posting and
          messaging open up once you're confirmed.
        </p>

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || digits.length !== LENGTH}
          onClick={() => void submit(digits)}
        >
          {busy ? "Checking…" : "Confirm"}
        </button>

        <div className="auth-links">
          <button
            type="button"
            className="linkish"
            disabled={cooldown > 0}
            onClick={() => void send(true)}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Send me another code"}
          </button>
        </div>
        <div className="auth-links">
          <button type="button" className="linkish" onClick={logout}>
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
