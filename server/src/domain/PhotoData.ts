import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import { db, nowIso } from "../db.ts";
import { newId } from "../lib/crypto.ts";
import { Data } from "./Data.ts";

export type PhotoFields = {
  photoId: string;
  listingId: string;
  fileUrl: string;
  fileSize: number;
  uploadTimestamp: string;
  sortOrder: number;
};

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/**
 * PhotoData  (generalizes Data)
 *   - photoId : String
 *   - fileUrl : String
 *   - fileSize : int
 *   - uploadTimestamp : String
 *   + CompressPhoto()
 */
export class PhotoData extends Data {
  photoId: string;
  listingId: string;
  fileUrl: string;
  fileSize: number;
  uploadTimestamp: string;
  sortOrder: number;

  constructor(fields: PhotoFields) {
    super();
    this.photoId = fields.photoId;
    this.listingId = fields.listingId;
    this.fileUrl = fields.fileUrl;
    this.fileSize = fields.fileSize;
    this.uploadTimestamp = fields.uploadTimestamp;
    this.sortOrder = fields.sortOrder;
  }

  validateData(): string[] {
    const problems: string[] = [];
    if (!this.fileUrl) problems.push("Photo is missing a file URL");
    if (!/^(https?:\/\/|\/uploads\/)/.test(this.fileUrl)) {
      problems.push("Photo URL must be an http(s) URL or an uploaded file path");
    }
    if (this.fileSize < 0) problems.push("Photo file size cannot be negative");
    if (this.fileSize > config.maxPhotoBytes) {
      problems.push(
        `Photo is ${(this.fileSize / 1_048_576).toFixed(1)} MB; the limit is ` +
          `${(config.maxPhotoBytes / 1_048_576).toFixed(0)} MB`,
      );
    }
    return problems;
  }

  storeData(): void {
    db.prepare(
      `INSERT INTO photos (id, listing_id, file_url, file_size, sort_order, upload_timestamp)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         file_url = excluded.file_url,
         file_size = excluded.file_size,
         sort_order = excluded.sort_order`,
    ).run(
      this.photoId,
      this.listingId,
      this.fileUrl,
      this.fileSize,
      this.sortOrder,
      this.uploadTimestamp,
    );
  }

  retrieveData(): boolean {
    const row = db
      .prepare("SELECT file_url, file_size, sort_order, upload_timestamp FROM photos WHERE id = ?")
      .get(this.photoId) as
      | { file_url: string; file_size: number; sort_order: number; upload_timestamp: string }
      | undefined;
    if (!row) return false;
    this.fileUrl = row.file_url;
    this.fileSize = row.file_size;
    this.sortOrder = row.sort_order;
    this.uploadTimestamp = row.upload_timestamp;
    return true;
  }

  /**
   * CompressPhoto() from the diagram.
   *
   * The heavy pixel work happens in the browser (canvas downscale to a
   * 1600px long edge + JPEG re-encode) before upload, because that also saves
   * the user's bandwidth. Server-side this enforces the resulting budget and
   * is the single place that rejects an over-sized payload, so a client that
   * skips the downscale cannot bypass the limit.
   */
  static compressPhoto(bytes: Buffer): { bytes: Buffer; withinBudget: boolean } {
    return { bytes, withinBudget: bytes.byteLength <= config.maxPhotoBytes };
  }

  /**
   * Decodes a `data:` URL produced by the browser, writes it under UPLOAD_DIR
   * and returns an unsaved PhotoData pointing at it.
   */
  static fromDataUrl(listingId: string, dataUrl: string, sortOrder: number): PhotoData {
    const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) throw new Error("Photo must be a base64 data URL");
    const [, mime, base64] = match;
    const ext = ALLOWED_MIME[mime.toLowerCase()];
    if (!ext) throw new Error(`Unsupported image type "${mime}" — use JPEG, PNG or WebP`);

    const { bytes, withinBudget } = PhotoData.compressPhoto(Buffer.from(base64, "base64"));
    if (!withinBudget) {
      throw new Error(
        `Photo is ${(bytes.byteLength / 1_048_576).toFixed(1)} MB; the limit is ` +
          `${(config.maxPhotoBytes / 1_048_576).toFixed(0)} MB`,
      );
    }

    const photoId = newId("pho");
    const filename = `${photoId}${ext}`;
    const dir = path.join(config.uploadDir, listingId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), bytes);

    return new PhotoData({
      photoId,
      listingId,
      fileUrl: `/uploads/${listingId}/${filename}`,
      fileSize: bytes.byteLength,
      uploadTimestamp: nowIso(),
      sortOrder,
    });
  }

  /** Registers an already-hosted image (used by the seed data). */
  static fromRemoteUrl(listingId: string, url: string, sortOrder: number): PhotoData {
    return new PhotoData({
      photoId: newId("pho"),
      listingId,
      fileUrl: url,
      fileSize: 0,
      uploadTimestamp: nowIso(),
      sortOrder,
    });
  }

  static retrieveForListing(listingId: string): PhotoData[] {
    const rows = db
      .prepare(
        `SELECT id, listing_id, file_url, file_size, sort_order, upload_timestamp
         FROM photos WHERE listing_id = ? ORDER BY sort_order, upload_timestamp`,
      )
      .all(listingId) as Array<{
      id: string;
      listing_id: string;
      file_url: string;
      file_size: number;
      sort_order: number;
      upload_timestamp: string;
    }>;
    return rows.map(
      (row) =>
        new PhotoData({
          photoId: row.id,
          listingId: row.listing_id,
          fileUrl: row.file_url,
          fileSize: row.file_size,
          uploadTimestamp: row.upload_timestamp,
          sortOrder: row.sort_order,
        }),
    );
  }

  /** Deletes the row and, for locally-uploaded files, the file on disk. */
  static deleteById(photoId: string, listingId: string): boolean {
    const row = db
      .prepare("SELECT file_url FROM photos WHERE id = ? AND listing_id = ?")
      .get(photoId, listingId) as { file_url: string } | undefined;
    if (!row) return false;
    db.prepare("DELETE FROM photos WHERE id = ?").run(photoId);
    if (row.file_url.startsWith("/uploads/")) {
      const abs = path.join(config.uploadDir, row.file_url.replace("/uploads/", ""));
      // Guard against path traversal from a tampered DB value.
      if (abs.startsWith(config.uploadDir) && fs.existsSync(abs)) fs.unlinkSync(abs);
    }
    return true;
  }

  toJSON() {
    return {
      photoId: this.photoId,
      fileUrl: this.fileUrl,
      fileSize: this.fileSize,
      uploadTimestamp: this.uploadTimestamp,
      sortOrder: this.sortOrder,
    };
  }
}
