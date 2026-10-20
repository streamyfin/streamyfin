import { describeValueShape, isJellyfinId } from "./itemId";

describe("isJellyfinId", () => {
  test("takes the 32 hex digits the server writes ids in", () => {
    expect(isJellyfinId("f137a2dd21bbc1b99aa5c0f6bf02a805")).toBe(true);
    expect(isJellyfinId("F137A2DD21BBC1B99AA5C0F6BF02A805")).toBe(true);
  });

  test("takes the same id written as a dashed GUID", () => {
    expect(isJellyfinId("f137a2dd-21bb-c1b9-9aa5-c0f6bf02a805")).toBe(true);
  });

  // Sentry REACT-NATIVE-EM and EN: the music notification opens the app with
  // trackplayer://notification.click, and the library route was handed its host.
  test("refuses the music notification's link", () => {
    expect(isJellyfinId("notification.click")).toBe(false);
  });

  // Sentry REACT-NATIVE-1M: a home section's parentId is whatever the admin
  // typed in the plugin, a library's name for instance.
  test("refuses what an admin could type instead of an id", () => {
    expect(isJellyfinId("Movies")).toBe(false);
    expect(isJellyfinId("Enter library id(s)")).toBe(false);
    expect(isJellyfinId("")).toBe(false);
  });

  test("refuses what a missing value turns into on the way to a url", () => {
    expect(isJellyfinId("undefined")).toBe(false);
    expect(isJellyfinId("null")).toBe(false);
  });

  test("refuses an id with a digit too many or too few", () => {
    expect(isJellyfinId("f137a2dd21bbc1b99aa5c0f6bf02a80")).toBe(false);
    expect(isJellyfinId("f137a2dd21bbc1b99aa5c0f6bf02a8055")).toBe(false);
  });

  test("refuses an id inside other text", () => {
    expect(isJellyfinId(" f137a2dd21bbc1b99aa5c0f6bf02a805")).toBe(false);
    expect(isJellyfinId("{f137a2dd-21bb-c1b9-9aa5-c0f6bf02a805}")).toBe(false);
    expect(isJellyfinId("f137a2dd21bbc1b99aa5c0f6bf02a805/Similar")).toBe(
      false,
    );
  });

  // A route param repeated in a url reaches the screen as an array, which the
  // SDK would send joined with a comma.
  test("refuses anything that is not a string", () => {
    expect(isJellyfinId(["f137a2dd21bbc1b99aa5c0f6bf02a805"])).toBe(false);
    expect(isJellyfinId(undefined)).toBe(false);
    expect(isJellyfinId(null)).toBe(false);
    expect(isJellyfinId(42)).toBe(false);
  });
});

describe("describeValueShape", () => {
  test("gives a string's length, never its text", () => {
    expect(describeValueShape("notification.click")).toBe(
      "string of length 18",
    );
    expect(describeValueShape("")).toBe("string of length 0");
  });

  test("gives an array's length, never its entries", () => {
    expect(describeValueShape(["a", "b"])).toBe("array of length 2");
  });

  test("names anything else by its type", () => {
    expect(describeValueShape(undefined)).toBe("undefined");
    expect(describeValueShape(null)).toBe("null");
    expect(describeValueShape(7)).toBe("number");
    expect(describeValueShape({ id: "x" })).toBe("object");
  });
});
