import { isAlternateVersion } from "./mediaSourceVersion";

const versions = [{ Id: "primary" }, { Id: "alt" }];

describe("isAlternateVersion", () => {
  test("a grouped version other than the primary", () => {
    expect(isAlternateVersion("primary", versions, "alt")).toBe(true);
    expect(isAlternateVersion("primary", versions, "primary")).toBe(false);
  });

  test("plugin or channel streams that do not list the primary", () => {
    // Several sources, none of them the item itself: not versions, and their
    // IDs name no item.
    const streams = [{ Id: "stream-a" }, { Id: "stream-b" }];
    expect(isAlternateVersion("primary", streams, "stream-a")).toBe(false);
  });

  test("a single source whose ID is not the item's", () => {
    expect(isAlternateVersion("channel", [{ Id: "live" }], "live")).toBe(false);
  });
});
