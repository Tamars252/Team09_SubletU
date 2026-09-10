/**
 * Data — abstract superclass from the SubletU class diagram.
 *
 *   Data
 *   + ValidateData()
 *   + StoreData()
 *   + RetrieveData()
 *
 * Every persistent value object in the system (ListingData, PhotoData,
 * PricingData, RoomDetails, ScreenSettings) generalizes from Data and
 * therefore knows how to validate itself, write itself to the store, and
 * reload itself from the store.
 */
export abstract class Data {
  /** Returns a list of human-readable problems. Empty list means valid. */
  abstract validateData(): string[];

  /** Persists this object to the data store. */
  abstract storeData(): void;

  /** Reloads this object's fields from the data store. */
  abstract retrieveData(): boolean;

  /** Convenience wrapper used by the routes: validate, then throw or store. */
  validateAndStore(): void {
    const problems = this.validateData();
    if (problems.length > 0) {
      throw new ValidationError(problems);
    }
    this.storeData();
  }
}

export class ValidationError extends Error {
  problems: string[];

  constructor(problems: string[]) {
    super(problems.join("; "));
    this.name = "ValidationError";
    this.problems = problems;
  }
}
