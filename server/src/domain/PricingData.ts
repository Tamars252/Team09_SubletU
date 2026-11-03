import { chunkIds, db, placeholders } from "../db.ts";
import { Data } from "./Data.ts";

type PricingRow = {
  listing_id: string;
  monthly_rent: number;
  available_from: string;
  available_to: string;
  utilities_included: number;
  deposit: number;
};

const PRICING_COLUMNS = `SELECT listing_id, monthly_rent, available_from, available_to,
          utilities_included, deposit
   FROM pricing`;

const selectForListing = db.prepare(`${PRICING_COLUMNS} WHERE listing_id = ?`);

export type PricingFields = {
  listingId: string;
  monthlyRent: number;
  availableFrom: string;
  availableTo: string;
  utilitiesIncluded: boolean;
  deposit: number;
};

/**
 * PricingData  (generalizes Data)
 *   - monthlyRent : double
 *   - availableFrom : String
 *   - availableTo : String
 *   - utilitiesIncluded : boolean
 */
export class PricingData extends Data {
  listingId: string;
  monthlyRent: number;
  availableFrom: string;
  availableTo: string;
  utilitiesIncluded: boolean;
  deposit: number;

  constructor(fields: PricingFields) {
    super();
    this.listingId = fields.listingId;
    this.monthlyRent = fields.monthlyRent;
    this.availableFrom = fields.availableFrom;
    this.availableTo = fields.availableTo;
    this.utilitiesIncluded = fields.utilitiesIncluded;
    this.deposit = fields.deposit;
  }

  validateData(): string[] {
    const problems: string[] = [];
    if (!Number.isFinite(this.monthlyRent) || this.monthlyRent <= 0) {
      problems.push("Monthly rent must be greater than $0");
    }
    if (this.monthlyRent > 20_000) {
      problems.push("Monthly rent looks unrealistic (over $20,000)");
    }
    const from = new Date(this.availableFrom);
    const to = new Date(this.availableTo);
    if (Number.isNaN(from.getTime())) problems.push("Available-from is not a valid date");
    if (Number.isNaN(to.getTime())) problems.push("Available-to is not a valid date");
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to <= from) {
      problems.push("Available-to must be after available-from");
    }
    if (this.deposit < 0) problems.push("Deposit cannot be negative");
    return problems;
  }

  storeData(): void {
    db.prepare(
      `INSERT INTO pricing (listing_id, monthly_rent, available_from, available_to,
                            utilities_included, deposit)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(listing_id) DO UPDATE SET
         monthly_rent = excluded.monthly_rent,
         available_from = excluded.available_from,
         available_to = excluded.available_to,
         utilities_included = excluded.utilities_included,
         deposit = excluded.deposit`,
    ).run(
      this.listingId,
      this.monthlyRent,
      this.availableFrom,
      this.availableTo,
      this.utilitiesIncluded ? 1 : 0,
      this.deposit,
    );
  }

  retrieveData(): boolean {
    const row = PricingData.retrieveForListing(this.listingId);
    if (!row) return false;
    this.monthlyRent = row.monthlyRent;
    this.availableFrom = row.availableFrom;
    this.availableTo = row.availableTo;
    this.utilitiesIncluded = row.utilitiesIncluded;
    this.deposit = row.deposit;
    return true;
  }

  private static fromRow(row: PricingRow): PricingData {
    return new PricingData({
      listingId: row.listing_id,
      monthlyRent: row.monthly_rent,
      availableFrom: row.available_from,
      availableTo: row.available_to,
      utilitiesIncluded: row.utilities_included === 1,
      deposit: row.deposit,
    });
  }

  static retrieveForListing(listingId: string): PricingData | null {
    const row = selectForListing.get(listingId) as PricingRow | undefined;
    return row ? PricingData.fromRow(row) : null;
  }

  /** One query for a whole page of listings, instead of one query each. */
  static retrieveForListings(listingIds: string[]): Map<string, PricingData> {
    const byListing = new Map<string, PricingData>();
    for (const chunk of chunkIds(listingIds)) {
      const sql = `${PRICING_COLUMNS} WHERE listing_id IN (${placeholders(chunk.length)})`;
      for (const row of db.prepare(sql).all(...chunk) as PricingRow[]) {
        byListing.set(row.listing_id, PricingData.fromRow(row));
      }
    }
    return byListing;
  }

  toJSON() {
    return {
      monthlyRent: this.monthlyRent,
      availableFrom: this.availableFrom,
      availableTo: this.availableTo,
      utilitiesIncluded: this.utilitiesIncluded,
      deposit: this.deposit,
    };
  }
}
