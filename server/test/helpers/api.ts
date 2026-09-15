/**
 * A tiny HTTP client bound to a real listening instance of the app.
 *
 * The app is started on port 0 so the OS picks a free port — several test
 * files run in parallel and must not fight over one. Requests go over real
 * TCP through the real middleware stack, so CORS, the JSON body parser, the
 * auth middleware and the error mapper are all exercised, not stubbed.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/app.ts";
import { db, nowIso } from "../../src/db.ts";

export type Response<T> = {
  status: number;
  body: T;
};

export class TestApi {
  private server: Server;
  readonly origin: string;
  /** Bearer token sent with every request unless overridden per call. */
  token: string | null = null;

  private constructor(server: Server) {
    this.server = server;
    const { port } = server.address() as AddressInfo;
    this.origin = `http://127.0.0.1:${port}`;
  }

  static async start(): Promise<TestApi> {
    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    return new TestApi(server);
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options: { body?: unknown; token?: string | null } = {},
  ): Promise<Response<T>> {
    const token = options.token === undefined ? this.token : options.token;
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${this.origin}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    // Every API route answers JSON; anything else is a failure worth seeing raw.
    const text = await res.text();
    let body: T;
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = text as T;
    }
    return { status: res.status, body };
  }

  get<T = unknown>(path: string, token?: string | null) {
    return this.request<T>("GET", path, { token });
  }
  post<T = unknown>(path: string, body?: unknown, token?: string | null) {
    return this.request<T>("POST", path, { body, token });
  }
  patch<T = unknown>(path: string, body?: unknown, token?: string | null) {
    return this.request<T>("PATCH", path, { body, token });
  }
  delete<T = unknown>(path: string, token?: string | null) {
    return this.request<T>("DELETE", path, { token });
  }

  /** Registers a fresh user and returns their token, without changing `this.token`. */
  async registerUser(overrides: Record<string, unknown> = {}): Promise<{
    token: string;
    user: { id: string; email: string; name: string; verified: boolean };
  }> {
    const unique = Math.random().toString(36).slice(2, 10);
    const res = await this.post<{
      token: string;
      user: { id: string; email: string; name: string; verified: boolean };
    }>("/api/auth/register", {
      email: `test-${unique}@syr.edu`,
      password: "sublet123",
      name: "Test Student",
      ...overrides,
    });
    if (res.status !== 201) {
      throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }
}

/**
 * Pre-fill the geocode cache so posting a listing never reaches the network.
 * `geocodeAddress` checks the cache before it throttles or fetches, so a seeded
 * row makes the call synchronous, deterministic, and offline — and gives the
 * listing real coordinates, which the distance sort needs.
 */
export function seedGeocode(
  address: string,
  city: string,
  state: string,
  lat: number,
  lng: number,
): void {
  const key = `fwd:${address}, ${city}, ${state}`.toLowerCase();
  db.prepare(
    `INSERT INTO geocache (query, lat, lng, display_name, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(query) DO UPDATE SET lat = excluded.lat, lng = excluded.lng`,
  ).run(key, lat, lng, `${address}, ${city}, ${state}`, nowIso());
}

/** Seeds the addresses used by `listingPayload()`. */
export function seedDefaultGeocodes(): void {
  seedGeocode("123 Euclid Ave", "Syracuse", "NY", 43.0402, -76.1372);
  seedGeocode("500 Westcott St", "Syracuse", "NY", 43.0455, -76.1226);
  seedGeocode("700 S Crouse Ave", "Syracuse", "NY", 43.0421, -76.1373);
}

/** A valid listing body for POST /api/listings. */
export function listingPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Sunny room near campus",
    address: "123 Euclid Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    description: "A bright bedroom two blocks from campus, available for the spring semester.",
    monthlyRent: 950,
    availableFrom: "2026-01-01",
    availableTo: "2026-08-01",
    utilitiesIncluded: true,
    deposit: 500,
    bedrooms: 2,
    bathrooms: 1,
    maxRoommates: 1,
    petsAllowed: false,
    furnished: true,
    privateBath: false,
    amenities: ["Wifi"],
    ...overrides,
  };
}
