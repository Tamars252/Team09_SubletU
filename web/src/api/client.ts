import type {
  AuthConfig,
  Conversation,
  Filters,
  Listing,
  Message,
  Reference,
  Settings,
  User,
} from "./types.ts";
import { filtersToQuery } from "./types.ts";

const TOKEN_KEY = "subletu.token";

export class ApiError extends Error {
  status: number;
  problems: string[];

  constructor(status: number, message: string, problems: string[] = []) {
    super(message);
    this.status = status;
    this.problems = problems;
  }
}

let token: string | null = localStorage.getItem(TOKEN_KEY);

export function setToken(next: string | null): void {
  token = next;
  if (next) localStorage.setItem(TOKEN_KEY, next);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return token;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const data = (payload ?? {}) as { error?: string; problems?: string[] };
    // An expired or revoked token should drop us back to the sign-in screen.
    if (res.status === 401 && token) setToken(null);
    throw new ApiError(
      res.status,
      data.error ?? `Request failed (${res.status})`,
      data.problems ?? [],
    );
  }

  return payload as T;
}

/* ------------------------------------------------------------------- auth */

export const api = {
  register(body: { email: string; password: string; name: string; university: string }) {
    return request<{ token: string; user: User }>("/auth/register", { method: "POST", body });
  },

  login(body: { email: string; password: string }) {
    return request<{ token: string; user: User }>("/auth/login", { method: "POST", body });
  },

  me() {
    return request<{ user: User }>("/auth/me");
  },

  updateProfile(body: { name?: string; bio?: string; university?: string }) {
    return request<{ user: User }>("/auth/me", { method: "PATCH", body });
  },

  /** An SSO-only account has no current password, so it may be omitted. */
  changePassword(body: { currentPassword?: string; newPassword: string }) {
    return request<{ token: string; user: User }>("/auth/password", { method: "POST", body });
  },

  /* -------------------------------------------------------- sso and resets */

  authConfig() {
    return request<AuthConfig>("/auth/config");
  },

  /** Trades the one-time code from /auth/callback for a session. */
  ssoExchange(code: string) {
    return request<{ token: string; user: User }>("/auth/sso/exchange", {
      method: "POST",
      body: { code },
    });
  },

  /** Dev-mode stand-in for Microsoft; refused unless the server enables it. */
  ssoDevComplete(body: { email: string; name?: string }) {
    return request<{ code: string }>("/auth/sso/dev-complete", { method: "POST", body });
  },

  /** (Re)sends the six-digit code to the signed-in account's address. */
  sendVerificationCode() {
    return request<{
      ok: boolean;
      email?: string;
      expiresInMinutes?: number;
      cooldownSeconds?: number;
      alreadyVerified?: boolean;
    }>("/auth/verify/send", { method: "POST", body: {} });
  },

  verifyEmail(code: string) {
    return request<{ token: string; user: User }>("/auth/verify", {
      method: "POST",
      body: { code },
    });
  },

  forgotPassword(email: string) {
    return request<{ ok: boolean; message: string }>("/auth/forgot", {
      method: "POST",
      body: { email },
    });
  },

  checkResetToken(token: string) {
    return request<{ valid: boolean; passwordMinLength: number }>(
      `/auth/reset/check?token=${encodeURIComponent(token)}`,
    );
  },

  resetPassword(body: { token: string; password: string }) {
    return request<{ token: string; user: User }>("/auth/reset", { method: "POST", body });
  },

  /* --------------------------------------------------------------- listings */

  listings(filters: Filters, extra: Record<string, string> = {}) {
    const params = filtersToQuery(filters);
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    return request<{ total: number; results: Listing[] }>(`/listings?${params}`);
  },

  deck(filters: Filters, limit = 25) {
    const params = filtersToQuery(filters);
    params.set("limit", String(limit));
    return request<{ remaining: number; results: Listing[] }>(`/listings/deck?${params}`);
  },

  listing(id: string) {
    return request<{ listing: Listing }>(`/listings/${id}`);
  },

  myListings() {
    return request<{ results: Listing[] }>("/listings/mine");
  },

  createListing(body: Record<string, unknown>) {
    return request<{ message: string; listing: Listing }>("/listings", { method: "POST", body });
  },

  updateListing(id: string, body: Record<string, unknown>) {
    return request<{ message: string; listing: Listing }>(`/listings/${id}`, {
      method: "PATCH",
      body,
    });
  },

  deleteListing(id: string) {
    return request<{ message: string }>(`/listings/${id}`, { method: "DELETE" });
  },

  /* ----------------------------------------------------------------- swipes */

  swipe(listingId: string, direction: "left" | "right") {
    return request<{ ok: boolean; saved: boolean; remaining: number }>("/swipes", {
      method: "POST",
      body: { listingId, direction },
    });
  },

  undoSwipe() {
    return request<{ ok: boolean; listing: Listing | null; message?: string }>("/swipes/undo", {
      method: "POST",
    });
  },

  resetSwipes(keepSaved = true) {
    return request<{ ok: boolean }>(`/swipes?keepSaved=${keepSaved}`, { method: "DELETE" });
  },

  swipeStats() {
    return request<{ likes: number; passes: number; total: number; remaining: number }>(
      "/swipes/stats",
    );
  },

  /* ------------------------------------------------------------------ saved */

  saved() {
    return request<{ results: Listing[] }>("/saved");
  },

  save(listingId: string) {
    return request<{ ok: boolean }>("/saved", { method: "POST", body: { listingId } });
  },

  unsave(listingId: string) {
    return request<{ ok: boolean }>(`/saved/${listingId}`, { method: "DELETE" });
  },

  /* --------------------------------------------------------------- messages */

  conversations(archived = false) {
    return request<{ results: Conversation[] }>(`/messages/conversations?archived=${archived}`);
  },

  startConversation(listingId: string, message: string) {
    return request<{ conversationId: string }>("/messages/conversations", {
      method: "POST",
      body: { listingId, message },
    });
  },

  messages(conversationId: string) {
    return request<{
      conversation: { id: string; listingId: string; role: string; listing: Listing | null };
      results: Message[];
    }>(`/messages/conversations/${conversationId}/messages`);
  },

  sendMessage(conversationId: string, body: string) {
    return request<{ message: Message }>(`/messages/conversations/${conversationId}/messages`, {
      method: "POST",
      body: { body },
    });
  },

  archiveConversation(conversationId: string, archived: boolean) {
    return request<{ ok: boolean; archived: boolean }>(
      `/messages/conversations/${conversationId}/archive`,
      { method: "POST", body: { archived } },
    );
  },

  unreadCount() {
    return request<{ unread: number }>("/messages/unread-count");
  },

  /* ---------------------------------------------------------------- reports */

  report(body: { listingId: string; reason: string; details: string }) {
    return request<{ ok: boolean; message: string }>("/reports", { method: "POST", body });
  },

  /* --------------------------------------------------------------- settings */

  settings() {
    return request<{ settings: Settings }>("/settings");
  },

  saveSettings(body: Partial<Settings>) {
    return request<{ settings: Settings }>("/settings", { method: "PUT", body });
  },

  /* -------------------------------------------------------------------- geo */

  geoSearch(q: string) {
    return request<{
      results: Array<{ lat: number; lng: number; displayName: string; name: string }>;
    }>(`/geo/search?q=${encodeURIComponent(q)}`);
  },

  campuses() {
    return request<{ campuses: Array<{ name: string; lat: number; lng: number }> }>(
      "/geo/campuses",
    );
  },

  reference() {
    return request<Reference>("/reference");
  },
};
