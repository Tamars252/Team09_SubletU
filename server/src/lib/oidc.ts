/**
 * Microsoft Entra ID (Azure AD) sign-in — OpenID Connect authorization code
 * flow with PKCE, implemented against node:crypto so the project keeps its
 * "standard library only" shape.
 *
 * What the flow guarantees, and why each piece is here:
 *
 *   state         a random value round-tripped through Microsoft and checked
 *                 on return, so a callback cannot be forged (CSRF).
 *   PKCE          the code is only redeemable by whoever holds the verifier,
 *                 so an intercepted code is useless on its own.
 *   nonce         bound into the ID token, so a token minted for a different
 *                 sign-in cannot be replayed into this one.
 *   signature     the ID token is verified against Microsoft's published JWKS.
 *                 Everything else is a claim the token makes about itself; the
 *                 signature is what makes those claims trustworthy.
 *
 * A token that fails any check is discarded. Nothing about the user is read
 * out of it before it has been verified.
 */
import crypto from "node:crypto";
import { config } from "../config.ts";
import { db, nowIso } from "../db.ts";
import { newId } from "./crypto.ts";

const STATE_TTL_MINUTES = 10;

export type SsoIdentity = {
  subject: string;
  tenantId: string;
  email: string;
  name: string;
};

/* ------------------------------------------------------------- endpoints */

function authority(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(config.msTenantId)}`;
}

export function redirectUri(): string {
  return config.msRedirectUri || `${config.appUrl}/api/auth/sso/callback`;
}

/* ------------------------------------------------------------ PKCE + state */

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Creates and stores the per-attempt secrets, returning the URL to send the browser to. */
export function beginSignIn(): { url: string; state: string } {
  const state = base64url(crypto.randomBytes(24));
  const nonce = base64url(crypto.randomBytes(24));
  const codeVerifier = base64url(crypto.randomBytes(48));
  const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());

  const now = Date.now();
  db.prepare(
    `INSERT INTO oauth_states (state, code_verifier, nonce, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    state,
    codeVerifier,
    nonce,
    new Date(now).toISOString(),
    new Date(now + STATE_TTL_MINUTES * 60_000).toISOString(),
  );

  const params = new URLSearchParams({
    client_id: config.msClientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  // Sends the user straight to the university's sign-in page rather than the
  // generic account chooser. It is a convenience, not a security control —
  // the callback still enforces the domain.
  if (config.ssoAllowedDomains.length === 1) {
    params.set("domain_hint", config.ssoAllowedDomains[0]);
  }

  return { url: `${authority()}/oauth2/v2.0/authorize?${params.toString()}`, state };
}

type StateRow = { state: string; code_verifier: string; nonce: string; expires_at: string };

/** Reads a state row and deletes it, so a callback can only be used once. */
export function consumeState(state: string): StateRow | null {
  const row = db.prepare("SELECT * FROM oauth_states WHERE state = ?").get(state) as
    | StateRow
    | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

/* -------------------------------------------------------------------- JWKS */

type Jwk = { kid: string; kty: string; n: string; e: string; use?: string };
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getSigningKey(kid: string): Promise<crypto.KeyObject | null> {
  const fresh = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (!fresh) {
    const res = await fetch(`${authority()}/discovery/v2.0/keys`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Could not load Microsoft signing keys (${res.status})`);
    const body = (await res.json()) as { keys: Jwk[] };
    jwksCache = { keys: body.keys ?? [], fetchedAt: Date.now() };
  }

  let jwk = jwksCache?.keys.find((k) => k.kid === kid);
  // An unknown kid usually means Microsoft rotated keys inside the cache
  // window. Refetch once before rejecting the token.
  if (!jwk && jwksCache && Date.now() - jwksCache.fetchedAt > 60_000) {
    jwksCache = null;
    return getSigningKey(kid);
  }
  if (!jwk) return null;

  return crypto.createPublicKey({
    key: { kty: jwk.kty, n: jwk.n, e: jwk.e } as crypto.JsonWebKey,
    format: "jwk",
  });
}

/* --------------------------------------------------------- token exchange */

type TokenResponse = { id_token?: string; error?: string; error_description?: string };

async function exchangeCode(code: string, codeVerifier: string): Promise<string> {
  const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.msClientId,
      client_secret: config.msClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: codeVerifier,
      scope: "openid profile email",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await res.json()) as TokenResponse;
  if (!res.ok || !body.id_token) {
    throw new Error(body.error_description || body.error || "Microsoft rejected the sign-in");
  }
  return body.id_token;
}

/* ------------------------------------------------------ ID token validation */

type IdTokenClaims = {
  iss?: string;
  aud?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  nonce?: string;
  tid?: string;
  oid?: string;
  sub?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  name?: string;
};

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

/** Verifies signature, then every claim that matters, then returns the identity. */
export async function verifyIdToken(idToken: string, expectedNonce: string): Promise<SsoIdentity> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeSegment<{ alg: string; kid: string }>(headerB64);
  // Pinning the algorithm is what stops "alg: none" and HMAC-confusion attacks,
  // where a token asks to be verified with a key the attacker controls.
  if (header.alg !== "RS256") throw new Error(`Unexpected token algorithm ${header.alg}`);

  const key = await getSigningKey(header.kid);
  if (!key) throw new Error("ID token was signed with an unknown key");

  const verified = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(signatureB64, "base64url"),
  );
  if (!verified) throw new Error("ID token signature is not valid");

  const claims = decodeSegment<IdTokenClaims>(payloadB64);
  const now = Math.floor(Date.now() / 1000);
  const SKEW = 120; // tolerate modest clock drift between us and Microsoft

  if (claims.aud !== config.msClientId) throw new Error("ID token was issued for another app");
  if (typeof claims.exp !== "number" || claims.exp + SKEW < now) throw new Error("ID token expired");
  if (typeof claims.nbf === "number" && claims.nbf - SKEW > now) throw new Error("ID token not yet valid");
  if (claims.nonce !== expectedNonce) throw new Error("ID token nonce does not match");

  if (!claims.iss || !/^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/.test(claims.iss)) {
    throw new Error("ID token has an unexpected issuer");
  }
  // With tenant "organizations" the issuer carries the caller's real tenant, so
  // check it matches the tid claim rather than a fixed string.
  if (claims.tid && !claims.iss.includes(claims.tid)) {
    throw new Error("ID token issuer and tenant disagree");
  }
  if (config.msTenantId !== "organizations" && config.msTenantId !== "common") {
    if (claims.tid !== config.msTenantId) throw new Error("ID token came from another directory");
  }

  const email = (claims.email || claims.preferred_username || claims.upn || "").toLowerCase();
  const subject = claims.oid || claims.sub;
  if (!email) throw new Error("Microsoft did not return an email address");
  if (!subject) throw new Error("Microsoft did not return a stable user id");

  assertAllowedDomain(email);

  return {
    subject,
    tenantId: claims.tid ?? "",
    email,
    name: claims.name || email.split("@")[0],
  };
}

export function assertAllowedDomain(email: string): void {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const allowed = config.ssoAllowedDomains.some(
    (d) => domain === d || domain.endsWith(`.${d}`),
  );
  if (!allowed) {
    throw new Error(
      `SubletU is only open to ${config.ssoAllowedDomains.join(", ")} accounts — ${email} is not one`,
    );
  }
}

/** Runs the code exchange and validation together. */
export async function completeSignIn(code: string, row: StateRow): Promise<SsoIdentity> {
  const idToken = await exchangeCode(code, row.code_verifier);
  return verifyIdToken(idToken, row.nonce);
}

/* ------------------------------------------------------------- handoff code */

/**
 * The session token is never placed in a redirect URL. Instead the callback
 * redirects with a single-use code, valid for two minutes, which the SPA
 * exchanges over POST for the real token.
 */
export function issueHandoff(userId: string): string {
  const code = `hof_${crypto.randomBytes(32).toString("base64url")}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO sso_handoffs (code_hash, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(
    sha256(code),
    userId,
    new Date(now).toISOString(),
    new Date(now + 2 * 60_000).toISOString(),
  );
  return code;
}

export function redeemHandoff(code: string): string | null {
  const hash = sha256(code);
  const row = db.prepare("SELECT * FROM sso_handoffs WHERE code_hash = ?").get(hash) as
    | { user_id: string; expires_at: string; used_at: string | null }
    | undefined;
  if (!row) return null;

  db.prepare("DELETE FROM sso_handoffs WHERE code_hash = ?").run(hash);
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.user_id;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/* ----------------------------------------------------------------- dev mode */

/**
 * Stands in for Microsoft when there is no app registration to point at, so
 * the rest of the flow — state, handoff, account linking, domain rules — can
 * be built and demonstrated. Refused in production by config.ts.
 */
export function devIdentity(email: string, name?: string): SsoIdentity {
  const address = email.toLowerCase().trim();
  assertAllowedDomain(address);
  return {
    subject: `dev-${sha256(address).slice(0, 24)}`,
    tenantId: "dev-tenant",
    email: address,
    name: name?.trim() || address.split("@")[0].replace(/[._]/g, " "),
  };
}

export { newId, nowIso };
