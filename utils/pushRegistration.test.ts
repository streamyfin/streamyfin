import { describe, expect, test } from "bun:test";
import { pushRegistrationKey } from "./pushRegistration";

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
