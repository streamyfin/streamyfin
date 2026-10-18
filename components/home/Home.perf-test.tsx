import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { type ReactNode, useState } from "react";
import { measureRenders } from "reassure";
import { Home } from "@/components/home/Home";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeItems } from "@/test-utils/baseItems";
import type { makeApi } from "@/test-utils/jellyfinApi";

jest.mock("@/utils/atoms/settings", () => {
  const { atom } = jest.requireActual("jotai");
  const { defaultValues: defaultSettings } = jest.requireActual(
    "@/utils/atoms/settings",
  );
  return {
    effectiveSettingsAtom: atom(defaultSettings),
    useSettings: () => ({
      settings: defaultSettings,
      updateSettings: () => {},
      pluginSettings: undefined,
    }),
  };
});
jest.mock("@/modules", () => {
  const { View } = jest.requireActual("react-native");
  return {
    HeroCarouselView: (props: any) => (
      <View testID='hero-carousel' {...props} />
    ),
    isHeroCarouselAvailable: () => true,
  };
});
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    downloadedItems: [],
    cleanCacheDirectory: async () => {},
  }),
}));
jest.mock("@/providers/IntroSheetProvider", () => ({
  useIntroSheet: () => ({ showIntro: () => {} }),
}));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isConnected: true,
    serverConnected: true,
    loading: false,
    retryCheck: () => {},
  }),
}));
jest.mock("@/hooks/useRefreshLibraryOnFocus", () => ({
  useRefreshLibraryOnFocus: () => {},
}));
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => () => {},
}));
jest.mock("@/hooks/useRemapHiddenLibraries", () => ({
  useRemapHiddenLibraries: () => {},
}));

const ROW_LENGTH = 10;
const items = (prefix: string, type: "Movie" | "Episode") =>
  makeItems(ROW_LENGTH, prefix, type);

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

const stubServer = () => {
  api.mock.reset();
  api.mock.onGet(/\/UserViews\?/).reply(200, {
    Items: [
      { Id: "movies", Name: "Movies", CollectionType: "movies" },
      { Id: "shows", Name: "Shows", CollectionType: "tvshows" },
    ],
  });
  api.mock
    .onGet(/\/UserItems\/Resume/)
    .reply(200, { Items: items("Resume", "Movie") });
  api.mock
    .onGet(/\/Shows\/NextUp/)
    .reply(200, { Items: items("NextUp", "Episode") });
  api.mock
    .onGet(/\/Items\/Latest/)
    .reply((config) => [
      200,
      new URL(config.url!).searchParams.get("parentId") === "shows"
        ? items("LatestShow", "Episode")
        : items("LatestMovie", "Movie"),
    ]);
  api.mock
    .onGet(/\/Items\/Suggestions/)
    .reply(200, { Items: items("Suggested", "Movie") });
};

const Wrapper = ({ children }: { children: ReactNode }) => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("Home Mobile Performance", () => {
  beforeEach(() => {
    stubServer();
  });

  test("Home mounts and scrolls", async () => {
    await measureRenders(<Home />, {
      wrapper: Wrapper,
      scenario: async () => {
        await screen.findAllByText("Resume 0");
        await act(async () => {
          jest.advanceTimersByTime(500);
        });
      },
    });
  }, 60_000);
});
