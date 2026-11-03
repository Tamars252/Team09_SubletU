/**
 * TM09-148: client-side form validation.
 *
 * Every rule here mirrors one the API enforces in server/src/routes/auth.ts, so
 * the browser rejects exactly what the server would reject and nothing more.
 * This is a courtesy to the person typing, never a security boundary — the
 * server validates again regardless.
 */

/** register: `requireString(body, "password", { min: 8, max: 200 })` */
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;
/** register: `requireString(body, "name", { min: 2, max: 80 })` */
export const MIN_NAME = 2;
export const MAX_NAME = 80;
/** both: `requireString(body, "email", { min: 5, max: 254 })` */
export const MIN_EMAIL = 5;
export const MAX_EMAIL = 254;

/** The server's EMAIL_RE, copied verbatim so the two agree on what an address is. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type LoginField = "email" | "password";
export type RegisterField = "name" | "email" | "password" | "confirm";
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type LoginFields = { email: string; password: string };
export type RegisterFields = {
  name: string;
  email: string;
  password: string;
  confirm: string;
};

export function validateEmail(raw: string): string | undefined {
  const email = raw.trim();
  if (!email) return "Enter your email address.";
  if (email.length < MIN_EMAIL || email.length > MAX_EMAIL) {
    return `Email must be between ${MIN_EMAIL} and ${MAX_EMAIL} characters.`;
  }
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
  return undefined;
}

export function validateNewPassword(value: string): string | undefined {
  if (!value) return "Choose a password.";
  if (value.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (value.length > MAX_PASSWORD) return `Password must be at most ${MAX_PASSWORD} characters.`;
  return undefined;
}

export function validateName(raw: string): string | undefined {
  const name = raw.trim();
  if (!name) return "Enter your name.";
  if (name.length < MIN_NAME) return `Name must be at least ${MIN_NAME} characters.`;
  if (name.length > MAX_NAME) return `Name must be at most ${MAX_NAME} characters.`;
  return undefined;
}

/**
 * Sign-in checks that a password was typed but not how long it is. The login
 * endpoint accepts `min: 1` on purpose, and an account created before the
 * 8-character rule must still be able to get in — telling such a person their
 * own working password is "too short" would be a lie they cannot act on.
 */
export function validateLogin(fields: LoginFields): FieldErrors<LoginField> {
  const errors: FieldErrors<LoginField> = {};
  const email = validateEmail(fields.email);
  if (email) errors.email = email;
  if (!fields.password) errors.password = "Enter your password.";
  return errors;
}

export function validateRegister(fields: RegisterFields): FieldErrors<RegisterField> {
  const errors: FieldErrors<RegisterField> = {};
  const name = validateName(fields.name);
  if (name) errors.name = name;
  const email = validateEmail(fields.email);
  if (email) errors.email = email;
  const password = validateNewPassword(fields.password);
  if (password) errors.password = password;

  // Only worth mentioning once the password itself is acceptable, otherwise a
  // single typo lights up two fields and reads as two separate problems.
  if (!password) {
    if (!fields.confirm) errors.confirm = "Re-enter your password.";
    else if (fields.confirm !== fields.password) errors.confirm = "Passwords do not match.";
  }
  return errors;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some((v) => v !== undefined);
}
