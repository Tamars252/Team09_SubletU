import { ValidationError } from "./Data.ts";

/**
 * Reads the fields a toJSON() payload is supposed to carry.
 *
 * Shared by PricingData, RoomDetails and PhotoData so their fromJSON() methods
 * report a malformed payload the same way. Problems are collected rather than
 * thrown one at a time: a caller fixing a payload wants the whole list, which
 * is also what validateData() gives them.
 *
 * This is NOT validateData(). It answers "does this JSON say what it claims to
 * say", not "may this be stored". A row written before a rule tightened must
 * still deserialize; whether it is still valid is a separate question with a
 * separate method.
 */
export class JsonFields {
  private readonly what: string;
  private readonly fields: Record<string, unknown>;
  private readonly problems: string[] = [];

  constructor(what: string, json: unknown) {
    // Nothing to collect problems about if there is no object to read, so this
    // one case throws immediately instead of waiting for done().
    if (typeof json !== "object" || json === null || Array.isArray(json)) {
      throw new ValidationError([`${what} JSON must be an object`]);
    }
    this.what = what;
    this.fields = json as Record<string, unknown>;
  }

  number(key: string): number {
    return this.read(key, "number", 0);
  }

  string(key: string): string {
    return this.read(key, "string", "");
  }

  boolean(key: string): boolean {
    return this.read(key, "boolean", false);
  }

  /**
   * A missing or wrongly typed field is recorded and answered with `fallback`,
   * so the remaining fields are still read and reported on. The fallback never
   * escapes: done() throws before any caller gets to use the values.
   */
  private read<T>(key: string, type: "number" | "string" | "boolean", fallback: T): T {
    const value = this.fields[key];
    // JSON.stringify turns both undefined and NaN into null, so an absent
    // field and an unrepresentable one arrive looking identical.
    if (value === undefined || value === null) {
      this.problems.push(`${this.what} JSON is missing "${key}"`);
      return fallback;
    }
    if (typeof value !== type || (type === "number" && !Number.isFinite(value))) {
      this.problems.push(`${this.what} JSON field "${key}" must be a ${type}`);
      return fallback;
    }
    return value as T;
  }

  /** Throws every problem found so far at once, or returns having found none. */
  done(): void {
    if (this.problems.length > 0) throw new ValidationError(this.problems);
  }
}
