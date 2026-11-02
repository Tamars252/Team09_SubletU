import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout.tsx";
import { PasswordField } from "../components/PasswordField.tsx";
import { TextField } from "../components/TextField.tsx";
import { mapAuthError } from "../auth/errors.ts";
import { SIGN_IN_PATH, returnTo } from "../auth/guard.ts";
import { MIN_PASSWORD, hasErrors, validateRegister } from "../auth/validation.ts";
import type { FieldErrors, RegisterField } from "../auth/validation.ts";
import { useAuth } from "../state/AuthContext.tsx";

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors<RegisterField>>({});
  const [formMessage, setFormMessage] = useState<string | undefined>();
  const [emailTaken, setEmailTaken] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormMessage(undefined);
    setEmailTaken(false);

    const found = validateRegister({ name, email, password, confirm });
    setErrors(found);
    if (hasErrors(found)) return;

    setPending(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
      navigate(returnTo((location.state as { from?: unknown } | null)?.from), { replace: true });
    } catch (err) {
      const mapped = mapAuthError(err, "register");
      setFormMessage(mapped.formMessage);
      setErrors(mapped.fieldErrors as FieldErrors<RegisterField>);
      // Offer the way out rather than leaving them to work it out.
      if (mapped.fieldErrors.email) setEmailTaken(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} noValidate>
        {formMessage && (
          <div className="banner error" role="alert">
            {formMessage}
            {emailTaken && (
              <>
                {" "}
                <Link className="linkish" to={SIGN_IN_PATH} state={location.state}>
                  Sign in
                </Link>
              </>
            )}
          </div>
        )}

        <TextField
          label="Name"
          autoComplete="name"
          value={name}
          onChange={setName}
          error={errors.name}
          autoFocus
        />

        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="username"
          value={email}
          onChange={setEmail}
          error={errors.email}
        />

        <PasswordField
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          showStrength
          minLength={MIN_PASSWORD}
        />

        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          error={errors.confirm}
        />

        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </button>

        <p className="auth-hint">
          A <code>.edu</code> address is marked as a verified student account.
        </p>
      </form>

      <p className="auth-links">
        Already have an account?{" "}
        <Link className="linkish" to={SIGN_IN_PATH} state={location.state}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
