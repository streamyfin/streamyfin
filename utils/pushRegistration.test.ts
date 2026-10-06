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

describe("the language in the key", () => {
  test("changing the app's language changes the key", () => {
    const english = pushRegistrationKey("https://jf", "u", "t", "en");

    expect(pushRegistrationKey("https://jf", "u", "t", "fr")).not.toBe(english);
    expect(pushRegistrationKey("https://jf", "u", "t", "en")).toBe(english);
  });

  test("no language is a key of its own, not a missing session", () => {
    const key = pushRegistrationKey("https://jf", "u", "t", undefined);

    expect(key).not.toBeNull();
    expect(key).not.toBe(pushRegistrationKey("https://jf", "u", "t", "fr"));
  });
});

describe("the poster's address in the key", () => {
  // A server behind custom headers is sent no address, and setting the headers
  // up after the first registration has to reach the plugin.
  test("leaving the address out changes the key", () => {
    expect(
      pushRegistrationKey("https://jf", "u", "t", "en", undefined),
    ).not.toBe(pushRegistrationKey("https://jf", "u", "t", "en", "https://jf"));
  });
});
