import { isBaseItemDto, isJellyfinItem, refetchUnlessItem } from "./jellyfin";

// What answers 200 in the server's place reaches these checks unchecked: a
// proxy's sign-in page is a string (Sentry REACT-NATIVE-NY).
const NOT_ITEMS: [string, unknown][] = [
  ["a page", "<!doctype html><html></html>"],
  ["an empty body", ""],
  ["a number", 0],
  ["null", null],
  ["nothing", undefined],
  ["a list", [{ Id: "series-1" }]],
  ["a boxed string", new String("<!doctype html>")],
];

describe("isBaseItemDto", () => {
  test("tells an item, with its image tags, from a person", () => {
    expect(
      isBaseItemDto({ Id: "a", ImageTags: {}, BackdropImageTags: [] }),
    ).toBe(true);
    expect(isBaseItemDto({ Id: "a", PrimaryImageTag: "tag" })).toBe(false);
  });

  test.each(NOT_ITEMS)("is false, without throwing, for %s", (_name, value) => {
    expect(isBaseItemDto(value)).toBe(false);
  });
});

describe("isJellyfinItem", () => {
  test("is true for an item as Jellyfin sends one", () => {
    expect(isJellyfinItem({ Id: "series-1", Type: "Series" })).toBe(true);
  });

  test.each([
    ...NOT_ITEMS,
    ["an object without an Id", { message: "Not found" }],
    ["an Id that is not text", { Id: 1 }],
  ])("is false for %s", (_name, value) => {
    expect(isJellyfinItem(value)).toBe(false);
  });
});

describe("refetchUnlessItem", () => {
  test("leaves a cached item to the usual staleTime", () => {
    expect(refetchUnlessItem({ state: { data: { Id: "series-1" } } })).toBe(
      true,
    );
  });

  // A page answered in the server's place and saved by an earlier version
  // would otherwise stay on screen, as no item, until it went stale.
  test.each(NOT_ITEMS)(
    "fetches again over %s, even while fresh",
    (_name, data) => {
      expect(refetchUnlessItem({ state: { data } })).toBe("always");
    },
  );
});
