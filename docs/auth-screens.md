# Sign-in and registration screens

**Story:** TM09-148 · **Workspace:** `web/`

The two screens that get somebody a token, the session layer behind them, and the
route guard that keeps the rest of the app private. No server code changed.

## Screens

### `/signin` — `web/src/screens/SignIn.tsx`

Email and password, plus a link across to registration. Validates on submit, shows
per-field errors inline and API failures in a banner above the form.

### `/register` — `web/src/screens/Register.tsx`

Name, email, password and confirm-password. The password field carries a strength
meter; the meter is advice only, never a gate — the server decides what is acceptable.

Both screens share `AuthLayout` (`web/src/components/AuthLayout.tsx`), which draws the
wordmark and the Sign in / Create account tabs. The tabs are real `<Link>`s, so both
screens are reachable by URL and Back behaves.

`university` is not on the register form. The API defaults it to "Syracuse University"
when omitted, and `api.updateProfile` can change it later from a profile screen.

### Validation rules

Every rule mirrors one the API enforces in `server/src/routes/auth.ts`, so the browser
rejects exactly what the server would and nothing more.

| Field | Rule |
| --- | --- |
| Email | required · 5–254 chars · must match the server's `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` |
| Password (register) | required · **8**–200 characters |
| Password (sign-in) | required only — **no length check** |
| Name (register) | required · 2–80 characters, measured after trimming |
| Confirm (register) | required · must equal the password |

Two deliberate choices:

- **Sign-in does not enforce the 8-character minimum.** The login route accepts `min: 1`.
  An account created before that rule existed must still be able to get in; telling such
  a person their own working password is "too short" would be a lie they cannot act on.
- **Confirm stays quiet while the password itself is invalid**, so one typo reads as one
  problem rather than lighting up two fields.

Forms are `noValidate` so our messages show instead of the browser's, which cannot be
styled and disappear on the next keystroke.

## Components

### `PasswordField` — `web/src/components/PasswordField.tsx`

Adapted from the pre-rewrite front end, with the minimum corrected from 12 to the
server's 8. The show/hide control is a real `<button type="button">` carrying both
`aria-pressed` (current state) and `aria-label` ("Show password" / "Hide password"), so
it is reachable by Tab and operable with Enter or Space. Letting people look at what
they typed is better practice than forcing blind entry — typos are the main reason
sign-in fails.

`scorePassword()` is exported for reuse. It rewards length over punctuation, the way
NIST recommends, and caps obvious shapes (`aaaaaaaa`, `password1`) at "Too weak".

### `TextField` — `web/src/components/TextField.tsx`

A labelled input that keeps its error wired to the field with `aria-invalid` and
`aria-describedby`.

### `ProtectedRoute` — `web/src/components/ProtectedRoute.tsx`

A layout route. Screens underneath render through `<Outlet/>` and never think about the
session. The decision itself lives in `web/src/auth/guard.ts` so it can be tested
without a DOM.

## AuthContext API

`web/src/state/AuthContext.tsx`. Mounted in `main.tsx` inside `<BrowserRouter>`.

```ts
const { user, token, loading, login, register, logout, refresh } = useAuth();
```

| Member | Type | Notes |
| --- | --- | --- |
| `user` | `User \| null` | `null` until restored or signed in |
| `token` | `string \| null` | Mirrors the token the API client holds |
| `loading` | `boolean` | True until we know whether a stored token still identifies someone |
| `login` | `(email, password) => Promise<void>` | Throws `ApiError` on failure |
| `register` | `({ email, password, name, university? }) => Promise<void>` | `university` defaults to "Syracuse University" |
| `logout` | `() => void` | Clears token and user |
| `refresh` | `() => Promise<void>` | Re-reads `/auth/me` |

`useAuth()` throws if used outside `<AuthProvider>`.

### Persistence across refresh

The API client already persisted the token in `localStorage` under `subletu.token`. The
gap was restoring the *user* from it, so a refresh read as being signed out.

On mount the provider exchanges a stored token for the user through `GET /auth/me`. While
that is in flight `loading` is true and `ProtectedRoute` renders a spinner rather than
redirecting — redirecting during the restore is the single most common way this pattern
is got wrong, and it signs people out on every refresh.

If `/auth/me` fails, the token is dropped: one the server no longer accepts is worse than
none, because every later call would fail the same way.

### Clearing on 401

`client.ts` drops the token itself whenever *any* request comes back 401, which can
happen far from this provider. `onTokenChange` (added by this story) lets the provider
follow that, so `user` and `token` never drift out of step with storage. Without it the
UI kept showing a signed-in person until the next reload.

## Routes

`web/src/App.tsx`:

| Path | Screen | Access |
| --- | --- | --- |
| `/signin` | `SignIn` | public |
| `/register` | `Register` | public |
| `/` | `AppShell` (the existing listings/filter shell) | protected |
| `*` | redirects to `/` | goes through the guard |

Routing uses **react-router-dom**, the one runtime dependency this story adds.

### Returning to the original page

`ProtectedRoute` redirects with `<Navigate to="/signin" state={{ from }} replace/>`, where
`from` is the full path including query and hash. After a successful sign-in or
registration the screen calls `returnTo(state.from)` and navigates there with `replace`.

`returnTo()` discards anything that is not a plain internal path — `https://evil.com`,
`//evil.com`, a backslash — so the `from` marker cannot turn the sign-in form into an
open redirect. It also refuses `/signin` and `/register`, which would loop.

`replace` is used throughout so the guarded URL and the sign-in screen do not pile up in
history; Back from the app does not land on the sign-in form.

## Error-message mapping

`web/src/auth/errors.ts`, via `mapAuthError(err, mode)` → `{ formMessage?, fieldErrors }`.

| Status | Shown |
| --- | --- |
| `0` (network/API down) | "Can't reach the server. Check your connection and try again." |
| `401` | "Email or password is incorrect." |
| `409` | "That email is already registered. Try signing in instead." + a Sign in link, and an inline error on the email field |
| `400` / `422` | Per-field where the message names a field, otherwise form-level |
| `429` | "Too many attempts. Try again in N seconds/minutes." |
| `5xx` | "Something went wrong on our end. Try again." |
| not an `ApiError` | "Something went wrong. Try again." |

The 401 copy is identical for an unknown address and a wrong password, matching the
server, so the form cannot be used to discover who has an account (NFR-1.2).

### Field matching

The server reports field problems as prose — `"password" must be at least 8 characters`.
The leading quoted token names the field, so the message is shown against that input
instead of floating at the top of the form where it is easy to miss. The register route's
hand-written "Enter a valid email address" is matched too.

### Contract drift this code works around

`docs/api-contract.md` and the server disagree. **The code follows the server**, verified
with `curl` against a running instance:

| Case | Contract says | Server actually sends |
| --- | --- | --- |
| Register validation failure | `422` with `problems[]` | **`400`** with a bare `{ error }` — no `problems` |
| Bad sign-in | `"Invalid email or password"` | `"Email or password is incorrect"` |
| Rate limit | undocumented | `429` `{ error, details: { retryAfterSeconds } }` + `Retry-After` |

`mapAuthError` handles **both** the documented `problems[]` array and the single `error`
string, so it keeps working whichever side is corrected. Worth raising with the team as a
separate ticket.

To carry `retryAfterSeconds` through, `ApiError` gained a `details` field. The change is
additive — existing callers are unaffected.

## Mock mode

**There is none, and none is needed.** The brief allowed for a `VITE_MOCK_AUTH` provider
in case the auth endpoints were not merged. They are: `/api/auth/register`,
`/api/auth/login` and `/api/auth/me` are live on `main` and were exercised directly while
building this. Adding a mock would have meant maintaining a second set of response shapes
that could silently drift from the real ones.

## Design

Uses the existing tokens in `web/src/styles/theme.css` — terracotta `#d4603a` on cream
`#fbf8f4`, Fraunces for display, Inter for body — and the `.auth`, `.password-wrap`,
`.strength` and `.banner` classes the prototype already carried.

Three CSS additions:

- `--muted`, which the `.auth-screen` rules already referenced but **nothing ever
  defined** — those rules were silently inheriting their colour. A latent bug, fixed
  rather than worked around.
- `.field-error`, plus an `.input[aria-invalid="true"]` red border so an error does not
  rely on colour in the text alone.
- `.sr-only`, for the spinner's status text.

`.auth-switch`'s rules were extended from `button` to `a`, since the tabs are links.

Accessibility: every input has a real `<label for>`; errors use `role="alert"` and are
wired with `aria-describedby`; the active tab carries `aria-current="page"`; the restore
spinner is a `role="status"` live region; focus rings are explicit because the browser
default outline disappears against cream. Mobile-first — the shell is capped at 480px and
works at 375px.

## Testing

### Automated

`npm test --workspace web` — 57 tests, Node's built-in runner (`node --test`), no new
test dependencies.

| File | Covers |
| --- | --- |
| `web/test/authValidation.test.ts` | Every validation rule, including the boundaries (exactly 8, exactly 2) and that sign-in does not impose the minimum |
| `web/test/authGuard.test.ts` | Wait-vs-redirect-vs-allow, and `returnTo` against off-site and looping targets |
| `web/test/authErrors.test.ts` | Each status above, both error payload shapes, and non-`ApiError` input |

The tested logic lives in plain `.ts` modules with no JSX or DOM, because Node's runner
strips types but **cannot transform JSX** — a `.tsx` test simply will not run. The `.tsx`
components are kept thin wrappers around it. `errors.ts` deliberately duck-types
`ApiError` instead of importing it, since `client.ts` reads `localStorage` at module
scope and would crash under the test runner.

This is why there is no render test for `ProtectedRoute`: its decision is tested directly
as `guardDecision()`. A render test would need jsdom, testing-library and a second test
runner.

### Manual

```bash
npm install
npm run seed      # creates demo@syr.edu / sublet123
npm run dev       # API on :4000, web on :5173
```

Open the web URL the Vite banner prints (it moves to :5174 if :5173 is taken).

1. **Redirect** — visit `/` signed out. You land on `/signin`.
2. **Return to origin** — sign in as `demo@syr.edu` / `sublet123`. You land back on `/`,
   not on a default page. Back does not return to the sign-in form.
3. **Persistence** — refresh. You stay signed in, with no flash of the sign-in screen.
4. **Wrong password** — sign out, sign in with a bad password → "Email or password is
   incorrect." Try an address with no account: the identical message.
5. **Validation** — submit both forms empty; submit `notanemail`; on register use a
   7-character password, then mismatched confirmations. Each error appears under its own
   field.
6. **Duplicate email** — register `demo@syr.edu` → "That email is already registered,"
   with a working Sign in link.
7. **Show/hide** — Tab to the toggle and press Enter or Space. The text reveals and the
   button's accessible name flips.
8. **Network failure** — stop the API (leave Vite running) and submit → "Can't reach the
   server."
9. **Rate limit** — 11 failed sign-ins for one address → "Too many attempts. Try again in
   15 minutes."
10. **Keyboard and size** — Tab through both screens; every control is reachable with a
    visible focus ring. Check at 375px.
