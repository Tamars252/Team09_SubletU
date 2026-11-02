/**
 * TM09-148: turns an API failure into something worth reading.
 *
 * Deliberately duck-typed rather than importing `ApiError` from the client:
 * client.ts reads `localStorage` at module scope, which does not exist under
 * `node --test`. A structural check keeps this module testable as plain logic,
 * and a real `ApiError` satisfies it.
 */

export type ApiErrorLike = {
  status: number;
  message: string;
  problems?: string[];
  details?: Record<string, unknown>;
};

export type AuthMode = "signin" | "register";

export type MappedError = {
  /** Shown in the banner above the form. */
  formMessage?: string;
  /** Keyed by form field name. */
  fieldErrors: Record<string, string>;
};

function isApiErrorLike(err: unknown): err is ApiErrorLike {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as ApiErrorLike).status === "number" &&
    typeof (err as ApiErrorLike).message === "string"
  );
}

/**
 * The server reports field problems as prose — `"password" must be at least 8
 * characters`. The leading quoted token is the field it is talking about, so a
 * message that names one can be shown against that input instead of floating
 * at the top of the form where it is easy to miss.
 */
const FIELDS = new Set(["email", "password", "name", "university", "bio"]);

export function fieldFromMessage(message: string): string | undefined {
  const quoted = /^"(\w+)"/.exec(message);
  if (quoted && FIELDS.has(quoted[1])) return quoted[1];
  // The one validation message the register route writes by hand.
  if (/valid email address/i.test(message)) return "email";
  return undefined;
}

function retryAfterSeconds(err: ApiErrorLike): number | undefined {
  const raw = err.details?.retryAfterSeconds;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function describeWait(seconds: number | undefined): string {
  if (seconds === undefined) return "Too many attempts. Try again shortly.";
  if (seconds < 90) return `Too many attempts. Try again in ${Math.ceil(seconds)} seconds.`;
  return `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minutes.`;
}

export function mapAuthError(err: unknown, mode: AuthMode): MappedError {
  if (!isApiErrorLike(err)) {
    return { formMessage: "Something went wrong. Try again.", fieldErrors: {} };
  }

  const fieldErrors: Record<string, string> = {};

  switch (err.status) {
    // The client turns a fetch that never got a reply into status 0.
    case 0:
      return {
        formMessage: "Can't reach the server. Check your connection and try again.",
        fieldErrors,
      };

    case 401:
      // Identical for an unknown address and a wrong password, matching the
      // server, so the form cannot be used to discover who has an account.
      return { formMessage: "Email or password is incorrect.", fieldErrors };

    case 409:
      return {
        formMessage: "That email is already registered. Try signing in instead.",
        fieldErrors: { email: "This email is already registered." },
      };

    case 400:
    case 422: {
      // `problems` is the contract's documented shape; the auth routes in
      // practice send a single `error` string instead. Handle both.
      const messages = err.problems?.length ? err.problems : [err.message];
      const leftovers: string[] = [];
      for (const message of messages) {
        const field = fieldFromMessage(message);
        if (field && !fieldErrors[field]) fieldErrors[field] = message;
        else leftovers.push(message);
      }
      return {
        formMessage: leftovers.length
          ? leftovers.join(" ")
          : Object.keys(fieldErrors).length
            ? undefined
            : "Check the form and try again.",
        fieldErrors,
      };
    }

    case 429:
      return { formMessage: describeWait(retryAfterSeconds(err)), fieldErrors };

    default:
      if (err.status >= 500) {
        return { formMessage: "Something went wrong on our end. Try again.", fieldErrors };
      }
      return {
        formMessage: err.message || (mode === "signin" ? "Could not sign in." : "Could not create your account."),
        fieldErrors,
      };
  }
}
