import { inRegistrationOrder, pushRegistrationKey } from "./pushRegistration";

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

describe("what the device can show, in the key", () => {
  // A build that starts showing channels or buttons registers again, or the plugin would
  // keep sending it messages without them.
  test("changes the key when it changes", () => {
    const before = pushRegistrationKey(
      "https://jf",
      "u",
      "t",
      "en",
      undefined,
      {
        channels: 0,
        categories: 0,
      },
    );
    const after = pushRegistrationKey("https://jf", "u", "t", "en", undefined, {
      channels: 1,
      categories: 1,
    });

    expect(before).not.toBe(after);
  });
});

// A post still in flight could land after the sign out's delete and bring the row
// of a signed out device back, so every write waits for the one before it.
describe("the writes of this device's registration", () => {
  test("run one after the other, in the order they were asked for", async () => {
    const order: string[] = [];
    let land = () => {};
    const post = inRegistrationOrder(
      () =>
        new Promise<void>((resolve) => {
          land = () => {
            order.push("post");
            resolve();
          };
        }),
    );
    const remove = inRegistrationOrder(async () => {
      order.push("delete");
    });

    await Promise.resolve();
    expect(order).toEqual([]);

    land();
    await Promise.all([post, remove]);
    expect(order).toEqual(["post", "delete"]);
  });

  test("go on after one that fails, which still fails for its caller", async () => {
    const failed = inRegistrationOrder(() =>
      Promise.reject(new Error("refused")),
    );
    const next = inRegistrationOrder(async () => "deleted");

    await expect(failed).rejects.toThrow("refused");
    await expect(next).resolves.toBe("deleted");
  });
});
