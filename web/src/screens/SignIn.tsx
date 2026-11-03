import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout.tsx";
import { PasswordField } from "../components/PasswordField.tsx";
import { TextField } from "../components/TextField.tsx";
import { mapAuthError } from "../auth/errors.ts";
import { REGISTER_PATH, returnTo } from "../auth/guard.ts";
import { hasErrors, validateLogin } from "../auth/validation.ts";
import type { FieldErrors, LoginField } from "../auth/validation.ts";
import { useAuth } from "../state/AuthContext.tsx";

export function SignIn() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({});
  const [formMessage, setFormMessage] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormMessage(undefined);

    const found = validateLogin({ email, password });
    setErrors(found);
    if (hasErrors(found)) return;

    setPending(true);
    try {
      await login(email.trim(), password);
      // Back to whatever they were trying to reach before the redirect.
      navigate(returnTo((location.state as { from?: unknown } | null)?.from), { replace: true });
    } catch (err) {
      const mapped = mapAuthError(err, "signin");
      setFormMessage(mapped.formMessage);
      setErrors(mapped.fieldErrors as FieldErrors<LoginField>);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout>
      {/* noValidate so our messages are shown instead of the browser's, which
          cannot be styled and vanish on the next keystroke. */}
      <form onSubmit={onSubmit} noValidate>
        {formMessage && (
          <div className="banner error" role="alert">
            {formMessage}
          </div>
        )}

        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="username"
          value={email}
          onChange={setEmail}
          error={errors.email}
          autoFocus
        />

        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
        />

        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="auth-links">
        New to SubletU?{" "}
        <Link className="linkish" to={REGISTER_PATH} state={location.state}>
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
