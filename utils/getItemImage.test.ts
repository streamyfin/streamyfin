import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { getItemImage } from "./getItemImage";

jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);

const api = makeApi();

const movie = {
  Id: "movie-1",
  Type: "Movie",
  ImageTags: { Primary: "primary-tag" },
  BackdropImageTags: ["backdrop-tag"],
} satisfies BaseItemDto;

describe("getItemImage", () => {
  // Issue #2166: the detail page header asked for a 1000 pixel wide backdrop
  // and covered a 1233 by 1500 pixel box with it.
  test("asks for an image that covers the whole box when given its height", () => {
    const source = getItemImage({
      api,
      item: movie,
      variant: "Backdrop",
      width: 1233,
      height: 1500,
    });

    expect(source?.uri).toBe(
      `${api.basePath}/Items/movie-1/Images/Backdrop/0?quality=90&tag=backdrop-tag&fillWidth=1233&fillHeight=1500&maxWidth=1920&maxHeight=1920`,
    );
  });

  test("covers the box with the primary image too", () => {
    const source = getItemImage({
      api,
      item: movie,
      width: 1233,
      height: 1050,
    });

    expect(source?.uri).toBe(
      `${api.basePath}/Items/movie-1/Images/Primary?quality=90&tag=primary-tag&fillWidth=1233&fillHeight=1050&maxWidth=1920&maxHeight=1920`,
    );
  });

  test("leaves a width only request as it was", () => {
    const source = getItemImage({ api, item: movie, variant: "Backdrop" });

    expect(source?.uri).toBe(
      `${api.basePath}/Items/movie-1/Images/Backdrop/0?quality=90&tag=backdrop-tag&width=1000`,
    );
  });
});
