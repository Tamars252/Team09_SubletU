# Microsoft (Syracuse) sign-in — what to request and how to configure it

The OIDC flow is fully implemented. What it needs is an **app registration**,
which only Syracuse ITS can issue for the `syr.edu` directory. Until then the
server runs a local stand-in so the rest of the flow works.

## The part you cannot do yourself

Signing in `@syr.edu` accounts means authenticating against Syracuse's
Microsoft Entra ID tenant. An app has to be registered **inside that tenant**,
and registering your own tenant and pointing it at `syr.edu` will not work:
most universities disable user consent for unapproved third-party apps, so
sign-in stops at an admin-approval wall.

### What to ask ITS for

> I'm building a student project (CIS 454 capstone) that signs users in with
> their Syracuse accounts. Could you register an OIDC application in the
> university tenant with:
>
> - **Platform:** Web
> - **Redirect URI:** `https://<where-it-is-deployed>/api/auth/sso/callback`
>   (plus `http://localhost:4000/api/auth/sso/callback` for development)
> - **Permissions:** `openid`, `profile`, `email` — delegated, sign-in only.
>   No Graph access, no directory reads, no application permissions.
> - **Tokens needed:** ID token only. The app reads `email`/`preferred_username`,
>   `oid` and `name`, and stores nothing else from Microsoft.
>
> I'd need the **Application (client) ID**, the **Directory (tenant) ID**, and a
> **client secret**.

Asking for the narrowest possible scopes matters — a request for `User.Read.All`
or anything Graph-shaped is far more likely to be refused.

### If ITS says no

**The app already works without them.** Email verification is built and enabled
by default: registration is restricted to `syr.edu`, and the account stays
locked out of posting and messaging until a six-digit code sent to that address
is entered. See "Email verification" below.

Two further options if you still want the Microsoft button working:

1. **Your own Entra tenant, multi-tenant app.** Free with any Microsoft
   account. Register the app as "Accounts in any organizational directory",
   leave `SSO_ALLOWED_DOMAINS=syr.edu`, and set `MS_TENANT_ID=organizations`.
   Syracuse users can sign in **only if** SU has not blocked user consent — test
   early, because this is exactly what usually fails.
2. **Keep the stand-in for the demo** and present the real flow as implemented
   and awaiting credentials. The code path is identical downstream of the
   identity, which is a defensible position to present.

## Email verification — the fallback that needs nobody's permission

Registration is closed to anything outside `SSO_ALLOWED_DOMAINS`, and a new
password account is **not** verified by having typed a `syr.edu` address. A
six-digit code goes to that address, and until it is entered the account
cannot post a listing, start a conversation, send a message, or file a report.
Browsing, swiping and saving stay open, so someone can look around while they
wait.

**Be precise about what this proves.** It proves control of the mailbox right
now. It does not prove current enrolment — Syracuse keeps alumni addresses
alive for a period, so a recent graduate would pass. Only SSO reflects whether
the directory still considers someone active. For a sublet marketplace that is
a reasonable trade: the problem worth solving is anyone with a personal address
claiming to be a student, and this solves that.

How it is kept safe:

- **Six digits is a million possibilities, so the attempt limit is the real
  control** — not the hash. Five wrong guesses destroys the code, and the right
  code stops working too; a new one has to be sent.
- Codes expire in **15 minutes**, are single-use, and are stored only as a
  SHA-256 hash salted with the account id, so a digest lifted from one row
  cannot be matched against another.
- Resending is capped at one per **60 seconds** and five per hour, so the
  endpoint cannot be turned into a way to flood someone's inbox.
- Requesting a new code invalidates the previous one.

Delivery needs `RESEND_API_KEY`. Note the free-tier limitation: until you
verify a sending domain, Resend only delivers to the address that owns the
account — fine for developing, not for real users. Verify a domain, or use
another provider, before anyone outside your team signs up.

## Configuring it

Once you have the three values, in `server/.env`:

```bash
SSO_DEV_MODE=false
MS_TENANT_ID=<Directory (tenant) ID>
MS_CLIENT_ID=<Application (client) ID>
MS_CLIENT_SECRET=<the secret value, not its ID>
MS_REDIRECT_URI=https://<your-host>/api/auth/sso/callback
APP_URL=https://<your-host>
SSO_ALLOWED_DOMAINS=syr.edu
```

`MS_REDIRECT_URI` must match what is registered in Azure **exactly** —
scheme, host, port and path. A mismatch is the single most common cause of
`AADSTS50011`.

Pin `MS_TENANT_ID` to Syracuse's GUID rather than leaving it as
`organizations`. With a real tenant id, a token from any other directory is
rejected at the issuer check; with `organizations`, the only thing standing
between you and another university's users is `SSO_ALLOWED_DOMAINS`.

Client secrets expire — Azure's default is 6 or 24 months. Note the expiry
somewhere you'll see it, because sign-in stops working the day it lapses.

## What the flow does

```
Browser ──▶ GET /api/auth/sso/start
              stores state + PKCE verifier + nonce, redirects to Microsoft
        ──▶ login.microsoftonline.com  (user authenticates, MFA, etc.)
        ──▶ GET /api/auth/sso/callback?code&state
              state consumed (single use)
              code exchanged for an ID token, using the PKCE verifier
              ID token verified: RS256 signature against Microsoft's JWKS,
                                 issuer, audience, expiry, nonce, tenant
              email checked against SSO_ALLOWED_DOMAINS
              account created or linked, marked verified
        ──▶ redirect to /auth/callback?code=<handoff>
Browser ──▶ POST /api/auth/sso/exchange   → session token
```

Two details worth knowing for the write-up:

- **The session token is never put in a redirect URL.** A URL ends up in browser
  history, server logs and `Referer` headers. The callback hands over a
  single-use code valid for two minutes, which the app trades for the real
  token over POST.
- **The signature check is the load-bearing one.** Every other claim — who this
  is, which tenant, which app — is something the token asserts about itself.
  Only the JWKS signature makes those assertions trustworthy, which is why the
  algorithm is pinned to RS256 rather than read from the token's own header.

## Accounts, passwords and verification

- Signing in through Microsoft **is** the verification. Those accounts are
  marked `verified` and start with no password.
- Registering with email and password does **not** verify anything — typing a
  `syr.edu` address only proves you can type. Those accounts stay unverified
  until their owner signs in through Microsoft once, at which point the two are
  linked by email rather than duplicated.
- An SSO account can add a password later via Profile → it needs no current
  password, because being signed in through Microsoft is the proof.

## Password rules

Following NIST SP 800-63B rather than the older composition-rule advice:

- **12 characters minimum**, 128 maximum. Length is the only size rule.
- **No required symbols or digits.** Those rules reliably produce `Password1!`,
  which is on every cracking list.
- **A blocklist instead**, checked against both the raw password and its letters
  alone — so `password1234` and `Password1!` are caught, while a genuine
  passphrase that happens to contain a common word is not.
- **Your own name and email are rejected** as password material.
- **scrypt** at N=2^16, r=8, p=1 (64 MiB), with the parameters stored in the
  hash so the cost can be raised later without locking anyone out. Old hashes
  are upgraded silently on next sign-in.
- **Throttling** at 8 failures per account and 30 per source address in any 15
  minutes, so one account cannot be sprayed and one host cannot work through
  many accounts.

## Password resets

- `POST /api/auth/forgot` always answers the same, whether or not the address
  exists. Anything else turns it into a way to discover who has an account.
- Tokens are random, stored **only as a SHA-256 hash**, single-use, and expire
  in 45 minutes. A database leak cannot be replayed into account takeover.
- Requesting a new link invalidates any earlier one.
- Completing a reset **bumps the account's token version**, which invalidates
  every session issued before it. Without that, someone who had stolen a session
  would keep it through the reset meant to lock them out.

Resets need email. Set `RESEND_API_KEY` (resend.com has a free tier). With no
key the link is printed to the server log, which is fine locally — and the
server refuses to start in production without one, so a real deployment cannot
quietly swallow a reset.

## Running the stand-in

```bash
SSO_DEV_MODE=true npm run dev
```

"Continue with Syracuse University" goes to `/auth/dev-sso`, which asks for an
address and issues the same handoff code a real callback would. It enforces the
domain rule and nothing else — it proves nothing about identity, is labelled as
a stand-in on screen, and the server **refuses to start** with it enabled and
`NODE_ENV=production`.
