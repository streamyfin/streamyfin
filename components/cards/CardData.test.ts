import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { PixelRatio } from "react-native";
import { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";
import { buildItemCards } from "./CardData";

stubReactNative();

const api = makeApi();

const onScreenDensity = (density: number) =>
  jest.spyOn(PixelRatio, "get").mockReturnValue(density);

afterEach(() => {
  jest.restoreAllMocks();
});

const movie = {
  Id: "movie-1",
  Type: "Movie",
  Name: "Example Movie",
  ImageTags: { Primary: "poster-tag", Thumb: "thumb-tag" },
  BackdropImageTags: [],
} satisfies BaseItemDto;

const imageUrlOf = (
  item: BaseItemDto,
  options: Omit<Parameters<typeof buildItemCards>[1], "api">,
) => buildItemCards([item], { api, ...options })[0].imageUrl ?? "";

const sizeOf = (url: string) => {
  const params = new URL(url).searchParams;
  return {
    fillWidth: params.get("fillWidth"),
    fillHeight: params.get("fillHeight"),
  };
};

// Issue #2166: card artwork was requested at a fixed pixel size while the card
// is laid out in points, so a dense screen stretched it.
describe("buildItemCards artwork size", () => {
  test("covers a poster row card on a 3x screen", () => {
    onScreenDensity(3);

    // 118 points is 354 pixels; the request was 300 wide whatever the screen.
    expect(sizeOf(imageUrlOf(movie, { kind: "portrait" }))).toEqual({
      fillWidth: "400",
      fillHeight: null,
    });
  });

  test("covers the card a grid draws, which is wider than a row card", () => {
    onScreenDensity(3);

    // Two columns on a large phone: 185 points, 555 pixels.
    expect(
      sizeOf(imageUrlOf(movie, { kind: "portrait", cardWidth: 185 })),
    ).toEqual({ fillWidth: "600", fillHeight: null });
  });

  // A URL that moves is an image downloaded again, so the 2x screens the old
  // fixed size already covered keep the exact request they had.
  test("leaves the request as it was on a 2x screen", () => {
    onScreenDensity(2);

    expect(imageUrlOf(movie, { kind: "portrait" })).toBe(
      `${api.basePath}/Items/movie-1/Images/Primary?fillWidth=300&quality=80&tag=poster-tag`,
    );
  });

  // A grid column is a few points off a row card and changes with the window.
  // Each of those widths asking for its own image would download one poster
  // several times over.
  test("shares one image between cards a few points apart", () => {
    onScreenDensity(3);

    const row = imageUrlOf(movie, { kind: "portrait" });

    expect(imageUrlOf(movie, { kind: "portrait", cardWidth: 113 })).toBe(row);
    expect(imageUrlOf(movie, { kind: "portrait", cardWidth: 126 })).toBe(row);
  });

  test("stops at the cap however large the card is", () => {
    onScreenDensity(3);

    expect(
      sizeOf(imageUrlOf(movie, { kind: "portrait", cardWidth: 600 })),
    ).toEqual({ fillWidth: "800", fillHeight: null });
  });

  test("sizes an episode's borrowed series poster like the series card", () => {
    onScreenDensity(3);

    const episodeUrl = imageUrlOf(
      {
        Id: "episode-1",
        Type: "Episode",
        SeriesId: "series-1",
        SeriesPrimaryImageTag: "series-poster-tag",
      },
      { kind: "portrait" },
    );

    // The same URL as the series' own card, so the poster is fetched once.
    expect(episodeUrl).toBe(
      imageUrlOf(
        {
          Id: "series-1",
          Type: "Series",
          ImageTags: { Primary: "series-poster-tag" },
          BackdropImageTags: [],
        },
        { kind: "portrait" },
      ),
    );
    expect(sizeOf(episodeUrl)).toEqual({ fillWidth: "400", fillHeight: null });
  });

  test("sizes a wide card by the height it is drawn at", () => {
    // 200 by 112.5 points. The fixed 389 pixels fell short from 3.5x up.
    onScreenDensity(3.75);
    expect(sizeOf(imageUrlOf(movie, { kind: "wide" }))).toEqual({
      fillWidth: null,
      fillHeight: "450",
    });

    onScreenDensity(2);
    expect(sizeOf(imageUrlOf(movie, { kind: "wide" }))).toEqual({
      fillWidth: null,
      fillHeight: "225",
    });
  });

  // A wide card with no Thumb falls back to the Primary image, which for a
  // movie is a 2:3 poster. Sized by height alone it came back 225 pixels wide
  // for a card 600 pixels wide.
  test("covers the whole wide card when it falls back to a poster", () => {
    onScreenDensity(3);

    const url = imageUrlOf(
      { ...movie, ImageTags: { Primary: "poster-tag" } },
      { kind: "wide" },
    );

    expect(url).toContain("/Items/movie-1/Images/Primary?");
    expect(sizeOf(url)).toEqual({ fillWidth: "600", fillHeight: "338" });
  });

  test("covers the whole wide card with an episode's own still", () => {
    onScreenDensity(3);

    // Stills of older shows are 4:3, so they are bound by the width too.
    const url = imageUrlOf(
      { Id: "episode-1", Type: "Episode", ImageTags: { Primary: "still" } },
      { kind: "wide", useEpisodePoster: true },
    );

    expect(url).toContain("/Items/episode-1/Images/Primary?");
    expect(sizeOf(url)).toEqual({ fillWidth: "600", fillHeight: "338" });
  });

  test("asks for less for the small artwork of a list row", () => {
    onScreenDensity(3);

    // 128 by 72 points.
    expect(sizeOf(imageUrlOf(movie, { kind: "rowWide" }))).toEqual({
      fillWidth: null,
      fillHeight: "225",
    });
  });
});

describe("buildItemCards parent-first labels", () => {
  for (const { name, item, expected } of [
    {
      name: "season",
      item: {
        Id: "season-1",
        Type: "Season",
        Name: "Season 2",
        SeriesName: "Example Show",
      } satisfies BaseItemDto,
      expected: { title: "Example Show", subtitle: "Season 2" },
    },
    {
      name: "numbered episode",
      item: {
        Id: "episode-1",
        Type: "Episode",
        Name: "The Episode",
        SeriesName: "Example Show",
        ParentIndexNumber: 2,
        IndexNumber: 4,
      } satisfies BaseItemDto,
      expected: {
        title: "Example Show",
        subtitle: "S2:E4 - The Episode",
      },
    },
    {
      name: "episode without index numbers",
      item: {
        Id: "episode-2",
        Type: "Episode",
        Name: "Unknown Episode",
        SeriesName: "Example Show",
      } satisfies BaseItemDto,
      expected: { title: "Example Show", subtitle: "Unknown Episode" },
    },
    {
      name: "item without a series",
      item: {
        Id: "movie-1",
        Type: "Movie",
        Name: "Example Movie",
        ProductionYear: 2026,
      } satisfies BaseItemDto,
      expected: { title: "Example Movie", subtitle: "2026" },
    },
  ]) {
    test(`maps a ${name}`, () => {
      const [card] = buildItemCards([item], {
        api,
        kind: "wide",
        showParentTitle: true,
      });

      expect(card).toMatchObject(expected);
    });
  }

  test("uses the standard labels when parent-first labels are disabled", () => {
    const [card] = buildItemCards(
      [
        {
          Id: "episode-1",
          Type: "Episode",
          Name: "The Episode",
          SeriesName: "Example Show",
          ParentIndexNumber: 2,
          IndexNumber: 4,
        },
      ],
      { api, kind: "wide", showParentTitle: false },
    );

    expect(card).toMatchObject({
      title: "The Episode",
      subtitle: "S2:E4 - Example Show",
    });
  });
});

// Jellyfin 12 sets IsLive from XMLTV (jellyfin/jellyfin#8890), so the flag is
// finally common enough to show on the Live TV program rows.
describe("buildItemCards live badge", () => {
  const liveOf = (item: BaseItemDto) =>
    buildItemCards([{ Id: "item-1", ...item }], { api, kind: "wide" })[0].live;

  test("marks a program the listings call live", () => {
    expect(liveOf({ Type: "Program", IsLive: true })).toBe(true);
  });

  test.each([false, null, undefined])(
    "leaves a program alone when IsLive is %p",
    (IsLive) => {
      expect(liveOf({ Type: "Program", IsLive })).toBe(false);
    },
  );

  // The flag only means something on a guide entry: a recording of a live
  // broadcast is not live any more.
  test("leaves anything that is not a program alone", () => {
    expect(liveOf({ Type: "Recording", IsLive: true })).toBe(false);
    expect(liveOf({ Type: "Movie", IsLive: true })).toBe(false);
  });
});
