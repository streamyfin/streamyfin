import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { measureRenders } from "reassure";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { QueryWrapper } from "@/test-utils/queryWrapper";
import { Home } from "./Home.tv";

type HomeSettings = Record<string, unknown>;

let mockSettings: HomeSettings = {};

jest.mock("@/utils/atoms/settings", () => {
  const actual = jest.requireActual("@/utils/atoms/settings");
  return {
    ...actual,
    useSettings: () => ({
      settings: { ...actual.defaultValues, ...mockSettings },
      updateSettings: () => {},
      pluginSettings: undefined,
    }),
  };
});
jest.mock("@/providers/JellyfinProvider", () => ({
  ...jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
  cacheVersionAtom: jest.requireActual("jotai").atom(0),
}));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isConnected: true,
    serverConnected: true,
    loading: false,
    retryCheck: () => {},
  }),
}));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => "/items/page",
}));
jest.mock("@/hooks/useAppRouter", () => () => ({ push: () => {} }));
jest.mock(
  "@/hooks/useTVItemActionModal",
  () =>
    jest.requireActual("@/test-utils/tvItemActionModal")
      .tvItemActionModalModule,
);
// Navigation focus listeners, the downloads behind cache invalidation and the
// hidden library migration: none of them runs on a focus move.
jest.mock("@/hooks/useRefreshLibraryOnFocus", () => ({
  useRefreshLibraryOnFocus: () => {},
}));
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => () => {},
}));
jest.mock("@/hooks/useRemapHiddenLibraries", () => ({
  useRemapHiddenLibraries: () => {},
}));
// Writes to the native Top Shelf.
jest.mock("@/utils/tvDiscovery/sync", () => ({
  updateTVDiscovery: () => {},
}));
// Decoding happens in native code, which this measurement cannot see; the
// element stays so its renders are counted, named after the URL it loads so a
// hero card, which draws no text, can be found by its artwork.
jest.mock(
  "@/components/common/ServerImage",
  () => jest.requireActual("@/test-utils/serverImage").serverImageModule,
);

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

const ROW_LENGTH = 10;
const BACKDROP_DEBOUNCE_MS = 300;

const items = (prefix: string, type: "Movie" | "Episode"): BaseItemDto[] =>
  Array.from({ length: ROW_LENGTH }, (_, index) => ({
    Id: `${prefix}-${index}`,
    Name: `${prefix} ${index}`,
    Type: type,
    SeriesName: type === "Episode" ? `${prefix} series ${index}` : undefined,
    ImageTags: { Primary: `tag-${prefix}-${index}` },
    BackdropImageTags: [`backdrop-${prefix}-${index}`],
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
  api.mock.onGet(/\/Items\/Latest/).reply((config) => [
    200,
    // The SDK writes the query into the URL.
    new URL(config.url!).searchParams.get("parentId") === "shows"
      ? items("LatestShow", "Episode")
      : items("LatestMovie", "Movie"),
  ]);
  api.mock
    .onGet(/\/Items\/Suggestions/)
    .reply(200, { Items: items("Suggested", "Movie") });
};

type Card = ReturnType<typeof screen.getByTestId>;

/**
 * Moves focus onto each card in turn, as the remote would: the card it leaves
 * blurs, the next one focuses. Events go to a card's artwork, which sits
 * inside its pressable; a title is drawn outside it, below the poster.
 */
const focusAlong = async (cards: (() => Card)[]) => {
  let previous: Card | undefined;
  for (const card of cards) {
    const next = card();
    if (previous) await fireEvent(previous, "blur");
    await fireEvent(next, "focus");
    await act(async () => {
      jest.advanceTimersByTime(BACKDROP_DEBOUNCE_MS);
    });
    previous = next;
  }
};

/** A card's artwork, by the id of its item; the backdrop is left out. */
const artwork = (itemId: string) => () =>
  screen.getByTestId(new RegExp(`/Items/${itemId}/Images/(?!Backdrop)`));

/** The first `count` cards of a row, or of the hero. */
const along = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => artwork(`${prefix}-${index}`));

const withSettings = (overrides: Partial<HomeSettings>) => {
  mockSettings = overrides;
};

beforeEach(() => {
  stubServer();
});

describe("TV Home", () => {
  test("focus moves across the hero, then along two rows", async () => {
    withSettings({ showHeroCarousel: true });

    await measureRenders(<Home />, {
      wrapper: QueryWrapper,
      scenario: async () => {
        await screen.findAllByText("LatestMovie 0");
        await focusAlong([
          ...along("Resume", 3),
          ...along("LatestMovie", 4),
          ...along("LatestShow", 4),
        ]);
      },
    });
  });

  test("focus moves along two rows with the hero hidden and the backdrop on", async () => {
    withSettings({ showHeroCarousel: false, showHomeBackdrop: true });

    await measureRenders(<Home />, {
      wrapper: QueryWrapper,
      scenario: async () => {
        await screen.findAllByText("Resume 0");
        await focusAlong([...along("Resume", 4), ...along("LatestMovie", 4)]);
      },
    });
  });

  test("focus moves along two rows with the hero hidden and the backdrop off", async () => {
    withSettings({ showHeroCarousel: false, showHomeBackdrop: false });

    await measureRenders(<Home />, {
      wrapper: QueryWrapper,
      scenario: async () => {
        await screen.findAllByText("Resume 0");
        await focusAlong([...along("Resume", 4), ...along("LatestMovie", 4)]);
      },
    });
  });

  test("sits idle for five polling intervals", async () => {
    withSettings({ showHeroCarousel: true });

    await measureRenders(<Home />, {
      wrapper: QueryWrapper,
      scenario: async () => {
        await screen.findAllByText("LatestMovie 0");
        for (let minute = 0; minute < 5; minute++) {
          await act(async () => {
            jest.advanceTimersByTime(60 * 1000);
          });
        }
      },
    });
  });
});
