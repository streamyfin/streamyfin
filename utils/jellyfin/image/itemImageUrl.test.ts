import { Jellyfin } from "@jellyfin/sdk";
import { getImageApi } from "@jellyfin/sdk/lib/utils/api";
import { itemImageUrl } from "./itemImageUrl";

// The SDK types its parameters; these cases include values it would refuse
// (a null), which the app's helpers can still pass at run time.
type SdkParams = Parameters<
  ReturnType<typeof getImageApi>["getItemImageUrlById"]
>[2];

const jellyfin = new Jellyfin({
  clientInfo: { name: "test", version: "1" },
  deviceInfo: { name: "test", id: "test" },
});

describe("itemImageUrl", () => {
  // The image helpers moved off the SDK's builder for speed; every URL they
  // build must stay the one the SDK would have built.
  test.each([
    ["no parameters", {}],
    [
      "a size, a quality and a tag",
      { fillHeight: 338, quality: 90, tag: "c0ffee" },
    ],
    ["an image index of 0", { quality: 80, tag: "c0ffee", imageIndex: 0 }],
    ["missing values", { tag: undefined, maxWidth: null, quality: 90 }],
    ["characters to encode", { tag: "a b:c,d$e/f&g=h?i" }],
    ["a boolean", { addPlayedIndicator: true }],
  ])("matches the SDK's URL with %s", (_name, params) => {
    const api = jellyfin.createApi(
      "https://media.example.com/jellyfin",
      "TOKEN",
    );
    expect(itemImageUrl(api, "item-1", "Backdrop", params)).toBe(
      getImageApi(api).getItemImageUrlById(
        "item-1",
        "Backdrop",
        params as SdkParams,
      ),
    );
  });

  test("matches the SDK's URL when the server address ends with a slash", () => {
    const api = jellyfin.createApi("https://media.example.com/", "TOKEN");
    expect(itemImageUrl(api, "item-1", "Primary", { tag: "c0ffee" })).toBe(
      getImageApi(api).getItemImageUrlById("item-1", "Primary", {
        tag: "c0ffee",
      }),
    );
  });
});
