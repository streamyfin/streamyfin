import { JELLYFIN_ID_PARAMETER_PATTERN, JELLYFIN_ID_PATTERN } from "./Jellyfin";

const ID = "f137a2dd21bbc1b99aa5c0f6bf02a805";
const DASHED_ID = "f137a2dd-21bb-c1b9-9aa5-c0f6bf02a805";

// A caller anchors a pattern source by concatenation. Ungrouped, the anchors
// would bind to its first and last alternatives only, and an id with other
// text after or before it would pass.
describe.each([
  ["JELLYFIN_ID_PATTERN", JELLYFIN_ID_PATTERN],
  ["JELLYFIN_ID_PARAMETER_PATTERN", JELLYFIN_ID_PARAMETER_PATTERN],
])("%s", (_name, pattern) => {
  const anchored = new RegExp(`^${pattern}$`, "i");

  test("matches an id when anchored by concatenation", () => {
    expect(anchored.test(ID)).toBe(true);
    expect(anchored.test(DASHED_ID)).toBe(true);
  });

  test("anchors every one of its alternatives", () => {
    expect(anchored.test(`${ID}/Similar`)).toBe(false);
    expect(anchored.test(`Items/${DASHED_ID}`)).toBe(false);
  });
});
