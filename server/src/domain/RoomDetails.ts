import { chunkIds, db, placeholders } from "../db.ts";
import { Data } from "./Data.ts";

type RoomDetailsRow = {
  listing_id: string;
  bedrooms: number;
  bathrooms: number;
  max_roommates: number;
  pets_allowed: number;
  furnished: number;
  private_bath: number;
};

const ROOM_COLUMNS = `SELECT listing_id, bedrooms, bathrooms, max_roommates, pets_allowed,
          furnished, private_bath
   FROM room_details`;

const selectForListing = db.prepare(`${ROOM_COLUMNS} WHERE listing_id = ?`);

export type RoomDetailsFields = {
  listingId: string;
  bedrooms: number;
  bathrooms: number;
  maxRoommates: number;
  petsAllowed: boolean;
  furnished: boolean;
  privateBath: boolean;
};

/**
 * RoomDetails  (generalizes Data)
 *   - bedrooms : int
 *   - bathrooms : int
 *   - maxRoommates : int
 *   - petsAllowed : boolean
 */
export class RoomDetails extends Data {
  listingId: string;
  bedrooms: number;
  bathrooms: number;
  maxRoommates: number;
  petsAllowed: boolean;
  furnished: boolean;
  privateBath: boolean;

  constructor(fields: RoomDetailsFields) {
    super();
    this.listingId = fields.listingId;
    this.bedrooms = fields.bedrooms;
    this.bathrooms = fields.bathrooms;
    this.maxRoommates = fields.maxRoommates;
    this.petsAllowed = fields.petsAllowed;
    this.furnished = fields.furnished;
    this.privateBath = fields.privateBath;
  }

  validateData(): string[] {
    const problems: string[] = [];
    if (!Number.isInteger(this.bedrooms) || this.bedrooms < 0 || this.bedrooms > 12) {
      problems.push("Bedrooms must be a whole number between 0 and 12");
    }
    if (!Number.isFinite(this.bathrooms) || this.bathrooms < 0.5 || this.bathrooms > 12) {
      problems.push("Bathrooms must be between 0.5 and 12");
    }
    if (!Number.isInteger(this.maxRoommates) || this.maxRoommates < 0 || this.maxRoommates > 20) {
      problems.push("Max roommates must be a whole number between 0 and 20");
    }
    return problems;
  }

  storeData(): void {
    db.prepare(
      `INSERT INTO room_details (listing_id, bedrooms, bathrooms, max_roommates,
                                 pets_allowed, furnished, private_bath)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(listing_id) DO UPDATE SET
         bedrooms = excluded.bedrooms,
         bathrooms = excluded.bathrooms,
         max_roommates = excluded.max_roommates,
         pets_allowed = excluded.pets_allowed,
         furnished = excluded.furnished,
         private_bath = excluded.private_bath`,
    ).run(
      this.listingId,
      this.bedrooms,
      this.bathrooms,
      this.maxRoommates,
      this.petsAllowed ? 1 : 0,
      this.furnished ? 1 : 0,
      this.privateBath ? 1 : 0,
    );
  }

  retrieveData(): boolean {
    const row = RoomDetails.retrieveForListing(this.listingId);
    if (!row) return false;
    this.bedrooms = row.bedrooms;
    this.bathrooms = row.bathrooms;
    this.maxRoommates = row.maxRoommates;
    this.petsAllowed = row.petsAllowed;
    this.furnished = row.furnished;
    this.privateBath = row.privateBath;
    return true;
  }

  private static fromRow(row: RoomDetailsRow): RoomDetails {
    return new RoomDetails({
      listingId: row.listing_id,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      maxRoommates: row.max_roommates,
      petsAllowed: row.pets_allowed === 1,
      furnished: row.furnished === 1,
      privateBath: row.private_bath === 1,
    });
  }

  static retrieveForListing(listingId: string): RoomDetails | null {
    const row = selectForListing.get(listingId) as RoomDetailsRow | undefined;
    return row ? RoomDetails.fromRow(row) : null;
  }

  /** One query for a whole page of listings, instead of one query each. */
  static retrieveForListings(listingIds: string[]): Map<string, RoomDetails> {
    const byListing = new Map<string, RoomDetails>();
    for (const chunk of chunkIds(listingIds)) {
      const sql = `${ROOM_COLUMNS} WHERE listing_id IN (${placeholders(chunk.length)})`;
      for (const row of db.prepare(sql).all(...chunk) as RoomDetailsRow[]) {
        byListing.set(row.listing_id, RoomDetails.fromRow(row));
      }
    }
    return byListing;
  }

  toJSON() {
    return {
      bedrooms: this.bedrooms,
      bathrooms: this.bathrooms,
      maxRoommates: this.maxRoommates,
      petsAllowed: this.petsAllowed,
      furnished: this.furnished,
      privateBath: this.privateBath,
    };
  }
}
