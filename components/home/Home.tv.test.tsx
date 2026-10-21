import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { useState } from "react";
import { prefetchServerImage } from "@/components/common/ServerImage";
import {
  TV_BACKDROP_CROSSFADE_MS,
  TV_BACKDROP_DEBOUNCE_MS,
} from "@/constants/TVSizes";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { SortByOption, SortOrderOption } from "@/utils/atoms/filters";
import type { Home as HomeLayout } from "@/utils/atoms/settings";
import { Home } from "./Home.tv";

const defaultSettings = {
  home: null as HomeLayout | null,
  hiddenLibraries: [] as string[],
  mergeNextUpAndContinueWatching: false,
  showUpcomingOnHome: false,
  useEpisodeImagesForNextUp: false,
  streamyStatsMovieRecommendations: false,
  streamyStatsSeriesRecommendations: false,
  streamyStatsPromotedWatchlists: false,
  showHomeBackdrop: true,
  showHeroCarousel: true,
  tvTypographyScale: "default",
};
type HomeSettings = typeof defaultSettings;

let mockSettings: HomeSettings = defaultSettings;

const mockPush = jest.fn();

// Commits per poster card, by item id. A Profiler counts a card's own state
// updates (its focus) as well as re-renders coming down from its row.
const mockCardCommits: Record<string, number> = {};

jest.mock("@/components/tv/TVPosterCard", () => {
  const { Profiler } = jest.requireActual("react");
  const actual = jest.requireActual("@/components/tv/TVPosterCard");
  return {
    ...actual,
    TVPosterCard: (props: { item: BaseItemDto }) => (
      <Profiler
        id={props.item.Id!}
        onRender={(id: string) => {
          mockCardCommits[id] = (mockCardCommits[id] ?? 0) + 1;
        }}
      >
        <actual.TVPosterCard {...props} />
      </Profiler>
    ),
  };
});

jest.mock("@/utils/atoms/settings", () => ({
  TVTypographyScale: { Default: "default" },
  useSettings: () => ({
    settings: mockSettings,
    updateSettings: () => {},
    pluginSettings: undefined,
  }),
}));

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  return {
    apiAtom: atom(make()),
    userAtom: atom({ Id: "user-1" }),
    cacheVersionAtom: atom(0),
  };
});

jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isConnected: true,
    serverConnected: true,
    loading: false,
    retryCheck: () => {},
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) =>
      params?.libraryName ? `${key}:${params.libraryName}` : key,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-router", () => ({ useSegments: () => ["(auth)", "(tabs)"] }));

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: (item: BaseItemDto, from: string) =>
    `/items/${item.Id}?from=${from}`,
}));

jest.mock("@/hooks/useAppRouter", () => () => ({
  push: mockPush,
}));

jest.mock(
  "@/hooks/useTVItemActionModal",
  () =>
    jest.requireActual("@/test-utils/tvItemActionModal")
      .tvItemActionModalModule,
);

const { tvItemActionModalMock } = jest.requireActual(
  "@/test-utils/tvItemActionModal",
);

jest.mock("@/hooks/useRefreshLibraryOnFocus", () => ({
  useRefreshLibraryOnFocus: () => {},
}));

jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => () => {},
}));

jest.mock("@/hooks/useRemapHiddenLibraries", () => ({
  useRemapHiddenLibraries: () => {},
}));

jest.mock("@/utils/tvDiscovery/sync", () => ({
  updateTVDiscovery: () => {},
}));

jest.mock(
  "@/components/common/ServerImage",
  () => jest.requireActual("@/test-utils/serverImage").serverImageModule,
);

// A plain child of Home: it renders exactly when Home does, which makes it
// the test's measure of Home's own renders.
let mockStreamystatsRenders = 0;
jest.mock("@/components/home/StreamystatsRecommendations.tv", () => {
  const { View, Text } = jest.requireActual("react-native");
  return {
    StreamystatsRecommendations: ({ title }: { title: string }) => {
      mockStreamystatsRenders++;
      return (
        <View testID='streamystats-recommendations'>
          <Text>{title}</Text>
        </View>
      );
    },
  };
});

// Past the backdrop debounce and its crossfade; the extra covers the prefetch
// and the short wait before the fade starts.
const PAST_BACKDROP = TV_BACKDROP_DEBOUNCE_MS + TV_BACKDROP_CROSSFADE_MS + 100;

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

const ROW_LENGTH = 10;

const items = (prefix: string, type: "Movie" | "Episode"): BaseItemDto[] =>
  Array.from({ length: ROW_LENGTH }, (_, index) => ({
    Id: `${prefix}-${index}`,
    Name: `${prefix} ${index}`,
    Type: type,
    SeriesName: type === "Episode" ? `${prefix} series ${index}` : undefined,
    ImageTags: { Primary: `tag-${prefix}-${index}` },
    BackdropImageTags: [`backdrop-${prefix}-${index}`],
    ParentThumbItemId:
      type === "Episode" ? `thumb-${prefix}-${index}` : undefined,
    ParentThumbImageTag:
      type === "Episode" ? `tag-thumb-${prefix}-${index}` : undefined,
    ParentIndexNumber: 1,
    IndexNumber: index + 1,
    UserData: { PlayedPercentage: 40 },
  }));

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
  api.mock.onGet(/\/Items(?!\/(Latest|Suggestions))/).reply(200, {
    Items: items("CustomItem", "Movie"),
  });
};

const Wrapper = ({ children }: { children: React.ReactNode }) => {
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

/**
 * A card's artwork, by the id of its item. The artwork sits inside the card's
 * pressable while the title is drawn below it, so this is where the remote's
 * events land. The backdrop loads the same item's Backdrop image; that one is
 * left out.
 */
const card = (itemId: string) =>
  screen.getByTestId(new RegExp(`/Items/${itemId}/Images/(?!Backdrop)`));

const withSettings = (overrides: Partial<HomeSettings>) => {
  mockSettings = { ...defaultSettings, ...overrides };
};

describe("Home.tv behaviours", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["performance"] });
    mockPush.mockClear();
    tvItemActionModalMock.showItemActions.mockClear();
    jest.mocked(prefetchServerImage).mockClear();
    stubServer();
    for (const key of Object.keys(mockCardCommits)) {
      delete mockCardCommits[key];
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("initial focus (hasTVPreferredFocus) is given to the first poster when hero is hidden", async () => {
    withSettings({ showHeroCarousel: false, showHomeBackdrop: true });

    await render(<Home />, { wrapper: Wrapper });

    await screen.findByText("Resume 0");

    type Node = ReturnType<typeof screen.toJSON>;
    const findNodesWithPreferredFocus = (node: Node | string): any[] => {
      if (!node || typeof node === "string") return [];
      if (Array.isArray(node)) {
        return node.flatMap(findNodesWithPreferredFocus);
      }
      const self = node.props?.hasTVPreferredFocus === true ? [node] : [];
      const children = (node.children ?? []).flatMap((c) =>
        findNodesWithPreferredFocus(c as Node | string),
      );
      return [...self, ...children];
    };

    const preferredNodes = findNodesWithPreferredFocus(screen.toJSON());
    expect(preferredNodes).toHaveLength(1);
    // And it is the first card of the first row, not any one card.
    const testIds = (node: Node | string): string[] => {
      if (!node || typeof node === "string") return [];
      if (Array.isArray(node)) return node.flatMap(testIds);
      const own =
        typeof node.props?.testID === "string" ? [node.props.testID] : [];
      return [
        ...own,
        ...(node.children ?? []).flatMap((c) => testIds(c as Node | string)),
      ];
    };
    expect(testIds(preferredNodes[0]).join(" ")).toMatch(
      /\/Items\/Resume-0\/Images\//,
    );
  });

  test("press opens the item", async () => {
    withSettings({ showHeroCarousel: false });

    await render(<Home />, { wrapper: Wrapper });

    await screen.findByText("Resume 0");
    fireEvent.press(card("Resume-0"));

    expect(mockPush).toHaveBeenCalledWith("/items/Resume-0?from=(home)");
  });

  test("long press opens the action modal", async () => {
    withSettings({ showHeroCarousel: false });

    await render(<Home />, { wrapper: Wrapper });

    await screen.findByText("Resume 0");
    fireEvent(card("Resume-0"), "longPress");

    expect(tvItemActionModalMock.showItemActions).toHaveBeenCalledWith(
      expect.objectContaining({ Id: "Resume-0" }),
    );
  });

  test("'See all' at the end of a row navigates to the library detail", async () => {
    withSettings({ showHeroCarousel: false });

    await render(<Home />, { wrapper: Wrapper });

    const seeAllButtons = await screen.findAllByText("common.seeAll");
    expect(seeAllButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.press(seeAllButtons[0]);
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/[libraryId]",
      params: {
        libraryId: "movies",
        sortBy: SortByOption.DateCreated,
        sortOrder: SortOrderOption.Descending,
        fromSeeAll: "true",
      },
    });
  });

  test("custom Home sections render when configured in settings", async () => {
    withSettings({
      showHeroCarousel: false,
      home: {
        sections: [
          {
            title: "Custom Section Title",
            items: { limit: 10 },
          },
        ],
      },
    });

    await render(<Home />, { wrapper: Wrapper });

    expect(await screen.findByText("Custom Section Title")).toBeTruthy();
    expect(await screen.findByText("CustomItem 0")).toBeTruthy();
  });

  test("Streamystats rows keep their position after recently added sections", async () => {
    withSettings({
      showHeroCarousel: false,
      streamyStatsMovieRecommendations: true,
    });

    await render(<Home />, { wrapper: Wrapper });

    // Wait for Recently Added rows to appear
    await screen.findByText("home.recently_added_in:Movies");
    await screen.findByText("home.recently_added_in:Shows");

    // Verify streamystats recommendation row is rendered
    expect(
      await screen.findByText(
        "home.settings.plugins.streamystats.recommended_movies",
      ),
    ).toBeTruthy();

    // ... and below both recently added rows, not merely somewhere.
    const texts = (node: unknown): string[] => {
      if (typeof node === "string") return [node];
      if (Array.isArray(node)) return node.flatMap(texts);
      const children = (node as { children?: unknown[] } | null)?.children;
      return children ? children.flatMap(texts) : [];
    };
    const order = texts(screen.toJSON());
    const streamystats = order.indexOf(
      "home.settings.plugins.streamystats.recommended_movies",
    );
    expect(streamystats).toBeGreaterThan(
      order.indexOf("home.recently_added_in:Movies"),
    );
    expect(streamystats).toBeGreaterThan(
      order.indexOf("home.recently_added_in:Shows"),
    );
  });

  // The backdrop's focus state used to live in Home, so each focus move
  // re-rendered the whole screen 300 ms later.
  test("a focus move does not re-render the Home screen", async () => {
    withSettings({
      showHeroCarousel: false,
      showHomeBackdrop: true,
      streamyStatsMovieRecommendations: true,
    });

    await render(<Home />, { wrapper: Wrapper });
    await screen.findByText(
      "home.settings.plugins.streamystats.recommended_movies",
    );
    await act(async () => {
      fireEvent(card("Resume-0"), "focus");
    });
    await act(async () => {
      jest.advanceTimersByTime(PAST_BACKDROP);
    });
    const rendersBefore = mockStreamystatsRenders;

    await act(async () => {
      fireEvent(card("Resume-0"), "blur");
      fireEvent(card("Resume-1"), "focus");
    });
    await act(async () => {
      jest.advanceTimersByTime(PAST_BACKDROP);
    });

    expect(mockStreamystatsRenders).toBe(rendersBefore);
    expect(prefetchServerImage).toHaveBeenCalledWith(
      expect.stringContaining("/Items/Resume-1/Images/Backdrop"),
      expect.anything(),
      "disk",
    );
  });

  test("useEpisodeImagesForNextUp preference requests episode primary image instead of parent thumb", async () => {
    withSettings({
      showHeroCarousel: false,
      useEpisodeImagesForNextUp: true,
    });

    await render(<Home />, { wrapper: Wrapper });

    await screen.findByText("NextUp 0");

    // When useEpisodeImagesForNextUp is true, NextUp-0 should request episode primary image with tag-NextUp-0
    const episodeImage = screen.getByTestId(
      /\/Items\/NextUp-0\/Images\/Primary.*tag=tag-NextUp-0/,
    );
    expect(episodeImage).toBeTruthy();
  });

  test("a focus move re-renders only the card losing focus and the card gaining it", async () => {
    withSettings({ showHeroCarousel: false, showHomeBackdrop: true });

    await render(<Home />, { wrapper: Wrapper });
    await screen.findByText("LatestMovie 0");

    await act(async () => {
      fireEvent(card("Resume-0"), "focus");
    });
    await act(async () => {
      jest.advanceTimersByTime(PAST_BACKDROP);
    });
    const before = { ...mockCardCommits };

    await act(async () => {
      fireEvent(card("Resume-0"), "blur");
      fireEvent(card("Resume-1"), "focus");
    });
    await act(async () => {
      jest.advanceTimersByTime(PAST_BACKDROP);
    });

    const recommitted = Object.keys(mockCardCommits).filter(
      (id) => mockCardCommits[id] !== before[id],
    );
    expect(recommitted.sort()).toEqual(["Resume-0", "Resume-1"]);
  });

  test("a focus move loads the backdrop when it is drawn", async () => {
    withSettings({ showHeroCarousel: false, showHomeBackdrop: true });

    await render(<Home />, { wrapper: Wrapper });
    await screen.findByText("Resume 0");
    await act(async () => {
      fireEvent(card("Resume-0"), "focus");
    });
    await act(async () => {
      jest.advanceTimersByTime(PAST_BACKDROP);
    });

    expect(prefetchServerImage).toHaveBeenCalledWith(
      expect.stringContaining("/Items/Resume-0/Images/Backdrop"),
      expect.anything(),
      "disk",
    );
  });

  test.each([
    [
      "the backdrop is off",
      { showHeroCarousel: false, showHomeBackdrop: false },
    ],
    ["the hero is shown", { showHeroCarousel: true, showHomeBackdrop: true }],
  ])(
    "a focus move in a row does no backdrop work when %s",
    async (_, settings) => {
      withSettings(settings);

      await render(<Home />, { wrapper: Wrapper });
      await screen.findByText("LatestMovie 0");
      // The hero loads the backdrop of its own featured item.
      await act(async () => {
        jest.advanceTimersByTime(PAST_BACKDROP);
      });
      const loadsBefore = jest.mocked(prefetchServerImage).mock.calls.length;

      await act(async () => {
        fireEvent(card("LatestMovie-0"), "focus");
      });
      await act(async () => {
        jest.advanceTimersByTime(PAST_BACKDROP);
      });

      expect(jest.mocked(prefetchServerImage).mock.calls).toHaveLength(
        loadsBefore,
      );
    },
  );
});
