import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import { chunkIds, db, nowIso, placeholders } from "../db.ts";
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

type PhotoRow = {
  id: string;
  listing_id: string;
  file_url: string;
  file_size: number;
  sort_order: number;
  upload_timestamp: string;
};

const PHOTO_COLUMNS = `SELECT id, listing_id, file_url, file_size, sort_order, upload_timestamp
   FROM photos`;

const selectForListing = db.prepare(
  `${PHOTO_COLUMNS} WHERE listing_id = ? ORDER BY sort_order, upload_timestamp`,
);

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/**
 * Why a photo was turned away. The HTTP layer maps these to status codes
 * (413 / 415 / 400); the domain layer stays free of any HTTP import.
 */
export type PhotoRejection = "malformed" | "unsupported_type" | "too_large";

export class PhotoFormatError extends Error {
  reason: PhotoRejection;

  constructor(reason: PhotoRejection, message: string) {
    super(message);
    this.reason = reason;
  }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Human-readable size, in whichever unit does not round to zero. */
function humanBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} bytes`;
}

/**
 * The one wording for "that photo is too big", shared by the decoder and by
 * the body-size guard in the error middleware — a request rejected before it
 * reaches the route reads the same as one rejected inside it.
 */
export function photoTooLargeMessage(actualBytes?: number): string {
  const limit = `the limit is ${humanBytes(config.maxPhotoBytes)}`;
  return actualBytes === undefined
    ? `Photo is too large; ${limit}`
    : `Photo is ${humanBytes(actualBytes)}; ${limit}`;
}

/**
 * For a body rejected by the JSON size limit, which guards every route — so
 * it must not claim a photo was involved. The limit is still derived from the
 * photo size, which is the number a caller needs in order to act.
 */
export function bodyTooLargeMessage(): string {
  return `Request body is too large; a photo may be at most ${humanBytes(config.maxPhotoBytes)}`;
}

/**
 * The MIME type the *bytes* say they are, or null if they are not an image we
 * accept. A `data:` URL's declared type is attacker-controlled, so it decides
 * nothing on its own — this is what stops an executable arriving as
 * `data:image/png;base64,…` and then being served back out of /uploads.
 */
export function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_MAGIC)) return "image/png";
  // JPEG: SOI marker, then any of the JFIF/Exif/raw variants.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP is a RIFF container: "RIFF" <4-byte length> "WEBP".
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

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
   * the user's bandwidth. Server-side this is the single place that rejects an
   * over-sized payload, so a client that skips the downscale cannot bypass the
   * limit.
   *
   * Decoding is deliberately separate from writing the file: a photo arrives
   * with a listing that may still fail validation, and a rejected listing must
   * not leave an orphaned image behind in UPLOAD_DIR.
   */
  static decodeDataUrl(dataUrl: string): { bytes: Buffer; ext: string } {
    const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) throw new PhotoFormatError("malformed", "Photo must be a base64 data URL");
    const [, mime, base64] = match;
    const declared = mime.toLowerCase();
    const ext = ALLOWED_MIME[declared];
    if (!ext) {
      throw new PhotoFormatError(
        "unsupported_type",
        `Unsupported image type "${mime}" — use JPEG, PNG or WebP`,
      );
    }

    const bytes = Buffer.from(base64, "base64");
    // Size before content: an over-sized payload is over-sized whatever it
    // turns out to be, and "too large" is the more useful thing to be told.
    if (bytes.byteLength > config.maxPhotoBytes) {
      throw new PhotoFormatError("too_large", photoTooLargeMessage(bytes.byteLength));
    }

    // The declared type got us this far; the bytes have to agree with it.
    const actual = sniffImageType(bytes);
    if (actual === null) {
      throw new PhotoFormatError(
        "unsupported_type",
        "Photo is not a JPEG, PNG or WebP image — the file contents do not match any of them",
      );
    }
    if (actual !== declared) {
      throw new PhotoFormatError(
        "unsupported_type",
        `Photo claims to be "${mime}" but its contents are ${actual}`,
      );
    }

    return { bytes, ext };
  }

  /**
   * Writes decoded bytes under UPLOAD_DIR and returns an unsaved PhotoData
   * pointing at them. Call only once the owning listing is known to be valid.
   */
  static persist(
    listingId: string,
    decoded: { bytes: Buffer; ext: string },
    sortOrder: number,
  ): PhotoData {
    const photoId = newId("pho");
    const filename = `${photoId}${decoded.ext}`;
    const dir = path.join(config.uploadDir, listingId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), decoded.bytes);

    return new PhotoData({
      photoId,
      listingId,
      fileUrl: `/uploads/${listingId}/${filename}`,
      fileSize: decoded.bytes.byteLength,
      uploadTimestamp: nowIso(),
      sortOrder,
    });
  }

  /** Decode and write in one step, for callers with nothing left to validate. */
  static fromDataUrl(listingId: string, dataUrl: string, sortOrder: number): PhotoData {
    return PhotoData.persist(listingId, PhotoData.decodeDataUrl(dataUrl), sortOrder);
  }

  /** Removes a file this class wrote, used to undo a half-finished save. */
  static discardFile(fileUrl: string): void {
    if (!fileUrl.startsWith("/uploads/")) return;
    const abs = path.join(config.uploadDir, fileUrl.slice("/uploads/".length));
    if (abs.startsWith(config.uploadDir + path.sep) && fs.existsSync(abs)) fs.unlinkSync(abs);
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

  private static fromRow(row: PhotoRow): PhotoData {
    return new PhotoData({
      photoId: row.id,
      listingId: row.listing_id,
      fileUrl: row.file_url,
      fileSize: row.file_size,
      uploadTimestamp: row.upload_timestamp,
      sortOrder: row.sort_order,
    });
  }

  static retrieveForListing(listingId: string): PhotoData[] {
    const rows = selectForListing.all(listingId) as PhotoRow[];
    return rows.map(PhotoData.fromRow);
  }

  /** One query for a whole page of listings, instead of one query each. */
  static retrieveForListings(listingIds: string[]): Map<string, PhotoData[]> {
    const grouped = new Map<string, PhotoData[]>();
    for (const chunk of chunkIds(listingIds)) {
      const sql =
        `${PHOTO_COLUMNS} WHERE listing_id IN (${placeholders(chunk.length)}) ` +
        "ORDER BY sort_order, upload_timestamp";
      for (const row of db.prepare(sql).all(...chunk) as PhotoRow[]) {
        const list = grouped.get(row.listing_id);
        if (list) list.push(PhotoData.fromRow(row));
        else grouped.set(row.listing_id, [PhotoData.fromRow(row)]);
      }
    }
    return grouped;
  }

  /** Deletes the row and, for locally-uploaded files, the file on disk. */
  static deleteById(photoId: string, listingId: string): boolean {
    const row = db
      .prepare("SELECT file_url FROM photos WHERE id = ? AND listing_id = ?")
      .get(photoId, listingId) as { file_url: string } | undefined;
    if (!row) return false;
    db.prepare("DELETE FROM photos WHERE id = ?").run(photoId);
    PhotoData.discardFile(row.file_url);
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
