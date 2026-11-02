/**
 * TM09-148: ProtectedRoute sends signed-out people to the sign-in screen and
 * puts them back where they were afterwards — without bouncing a signed-in
 * person out while their session is still being restored.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_PATH, SIGN_IN_PATH, guardDecision, returnTo } from "../src/auth/guard.ts";

const SOMEONE = { id: "usr_1", email: "demo@syr.edu" };

describe("guardDecision", () => {
  it("waits while the session is still being restored", () => {
    // The refresh case: a token is in localStorage and /auth/me has not replied
    // yet. Redirecting here would sign people out on every page refresh.
    assert.deepEqual(guardDecision({ loading: true, user: null }, "/saved"), { kind: "wait" });
  });

  it("still waits even if a user is already in hand", () => {
    assert.deepEqual(guardDecision({ loading: true, user: SOMEONE }, "/saved"), { kind: "wait" });
  });

  it("allows a signed-in person through", () => {
    assert.deepEqual(guardDecision({ loading: false, user: SOMEONE }, "/saved"), {
      kind: "allow",
    });
  });

  it("redirects a signed-out person and remembers where they were", () => {
    assert.deepEqual(guardDecision({ loading: false, user: null }, "/saved"), {
      kind: "redirect",
      to: SIGN_IN_PATH,
      from: "/saved",
    });
  });
});

describe("returnTo", () => {
  it("returns to the page that triggered the redirect", () => {
    assert.equal(returnTo("/saved"), "/saved");
  });

  it("keeps the query string and hash of the original page", () => {
    assert.equal(returnTo("/listings?maxPrice=900#top"), "/listings?maxPrice=900#top");
  });

  it("falls back home when there is nothing to go back to", () => {
    assert.equal(returnTo(undefined), HOME_PATH);
    assert.equal(returnTo(null), HOME_PATH);
    assert.equal(returnTo(""), HOME_PATH);
  });

  it("ignores a non-string, which is what bad router state looks like", () => {
    assert.equal(returnTo({ to: "/saved" }), HOME_PATH);
    assert.equal(returnTo(42), HOME_PATH);
  });

  for (const hostile of [
    "https://example.com",
    "//example.com",
    "http://example.com/x",
    `/${String.fromCharCode(92)}example.com`,
    "javascript:alert(1)",
  ]) {
    it(`refuses to redirect off-site via ${JSON.stringify(hostile)}`, () => {
      assert.equal(returnTo(hostile), HOME_PATH);
    });
  }

  it("does not bounce back to an auth screen, which would loop", () => {
    assert.equal(returnTo("/signin"), HOME_PATH);
    assert.equal(returnTo("/register"), HOME_PATH);
  });
});
