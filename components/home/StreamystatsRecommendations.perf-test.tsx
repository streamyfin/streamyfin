import { act, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { measureRenders } from "reassure";
import { StreamystatsRecommendations } from "@/components/home/StreamystatsRecommendations";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeItems } from "@/test-utils/baseItems";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { QueryWrapper } from "@/test-utils/queryWrapper";

jest.mock("@/utils/atoms/settings", () =>
  jest
    .requireActual("@/test-utils/settings")
    .makeSettingsModule({ streamyStatsServerUrl: "http://streamystats.test" }),
);
jest.mock("@/utils/streamystats/api", () => ({
  createStreamystatsApi: () => ({
    getRecommendationIds: async () => ({
      data: {
        movies: Array.from({ length: 20 }, (_, index) => `Movie-${index}`),
        series: [],
      },
    }),
  }),
}));
jest.mock(
  "@/providers/DownloadProvider",
  () => jest.requireActual("@/test-utils/appProviders").downloadModule,
);
jest.mock(
  "@/providers/GlobalModalProvider",
  () => jest.requireActual("@/test-utils/appProviders").globalModalModule,
);

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

const stubServer = () => {
  api.mock.reset();
  api.mock.onGet(/\/System\/Info\/Public/).reply(200, { Id: "server-1" });
  api.mock
    .onGet(/\/Items\?/)
    .reply(200, { Items: makeItems(20, "Recommended", "Movie") });
};

describe("Streamystats Recommendations Performance", () => {
  beforeEach(() => {
    Object.assign(getDefaultStore().get(apiAtom) as object, {
      accessToken: "test-token",
    });
    stubServer();
  });

  test("a recommendations row loads its ids, then its items", async () => {
    await measureRenders(
      <StreamystatsRecommendations title='Recommended' type='Movie' />,
      {
        wrapper: QueryWrapper,
        scenario: async () => {
          await screen.findAllByText("Recommended 0");
          await act(async () => {
            jest.advanceTimersByTime(500);
          });
        },
      },
    );
  });
});
