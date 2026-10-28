import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { getPrimaryImageUrl } from "./getPrimaryImageUrl";

const api = makeApi();

describe("getPrimaryImageUrl", () => {
  test("asks for an item's primary image by its tag", () => {
    const url = getPrimaryImageUrl({
      api,
      item: {
        Id: "movie-1",
        ImageTags: { Primary: "primary-tag" },
        BackdropImageTags: [],
      },
      width: 400,
    });

    expect(url).toContain("/Items/movie-1/Images/Primary?");
    expect(new URL(url ?? "").searchParams.get("tag")).toBe("primary-tag");
  });

  test("asks for a person's image by its id", () => {
    expect(getPrimaryImageUrl({ api, item: { Id: "person-1" } })).toBe(
      "https://jellyfin.example.com/Items/person-1/Images/Primary",
    );
  });

  // REACT-NATIVE-NY: a text answer reached the series page as its item, and
  // building the image threw "right operand of 'in' is not an object". An
  // object without an Id gave /Items/undefined/Images/Primary.
  test.each([
    ["a page", "<!doctype html><html></html>"],
    ["a number", 42],
    ["an object without an Id", { message: "Not found" }],
    ["a list", [{ Id: "movie-1" }]],
    ["a boxed string", new String("<!doctype html>")],
  ])("gives no image, without throwing, for %s", (_name, notAnItem) => {
    expect(
      getPrimaryImageUrl({ api, item: notAnItem as unknown as BaseItemDto }),
    ).toBeNull();
  });

  test("gives no image without an api", () => {
    expect(
      getPrimaryImageUrl({ api: null, item: { Id: "movie-1" } }),
    ).toBeNull();
  });
});
