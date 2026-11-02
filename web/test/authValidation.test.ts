/**
 * TM09-148: the sign-in and register forms reject exactly what the API rejects
 * (server/src/routes/auth.ts), so nobody is bounced by a rule the server does
 * not actually have — or waved through into an error they could have been told
 * about while typing.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_PASSWORD,
  hasErrors,
  validateEmail,
  validateLogin,
  validateName,
  validateNewPassword,
  validateRegister,
} from "../src/auth/validation.ts";

describe("validateEmail", () => {
  it("accepts an ordinary campus address", () => {
    assert.equal(validateEmail("student@syr.edu"), undefined);
  });

  it("trims before judging, so a pasted address with spaces is fine", () => {
    assert.equal(validateEmail("  student@syr.edu  "), undefined);
  });

  it("asks for an address when the field is empty", () => {
    assert.equal(validateEmail(""), "Enter your email address.");
    assert.equal(validateEmail("   "), "Enter your email address.");
  });

  for (const bad of ["student", "student@", "@syr.edu", "student@syr", "a b@syr.edu"]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      assert.equal(validateEmail(bad), "Enter a valid email address.");
    });
  }

  it("rejects an address longer than the API's 254 characters", () => {
    const long = `${"a".repeat(250)}@syr.edu`;
    assert.match(String(validateEmail(long)), /between 5 and 254/);
  });
});

describe("validateNewPassword", () => {
  it(`accepts exactly ${MIN_PASSWORD} characters, the server's minimum`, () => {
    assert.equal(validateNewPassword("a".repeat(MIN_PASSWORD)), undefined);
  });

  it(`rejects ${MIN_PASSWORD - 1} characters`, () => {
    assert.equal(
      validateNewPassword("a".repeat(MIN_PASSWORD - 1)),
      `Password must be at least ${MIN_PASSWORD} characters.`,
    );
  });

  it("asks for a password when the field is empty", () => {
    assert.equal(validateNewPassword(""), "Choose a password.");
  });

  it("rejects more than the API's 200 characters", () => {
    assert.match(String(validateNewPassword("a".repeat(201))), /at most 200/);
  });
});

describe("validateName", () => {
  it("accepts a two-character name, the server's minimum", () => {
    assert.equal(validateName("Jo"), undefined);
  });

  it("rejects a single character", () => {
    assert.equal(validateName("J"), "Name must be at least 2 characters.");
  });

  it("counts the trimmed name, so spaces cannot pad it to length", () => {
    assert.equal(validateName(" J "), "Name must be at least 2 characters.");
  });
});

describe("validateLogin", () => {
  it("passes a complete form", () => {
    const errors = validateLogin({ email: "demo@syr.edu", password: "sublet123" });
    assert.deepEqual(errors, {});
    assert.equal(hasErrors(errors), false);
  });

  it("flags both fields when the form is empty", () => {
    const errors = validateLogin({ email: "", password: "" });
    assert.deepEqual(errors, {
      email: "Enter your email address.",
      password: "Enter your password.",
    });
    assert.equal(hasErrors(errors), true);
  });

  it("does not impose the 8-character minimum on sign-in", () => {
    // The login route accepts `min: 1`. An account made before the rule existed
    // must still be able to sign in, so the form must not invent a block here.
    const errors = validateLogin({ email: "demo@syr.edu", password: "short" });
    assert.deepEqual(errors, {});
  });
});

describe("validateRegister", () => {
  const good = {
    name: "Maya O.",
    email: "maya@syr.edu",
    password: "sublet1234",
    confirm: "sublet1234",
  };

  it("passes a complete form", () => {
    assert.deepEqual(validateRegister(good), {});
  });

  it("flags a mismatched confirmation", () => {
    const errors = validateRegister({ ...good, confirm: "sublet12345" });
    assert.deepEqual(errors, { confirm: "Passwords do not match." });
  });

  it("flags an empty confirmation", () => {
    const errors = validateRegister({ ...good, confirm: "" });
    assert.deepEqual(errors, { confirm: "Re-enter your password." });
  });

  it("stays quiet about the confirmation while the password itself is invalid", () => {
    // One typo should read as one problem, not two.
    const errors = validateRegister({ ...good, password: "short", confirm: "" });
    assert.deepEqual(errors, {
      password: `Password must be at least ${MIN_PASSWORD} characters.`,
    });
  });

  it("reports every independent problem at once", () => {
    const errors = validateRegister({ name: "", email: "nope", password: "", confirm: "" });
    assert.deepEqual(Object.keys(errors).sort(), ["email", "name", "password"]);
  });
});
