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

  /**
   * Reloads this object's fields from the data store. Returns false when the
   * row is gone.
   *
   * Part of the class-diagram contract. The call sites reach for the static
   * retrieveById / retrieveForListing instead, because they need to build an
   * object they do not have yet; this is the instance-level refresh.
   */
  abstract retrieveData(): boolean;
}

/**
 * Thrown when a Data object is stored without passing validateData(). The
 * error middleware in index.ts turns it into the documented 422 response.
 */
export class ValidationError extends Error {
  problems: string[];

  constructor(problems: string[]) {
    super(problems.join("; "));
    this.name = "ValidationError";
    this.problems = problems;
  }
}
