import { getVersionItemId } from "./versionItem";

const item = { Id: "primary" };
const versions = [{ Id: "primary" }, { Id: "alt" }];

describe("getVersionItemId", () => {
  test("names the selected alternate version on Jellyfin 12", () => {
    expect(getVersionItemId(item, versions, "alt", "12.0.0", false)).toBe(
      "alt",
    );
  });

  test("the primary version reads the item's own UserData", () => {
    expect(
      getVersionItemId(item, versions, "primary", "12.0.0", false),
    ).toBeUndefined();
    expect(
      getVersionItemId(item, versions, undefined, "12.0.0", false),
    ).toBeUndefined();
  });

  test("older servers keep UserData on the primary item", () => {
    // Before Jellyfin 12 the version item's UserData is never written, so
    // reading it would hide the real resume point.
    expect(
      getVersionItemId(item, versions, "alt", "10.11.0", false),
    ).toBeUndefined();
    expect(
      getVersionItemId(item, versions, "alt", undefined, false),
    ).toBeUndefined();
  });

  test("offline uses the downloaded item", () => {
    expect(
      getVersionItemId(item, versions, "alt", "12.0.0", true),
    ).toBeUndefined();
  });
});
