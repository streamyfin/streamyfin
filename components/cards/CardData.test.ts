import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";
import { buildItemCards } from "./CardData";

stubReactNative();

const api = makeApi();

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
