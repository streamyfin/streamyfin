import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { PixelRatio } from "react-native";
import { makeApi } from "@/test-utils/jellyfinApi";
import { getLogoImageUrlById } from "./getLogoImageUrlById";

const api = makeApi();

const movie = {
  Id: "movie-1",
  Type: "Movie",
  ImageTags: { Logo: "logo-tag" },
} satisfies BaseItemDto;

const onScreenDensity = (density: number) =>
  jest.spyOn(PixelRatio, "get").mockReturnValue(density);

const fillHeightOf = (url: string | null) =>
  new URL(url ?? "").searchParams.get("fillHeight");

afterEach(() => {
  jest.restoreAllMocks();
});

describe("getLogoImageUrlById", () => {
  // Issue #2166: the logo was requested 130 pixels tall for a slot 130 points
  // tall, so a 3x screen stretched it over 390 pixels.
  test("asks for as many pixels as the logo slot covers on a dense screen", () => {
    onScreenDensity(3);

    expect(fillHeightOf(getLogoImageUrlById({ api, item: movie }))).toBe("390");
  });

  test("rounds a fractional density to whole pixels", () => {
    onScreenDensity(2.625);

    expect(fillHeightOf(getLogoImageUrlById({ api, item: movie }))).toBe("341");
  });

  test("asks for the slot's own height on a 1x screen", () => {
    onScreenDensity(1);

    expect(fillHeightOf(getLogoImageUrlById({ api, item: movie }))).toBe("130");
  });

  test("sends an explicit height as it is, since the caller already counted pixels", () => {
    onScreenDensity(3);

    expect(
      fillHeightOf(getLogoImageUrlById({ api, item: movie, height: 120 })),
    ).toBe("120");
  });

  test("never asks for a logo taller than the cap", () => {
    onScreenDensity(3);

    expect(
      fillHeightOf(getLogoImageUrlById({ api, item: movie, height: 2000 })),
    ).toBe("600");
  });

  test("uses the series logo for an episode", () => {
    onScreenDensity(2);

    const url = getLogoImageUrlById({
      api,
      item: {
        Id: "episode-1",
        Type: "Episode",
        ParentLogoItemId: "series-1",
        ParentLogoImageTag: "series-logo-tag",
      },
    });

    expect(url).toContain("/Items/series-1/Images/Logo?");
    expect(new URL(url ?? "").searchParams.get("tag")).toBe("series-logo-tag");
    expect(fillHeightOf(url)).toBe("260");
  });

  test("returns null when the item has no logo", () => {
    expect(
      getLogoImageUrlById({ api, item: { Id: "movie-2", Type: "Movie" } }),
    ).toBeNull();
  });
});
