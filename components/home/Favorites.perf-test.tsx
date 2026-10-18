import { act, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { measureRenders } from "reassure";
import FavoritesPage from "@/app/(auth)/(tabs)/(favorites)/index";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeItems } from "@/test-utils/baseItems";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { QueryWrapper } from "@/test-utils/queryWrapper";

jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => async () => {},
}));
jest.mock(
  "@/providers/NetworkStatusProvider",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);
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
  api.mock.onGet(/\/Items\?/).reply((config) => {
    const type = new URL(config.url!, "http://server").searchParams.get(
      "includeItemTypes",
    );
    return [200, { Items: makeItems(20, `Favorite ${type}`, "Movie") }];
  });
};

describe("Favorites Performance", () => {
  beforeEach(() => {
    stubServer();
  });

  test("the favorites page loads a row for every kind of item", async () => {
    await measureRenders(<FavoritesPage />, {
      wrapper: QueryWrapper,
      scenario: async () => {
        await screen.findAllByText("Favorite Movie 0");
        await act(async () => {
          jest.advanceTimersByTime(500);
        });
      },
    });
  });
});
