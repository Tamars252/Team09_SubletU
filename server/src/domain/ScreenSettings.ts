import { db, nowIso } from "../db.ts";
import { decryptJson, encryptJson } from "../lib/crypto.ts";
import { Data } from "./Data.ts";

/** The private slice of a user's preferences, encrypted at rest. */
export type SettingsPayload = {
  university: string;
  searchRadiusMiles: number;
  priceCeiling: number | null;
  notifyNewMatches: boolean;
  notifyMessages: boolean;
  notifyPriceDrops: boolean;
  showOnlyVerifiedHosts: boolean;
};

const DEFAULT_PAYLOAD: SettingsPayload = {
  university: "Syracuse University",
  searchRadiusMiles: 5,
  priceCeiling: null,
  notifyNewMatches: true,
  notifyMessages: true,
  notifyPriceDrops: true,
  showOnlyVerifiedHosts: false,
};

/**
 * ScreenSettings  (generalizes Data)
 *   - font : String
 *   - color : String
 *   - width : Pixels
 *   - height : Pixels
 *   + ValidateData() + StoreData() + RetrieveData()
 *   + EncryptData() + DecryptData()
 */
export class ScreenSettings extends Data {
  userId: string;
  font: string;
  color: string;
  theme: string;
  width: number;
  height: number;
  payload: SettingsPayload;

  constructor(userId: string, partial: Partial<ScreenSettings> = {}) {
    super();
    this.userId = userId;
    this.font = partial.font ?? "Inter";
    this.color = partial.color ?? "#D4603A";
    this.theme = partial.theme ?? "light";
    this.width = partial.width ?? 430;
    this.height = partial.height ?? 932;
    this.payload = { ...DEFAULT_PAYLOAD, ...(partial.payload ?? {}) };
  }

  validateData(): string[] {
    const problems: string[] = [];
    if (!/^#[0-9A-Fa-f]{6}$/.test(this.color)) {
      problems.push("Accent color must be a 6-digit hex value like #D4603A");
    }
    if (!["light", "dark", "system"].includes(this.theme)) {
      problems.push('Theme must be "light", "dark" or "system"');
    }
    if (this.font.length > 64) problems.push("Font name is too long");
    if (this.width < 280 || this.width > 3840) problems.push("Width must be 280–3840 px");
    if (this.height < 480 || this.height > 2160) problems.push("Height must be 480–2160 px");
    if (this.payload.searchRadiusMiles <= 0 || this.payload.searchRadiusMiles > 100) {
      problems.push("Search radius must be between 0 and 100 miles");
    }
    if (this.payload.priceCeiling !== null && this.payload.priceCeiling <= 0) {
      problems.push("Price ceiling must be greater than $0");
    }
    return problems;
  }

  /** EncryptData() — AES-256-GCM over the preference payload. */
  encryptData(): string {
    return encryptJson(this.payload);
  }

  /** DecryptData() — returns defaults if the blob is missing or tampered with. */
  static decryptData(blob: string | null): SettingsPayload {
    return { ...DEFAULT_PAYLOAD, ...(decryptJson<SettingsPayload>(blob) ?? {}) };
  }

  storeData(): void {
    db.prepare(
      `INSERT INTO screen_settings (user_id, font, color, theme, width_px, height_px,
                                    payload_enc, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         font = excluded.font, color = excluded.color, theme = excluded.theme,
         width_px = excluded.width_px, height_px = excluded.height_px,
         payload_enc = excluded.payload_enc, updated_at = excluded.updated_at`,
    ).run(
      this.userId,
      this.font,
      this.color,
      this.theme,
      this.width,
      this.height,
      this.encryptData(),
      nowIso(),
    );
  }

  retrieveData(): boolean {
    const fresh = ScreenSettings.retrieveForUser(this.userId);
    Object.assign(this, fresh);
    return true;
  }

  static retrieveForUser(userId: string): ScreenSettings {
    const row = db
      .prepare(
        `SELECT font, color, theme, width_px, height_px, payload_enc
         FROM screen_settings WHERE user_id = ?`,
      )
      .get(userId) as
      | {
          font: string;
          color: string;
          theme: string;
          width_px: number;
          height_px: number;
          payload_enc: string | null;
        }
      | undefined;

    if (!row) return new ScreenSettings(userId);

    return new ScreenSettings(userId, {
      font: row.font,
      color: row.color,
      theme: row.theme,
      width: row.width_px,
      height: row.height_px,
      payload: ScreenSettings.decryptData(row.payload_enc),
    });
  }

  toJSON() {
    return {
      font: this.font,
      color: this.color,
      theme: this.theme,
      width: this.width,
      height: this.height,
      ...this.payload,
    };
  }
}
