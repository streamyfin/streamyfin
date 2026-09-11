import { describe, expect, test } from "bun:test";
import { pushRegistrationKey, pushRegistrationStep } from "./pushRegistration";

describe("pushRegistrationKey", () => {
  test("is null while any of the three parts is missing", () => {
    expect(pushRegistrationKey(undefined, "u", "t")).toBeNull();
    expect(pushRegistrationKey("https://jf", undefined, "t")).toBeNull();
    expect(pushRegistrationKey("https://jf", "u", undefined)).toBeNull();
    expect(pushRegistrationKey("", "u", "t")).toBeNull();
  });

  test("is the same for the same server, user and token", () => {
    expect(pushRegistrationKey("https://jf", "u", "t")).toBe(
      pushRegistrationKey("https://jf", "u", "t"),
    );
  });

  test("changes when the server, the user or the token changes", () => {
    const base = pushRegistrationKey("https://jf", "u", "t");

    expect(pushRegistrationKey("https://other", "u", "t")).not.toBe(base);
    expect(pushRegistrationKey("https://jf", "v", "t")).not.toBe(base);
    expect(pushRegistrationKey("https://jf", "u", "s")).not.toBe(base);
  });
});

describe("pushRegistrationStep", () => {
  test("posts the first time, and not again for the same server, user and token", () => {
    const first = pushRegistrationStep(null, "https://jf", "u", "t");
    expect(first.post).toBe(true);

    const again = pushRegistrationStep(first.key, "https://jf", "u", "t");
    expect(again.post).toBe(false);
    expect(again.key).toBe(first.key);
  });

  test("posts again after a different user, server or token", () => {
    const { key } = pushRegistrationStep(null, "https://jf", "u", "t");

    expect(pushRegistrationStep(key, "https://jf", "v", "t").post).toBe(true);
    expect(pushRegistrationStep(key, "https://other", "u", "t").post).toBe(
      true,
    );
    expect(pushRegistrationStep(key, "https://jf", "u", "s").post).toBe(true);
  });

  // Sign out deletes the device on the server and clears the session, so the same
  // sign in afterwards has to post again.
  test("forgets the key when the session ends, so the same sign in posts again", () => {
    const { key } = pushRegistrationStep(null, "https://jf", "u", "t");

    const signedOut = pushRegistrationStep(key, undefined, undefined, "t");
    expect(signedOut.key).toBeNull();
    expect(signedOut.post).toBe(false);

    expect(
      pushRegistrationStep(signedOut.key, "https://jf", "u", "t").post,
    ).toBe(true);
  });
});
