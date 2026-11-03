/**
 * TM09-148: each failure the auth endpoints can return becomes a message that
 * tells the reader what to do next. Statuses and payload shapes here are taken
 * from server/src/routes/auth.ts and the error middleware in
 * server/src/index.ts, not from docs/api-contract.md, which has drifted.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldFromMessage, mapAuthError } from "../src/auth/errors.ts";

const err = (
  status: number,
  message: string,
  extra: { problems?: string[]; details?: Record<string, unknown> } = {},
) => ({ status, message, ...extra });

describe("mapAuthError", () => {
  it("explains an unreachable server rather than blaming the form", () => {
    // client.ts turns a fetch that never got a reply into status 0.
    const { formMessage, fieldErrors } = mapAuthError(err(0, "Couldn't reach it"), "signin");
    assert.equal(formMessage, "Can't reach the server. Check your connection and try again.");
    assert.deepEqual(fieldErrors, {});
  });

  it("gives one generic message for a bad sign-in", () => {
    // Must not reveal whether the address has an account (NFR-1.2).
    const { formMessage, fieldErrors } = mapAuthError(
      err(401, "Email or password is incorrect"),
      "signin",
    );
    assert.equal(formMessage, "Email or password is incorrect.");
    assert.deepEqual(fieldErrors, {});
  });

  it("points a 409 at the email field and offers a way forward", () => {
    const { formMessage, fieldErrors } = mapAuthError(
      err(409, "An account with that email already exists"),
      "register",
    );
    assert.match(String(formMessage), /already registered/);
    assert.match(String(formMessage), /signing in/);
    assert.equal(fieldErrors.email, "This email is already registered.");
  });

  it("attaches a 400 that names a field to that field", () => {
    // What the server actually sends today.
    const { formMessage, fieldErrors } = mapAuthError(
      err(400, '"password" must be at least 8 characters'),
      "register",
    );
    assert.deepEqual(fieldErrors, { password: '"password" must be at least 8 characters' });
    assert.equal(formMessage, undefined);
  });

  it("attaches the register route's hand-written email message too", () => {
    const { fieldErrors } = mapAuthError(err(400, "Enter a valid email address"), "register");
    assert.equal(fieldErrors.email, "Enter a valid email address");
  });

  it("splits a documented 422 problems array across its fields", () => {
    // The shape docs/api-contract.md promises. No auth route emits it today,
    // but the contract says it can, so the form handles it.
    const { fieldErrors } = mapAuthError(
      err(422, "Validation failed", {
        problems: ['"email" is required', '"name" must be at least 2 characters'],
      }),
      "register",
    );
    assert.deepEqual(fieldErrors, {
      email: '"email" is required',
      name: '"name" must be at least 2 characters',
    });
  });

  it("keeps a validation message that names no field at the form level", () => {
    const { formMessage, fieldErrors } = mapAuthError(
      err(400, "Request body is not valid JSON"),
      "register",
    );
    assert.equal(formMessage, "Request body is not valid JSON");
    assert.deepEqual(fieldErrors, {});
  });

  it("turns a rate limit into a wait people can act on", () => {
    assert.equal(
      mapAuthError(err(429, "Too many attempts", { details: { retryAfterSeconds: 45 } }), "signin")
        .formMessage,
      "Too many attempts. Try again in 45 seconds.",
    );
    assert.equal(
      mapAuthError(err(429, "Too many attempts", { details: { retryAfterSeconds: 900 } }), "signin")
        .formMessage,
      "Too many attempts. Try again in 15 minutes.",
    );
  });

  it("still handles a rate limit with no detail attached", () => {
    assert.equal(
      mapAuthError(err(429, "Too many attempts"), "signin").formMessage,
      "Too many attempts. Try again shortly.",
    );
  });

  it("does not blame the reader for a server fault", () => {
    assert.equal(
      mapAuthError(err(500, "Something went wrong on our end"), "register").formMessage,
      "Something went wrong on our end. Try again.",
    );
  });

  it("copes with something that is not an API error at all", () => {
    assert.equal(mapAuthError(new TypeError("boom"), "signin").formMessage, "Something went wrong. Try again.");
    assert.equal(mapAuthError(null, "signin").formMessage, "Something went wrong. Try again.");
  });
});

describe("fieldFromMessage", () => {
  it("reads the quoted field name the server leads with", () => {
    assert.equal(fieldFromMessage('"email" is required'), "email");
    assert.equal(fieldFromMessage('"name" must be at least 2 characters'), "name");
  });

  it("ignores a quoted word that is not a field we show", () => {
    assert.equal(fieldFromMessage('"listingId" is required'), undefined);
  });

  it("returns nothing for prose that names no field", () => {
    assert.equal(fieldFromMessage("Something went wrong on our end"), undefined);
  });
});
