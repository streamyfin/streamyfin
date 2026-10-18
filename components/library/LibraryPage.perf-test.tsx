import { QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react-native";
import { createStore, getDefaultStore, Provider as JotaiProvider } from "jotai";
import { type ReactNode, useState } from "react";
import { measureRenders } from "reassure";
import LibraryPage from "@/app/(auth)/(tabs)/(libraries)/[libraryId]";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeItems } from "@/test-utils/baseItems";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { reachListEnd } from "@/test-utils/lists";
import { usePerfQueryClient } from "@/test-utils/queryWrapper";
import {
  genreFilterAtom,
  SortByOption,
  sortByAtom,
} from "@/utils/atoms/filters";

jest.mock("expo-router", () => ({
  ...jest.requireActual("@/test-utils/expoRouter").expoRouterModule,
  useLocalSearchParams: () => ({ libraryId: "movies-1" }),
}));
// Reach the player and other screens; nothing this scenario measures.
jest.mock("@/hooks/useLibraryPlayQueue", () => ({
  useLibraryPlayQueue: () => ({
    playAll: () => {},
    shuffle: () => {},
    isStarting: false,
  }),
}));
jest.mock("@/hooks/useTVItemActionModal", () => ({
  useTVItemActionModal: () => ({ showItemActions: () => {} }),
}));
jest.mock("@/hooks/useTVLibrarySheet", () => ({
  useTVLibrarySheet: () => ({ openSheet: () => {} }),
}));
jest.mock(
  "@/providers/GlobalModalProvider",
  () => jest.requireActual("@/test-utils/appProviders").globalModalModule,
);
jest.mock("@/hooks/useRefreshLibraryOnFocus", () => ({
  useRefreshLibraryOnFocus: () => {},
}));
jest.mock("@/hooks/useOrientation", () => ({
  useOrientation: () => ({ isLandscape: false, orientation: 1 }),
}));
jest.mock("@/hooks/useServerVersion", () => ({
  useServerVersion: () => "10.9.0",
}));

const allItems = makeItems(100, "Movie");
const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

const stubServer = () => {
  api.mock.reset();
  api.mock.onGet(/\/System\/Info\/Public/).reply(200, { Version: "10.9.0" });
  api.mock.onGet(/\/Items\/movies-1/).reply(200, {
    Id: "movies-1",
    Name: "Movies",
    CollectionType: "movies",
  });
  api.mock.onGet(/\/Users\/.*\/Items\/movies-1/).reply(200, {
    Id: "movies-1",
    Name: "Movies",
    CollectionType: "movies",
  });
  api.mock.onGet(/\/Items\/Filters2/).reply(200, {
    Genres: ["Action", "Comedy", "Drama"],
    Years: [2024, 2023, 2022],
    Tags: [],
  });
  api.mock.onGet(/\/Items/).reply((config) => {
    const url = new URL(config.url!, "http://server");
    const startIndex = parseInt(url.searchParams.get("startIndex") || "0", 10);
    const limit = parseInt(url.searchParams.get("limit") || "36", 10);
    const items = allItems.slice(startIndex, startIndex + limit);
    return [200, { Items: items, TotalRecordCount: 100 }];
  });
};

let activeStore: ReturnType<typeof createStore>;

const Wrapper = ({ children }: { children: ReactNode }) => {
  const [store] = useState(() => {
    const s = createStore();
    activeStore = s;
    return s;
  });
  const client = usePerfQueryClient();

  return (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </JotaiProvider>
  );
};

describe("LibraryPage Performance", () => {
  beforeEach(() => {
    stubServer();
  });

  test("the library grid loads and responds to filter and page changes", async () => {
    await measureRenders(<LibraryPage />, {
      wrapper: Wrapper,
      beforeEach: stubServer,
      scenario: async () => {
        // Wait for initial page to mount and load
        await screen.findByText("Movie 0");

        // 1. Change sort atom
        await act(async () => {
          activeStore.set(sortByAtom, [SortByOption.DateCreated]);
        });
        await screen.findByText("Movie 0");

        // 2. Toggle one genre filter atom
        await act(async () => {
          activeStore.set(genreFilterAtom, ["Action"]);
        });
        await screen.findByText("Movie 0");

        // 3. Append a page
        await reachListEnd();

        // Wait for appended page item
        await screen.findByText("Movie 36");
      },
    });
  });
});
