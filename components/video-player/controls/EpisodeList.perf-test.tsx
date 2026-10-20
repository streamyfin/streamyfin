import { act, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { measureRenders } from "reassure";
import {
  EpisodeList,
  seasonIndexAtom,
} from "@/components/video-player/controls/EpisodeList";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeItems } from "@/test-utils/baseItems";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { QueryWrapper } from "@/test-utils/queryWrapper";

jest.mock(
  "@/providers/GlobalModalProvider",
  () => jest.requireActual("@/test-utils/appProviders").globalModalModule,
);
jest.mock(
  "@/providers/DownloadProvider",
  () => jest.requireActual("@/test-utils/appProviders").downloadModule,
);

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;
const store = getDefaultStore();

const playing = {
  Id: "Episode-0",
  Name: "Episode 0",
  Type: "Episode" as const,
  SeriesId: "series-1",
  SeasonId: "season-1",
  ParentId: "season-1",
  ParentIndexNumber: 1,
};

const stubServer = () => {
  api.mock.reset();
  api.mock.onGet(/\/Shows\/series-1\/Seasons/).reply(200, {
    Items: [
      { Id: "season-1", IndexNumber: 1, Name: "Season 1" },
      { Id: "season-2", IndexNumber: 2, Name: "Season 2" },
    ],
  });
  api.mock.onGet(/\/Shows\/series-1\/Episodes/).reply((config) => {
    const season = new URL(config.url!, "http://server").searchParams.get(
      "seasonId",
    );
    return [
      200,
      {
        Items: makeItems(24, `S${season}`, "Episode").map((episode) => ({
          ...episode,
          Overview: `Overview of ${episode.Name}`,
          RunTimeTicks: 42 * 60 * 10_000_000,
        })),
      },
    ];
  });
  api.mock.onGet(/\/Items\//).reply(200, {});
};

describe("EpisodeList Performance", () => {
  beforeEach(() => {
    stubServer();
    store.set(seasonIndexAtom, {});
  });

  test("the episode list loads a season, then switches to the next", async () => {
    await measureRenders(
      <EpisodeList item={playing} close={() => {}} goToItem={() => {}} />,
      {
        wrapper: QueryWrapper,
        scenario: async () => {
          await screen.findByText("Overview of Sseason-1 0");
          await act(async () => {
            store.set(seasonIndexAtom, { "season-1": 2 });
          });
          await screen.findByText("Overview of Sseason-2 0");
        },
      },
    );
  });
});
