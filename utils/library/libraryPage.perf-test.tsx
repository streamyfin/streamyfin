import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { measureRenders } from "reassure";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { QueryWrapper } from "@/test-utils/queryWrapper";
import { stubReactNative } from "@/test-utils/reactNative";

// Baseline for the TV library grid (.scratchpad tv-performance ticket 01), on
// app/(auth)/(tabs)/(libraries)/[libraryId].tsx: a spec under app/ would
// become a route. The screen, its queries and the poster cards are real.

jest.mock("@/utils/atoms/settings", () => ({
  ...jest.requireActual("@/utils/atoms/settings"),
  ...jest.requireActual("@/test-utils/settings").makeSettingsModule(),
}));
jest.mock("expo-router", () => ({
  ...jest.requireActual("@/test-utils/expoRouter").expoRouterModule,
  useLocalSearchParams: () => ({ libraryId: "movies" }),
  useSegments: () => ["(auth)", "(tabs)", "(libraries)"],
}));
jest.mock("@/hooks/useAppRouter", () => () => ({
  push: () => {},
  replace: () => {},
}));
jest.mock(
  "@/hooks/useTVItemActionModal",
  () =>
    jest.requireActual("@/test-utils/tvItemActionModal")
      .tvItemActionModalModule,
);
jest.mock("@/hooks/useRefreshLibraryOnFocus", () => ({
  useRefreshLibraryOnFocus: () => {},
}));
// Starts playback; nothing here plays.
jest.mock("@/hooks/useLibraryPlayQueue", () => ({
  useLibraryPlayQueue: () => ({
    playAll: () => {},
    shuffle: () => {},
    isStarting: false,
  }),
}));
// The phone grid; the TV branch draws its own.
jest.mock("@/components/cards/useCardGrid", () => ({
  useCardGrid: () => ({
    data: [],
    renderItem: () => null,
    keyExtractor: () => "",
    rowGap: 0,
    actionSheet: null,
  }),
}));
// Reached through the TV component barrel; nothing here downloads or plays.
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({}),
}));
jest.mock("@/hooks/useMarkAsPlayed", () => ({
  useMarkAsPlayed: () => () => {},
}));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => "/items/page",
}));
jest.mock(
  "@/components/common/ServerImage",
  () => jest.requireActual("@/test-utils/serverImage").serverImageModule,
);

const PAGE_SIZE = 36;
const PAGES = 10;
const TOTAL = PAGE_SIZE * PAGES;

const movie = (index: number): BaseItemDto => ({
  Id: `movie-${index}`,
  Name: `Movie ${index}`,
  Type: "Movie",
  ProductionYear: 2000 + (index % 25),
  ImageTags: { Primary: `tag-${index}` },
});

let Page: React.ComponentType;
let api: ReturnType<typeof makeApi>;

beforeAll(() => {
  stubReactNative({ isTV: true });
  // Required after the stub: the screen reads Platform as it loads.
  Page = require("@/app/(auth)/(tabs)/(libraries)/[libraryId]").default;
  api = getDefaultStore().get(
    require("@/providers/JellyfinProvider").apiAtom,
  ) as ReturnType<typeof makeApi>;
});

const stubServer = () => {
  api.mock.reset();
  api.mock.onGet().reply((config) => {
    const url = new URL(config.url!);
    const query = url.searchParams;
    if (url.pathname.endsWith("/Items/movies")) {
      return [200, { Id: "movies", Name: "Movies", CollectionType: "movies" }];
    }
    if (url.pathname.endsWith("/Items") && query.get("parentId") === "movies") {
      const start = Number(query.get("startIndex") ?? 0);
      const end = Math.min(start + PAGE_SIZE, TOTAL);
      return [
        200,
        {
          Items: Array.from({ length: end - start }, (_, i) =>
            movie(start + i),
          ),
          TotalRecordCount: TOTAL,
          StartIndex: start,
        },
      ];
    }
    if (url.pathname.includes("/Filters")) {
      return [200, { Genres: [], Years: [], Tags: [] }];
    }
    if (url.pathname.endsWith("/System/Info/Public")) {
      return [200, { Version: "10.11.0" }];
    }
    return [200, { Items: [], TotalRecordCount: 0 }];
  });
};

/**
 * Scrolls to the bottom of what is loaded, which asks for the next page. The
 * event goes to the toolbar's title, which stays mounted while the posters
 * scrolled past are not, and reaches the grid's scroll view from there.
 */
let scrolledTo = 0;
const scrollToEnd = async () => {
  // Further each time: the grid only looks for its end when the offset moves.
  scrolledTo += 100_000;
  await fireEvent.scroll(screen.getByText("Movies"), {
    nativeEvent: {
      layoutMeasurement: { height: 1080, width: 1920 },
      contentOffset: { y: scrolledTo, x: 0 },
      contentSize: { height: scrolledTo, width: 1920 },
    },
  });
};

/** How many item pages the grid has asked for. */
const requestedPages = () =>
  api.mock.history.get.filter((request) =>
    new URL(request.url!).pathname.endsWith("/Items"),
  ).length;

beforeEach(() => {
  // perfSetup fakes the timers; the pages here load on real ones, and the
  // scenario waits for them.
  jest.useRealTimers();
  stubServer();
});

describe("TV library grid", () => {
  test("loads ten pages", async () => {
    await measureRenders(<Page />, {
      wrapper: QueryWrapper,
      scenario: async () => {
        await screen.findByText("Movie 0");
        const before = requestedPages();
        // A virtualized grid can ask for several pages on one scroll, a
        // ScrollView asks for one: scroll until all ten are in either way.
        await waitFor(
          async () => {
            await scrollToEnd();
            expect(requestedPages() - before).toBe(PAGES - 1);
          },
          { timeout: 10_000 },
        );
        await screen.findByText(`Movie ${TOTAL - 1}`);
        await act(async () => {});
      },
    });
    // Eleven runs of ten pages each.
  }, 120_000);
});
