import { describe, expect, test } from "bun:test";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { buildTVDiscoveryPayload } from "@/utils/tvDiscovery/payload";

// buildTVDiscoveryPayload only reads api.basePath; it issues no requests.
const api = makeApi();

const movie = (overrides: Partial<BaseItemDto> = {}): BaseItemDto =>
  ({
    Id: "movie-1",
    Name: "Some Movie",
    Type: "Movie",
    ImageTags: { Primary: "tag" },
    ...overrides,
  }) as BaseItemDto;

const sectionOf = (items: BaseItemDto[]) => [{ title: "Continue", items }];

describe("buildTVDiscoveryPayload badges", () => {
  test("attaches quality badges derived from the item's media streams", () => {
    const payload = buildTVDiscoveryPayload({
      api,
      sections: sectionOf([
        movie({
          MediaSources: [
            {
              MediaStreams: [
                { Type: "Video", Width: 3840, VideoRangeType: "DOVI" },
                { Type: "Audio", Profile: "Dolby Atmos" },
              ],
            },
          ],
        }),
      ]),
    });

    expect(payload?.sections[0].items[0].badges).toEqual([
      "4K",
      "Dolby Vision",
      "Atmos",
    ]);
  });

  test("omits the badges key when the item has no quality metadata", () => {
    const payload = buildTVDiscoveryPayload({
      api,
      sections: sectionOf([
        movie({
          MediaSources: [
            {
              MediaStreams: [{ Type: "Video", Width: 1920, VideoRange: "SDR" }],
            },
          ],
        }),
      ]),
    });

    const item = payload?.sections[0].items[0];
    expect(item).toBeDefined();
    expect(item?.badges).toBeUndefined();
  });
});

describe("buildTVDiscoveryPayload cast", () => {
  test("attaches up to three main actors from the item's People", () => {
    const payload = buildTVDiscoveryPayload({
      api,
      sections: sectionOf([
        movie({
          People: [
            { Name: "Director Person", Type: "Director" },
            { Name: "Actor One", Type: "Actor" },
            { Name: "Actor Two", Type: "Actor" },
            { Name: "Actor Three", Type: "Actor" },
            { Name: "Actor Four", Type: "Actor" },
          ],
        }),
      ]),
    });

    expect(payload?.sections[0].items[0].cast).toEqual([
      "Actor One",
      "Actor Two",
      "Actor Three",
    ]);
  });

  test("omits the cast key when the item has no billed actors", () => {
    const payload = buildTVDiscoveryPayload({
      api,
      sections: sectionOf([
        movie({ People: [{ Name: "Director Person", Type: "Director" }] }),
      ]),
    });

    const item = payload?.sections[0].items[0];
    expect(item).toBeDefined();
    expect(item?.cast).toBeUndefined();
  });
});
