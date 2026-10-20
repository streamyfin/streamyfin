// Spec for app/(auth)/(tabs)/(libraries)/[libraryId].tsx. It lives here rather
// than next to the page because Expo Router turns every file under app/ into a
// route. Only what the page asks the server for is under test: the layout
// around it is stubbed.
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";

const mockParams: { current: Record<string, unknown> } = { current: {} };
const mockWriteToLog = jest.fn();

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useLocalSearchParams: () => mockParams.current,
    useNavigation: () => ({
      setOptions: () => {},
      getState: () => ({ routes: [] }),
      reset: () => {},
    }),
    // Focused once, on mount.
    useFocusEffect: (effect: () => undefined | (() => void)) =>
      useEffect(() => effect(), [effect]),
  };
});
jest.mock("expo-router/react-navigation", () => ({
  useHeaderHeight: () => 0,
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom({ Id: "user-1" }) };
});
jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: () => {}, hideModal: () => {} }),
}));
// The filter chips stay real, for what they ask for. Their sheet is handed to
// the modal, never rendered here.
jest.mock("@/components/filters/FilterSheetContent", () => ({
  FilterSheetContent: () => null,
}));
// The log reaches Sentry, so it is stubbed with what the page and the
// settings it reads call.
jest.mock("@/utils/log", () => ({
  writeToLog: (...args: unknown[]) => mockWriteToLog(...args),
  logAndCaptureError: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
}));
// The settings only read its table of bitrates. The component pulls in the
// bottom sheet, which needs the native worklets.
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The list renders its header, where the phone keeps the filter bar, and
// what it shows when empty.
jest.mock("@shopify/flash-list", () => ({
  FlashList: ({
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    ListHeaderComponent?: ReactNode;
    ListEmptyComponent?: ReactNode;
  }) => (
    <>
      {ListHeaderComponent}
      {ListEmptyComponent}
    </>
  ),
}));
jest.mock("@/hooks/useServerVersion", () => ({
  useServerVersion: () => undefined,
}));
jest.mock("@/hooks/useRefreshLibraryOnFocus", () => ({
  useRefreshLibraryOnFocus: () => {},
}));
jest.mock("@/hooks/useOrientation", () => ({
  useOrientation: () => ({ orientation: 1 }),
}));
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
jest.mock("@/components/cards/useCardGrid", () => ({
  useCardGrid: () => ({
    data: [],
    renderItem: () => null,
    keyExtractor: () => "",
    rowGap: 0,
    actionSheet: null,
  }),
}));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => ({}),
}));
jest.mock("@/components/common/HeaderButton", () => ({
  HeaderButton: () => null,
}));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
jest.mock("@/components/filters/ResetFiltersButton", () => ({
  ResetFiltersButton: () => null,
}));
jest.mock("@/components/library/AlphabetRail", () => ({
  AlphabetRail: () => null,
}));
jest.mock("@/components/library/LibraryPlayButtons", () => ({
  LibraryPlayButtons: () => null,
}));
jest.mock("@/components/library/LibraryTabs", () => ({
  LibraryTabs: () => null,
}));
jest.mock("@/components/library/TVLibraryTabs", () => ({
  TVLibraryTabs: () => null,
}));
jest.mock("@/components/library/TVLibraryToolbar", () => ({
  TVLibraryToolbar: () => null,
}));
jest.mock("@/components/tv", () => ({ TVFocusablePoster: () => null }));
jest.mock("@/components/tv/TVPosterCard", () => ({ TVPosterCard: () => null }));

const LIBRARY_ID = "f137a2dd21bbc1b99aa5c0f6bf02a805";

// What Jellyfin answered in Sentry REACT-NATIVE-EM and EN.
const VALIDATION_PROBLEM = {
  title: "One or more validation errors occurred.",
  status: 400,
  errors: { itemId: ["The value is not valid."] },
};

const libraryServer = () => {
  const api = makeApi();
  api.mock.onGet(/\/Items\/Filters\?/).reply(200, { Genres: [], Years: [] });
  api.mock
    .onGet(new RegExp(`/Items/${LIBRARY_ID}\\?`))
    .reply(200, { Id: LIBRARY_ID, Name: "Films", CollectionType: "movies" });
  api.mock.onGet(/\/Items\/[^/?]+\?/).reply(400, VALIDATION_PROBLEM);
  api.mock.onGet(/\/Items\?/).reply(200, { Items: [], TotalRecordCount: 0 });
  return api;
};

const renderLibrary = async (libraryId: unknown) => {
  mockParams.current = { libraryId };
  const api = libraryServer();
  const errors: Error[] = [];
  // No retry, and nothing collected: either keeps Jest from exiting.
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => errors.push(error) }),
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const store = createStore();
  store.set(apiAtom, api as never);
  // Required here so the platform each test sets is the one the page sees.
  const LibraryPage =
    require("@/app/(auth)/(tabs)/(libraries)/[libraryId]").default;
  await render(
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>
        <LibraryPage />
      </JotaiProvider>
    </QueryClientProvider>,
  );
  // Lets the queries started on mount, and the ones they unlock, settle.
  await act(async () => {});
  await act(async () => {});
  return { requested: api.mock.history.get.map((get) => get.url), errors };
};

beforeEach(() => {
  mockWriteToLog.mockClear();
});

describe.each([
  ["phone", false],
  ["TV", true],
])("on a %s", (_platform, isTV) => {
  beforeEach(() => stubReactNative({ OS: "android", isTV }));

  // Sentry REACT-NATIVE-EM and EN: the music notification's link reached this
  // route as the library "notification.click", which was asked for as an item,
  // then as the parent of the filters.
  test("asks the server for nothing when the library id is not one", async () => {
    const { requested, errors } = await renderLibrary("notification.click");

    expect(requested).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("says the screen does not exist instead", async () => {
    await renderLibrary("notification.click");

    expect(screen.getByText("not_found.title")).toBeTruthy();
  });

  test("still asks for a library named by its id", async () => {
    const { requested, errors } = await renderLibrary(LIBRARY_ID);

    // The TV asks for its filters alongside the library, not after it.
    expect(requested).toContainEqual(
      expect.stringContaining(`/Items/${LIBRARY_ID}?`),
    );
    expect(errors).toEqual([]);
  });
});

test("logs what the refused id looked like, never the id itself", async () => {
  stubReactNative({ OS: "android" });
  await renderLibrary("notification.click");

  expect(mockWriteToLog).toHaveBeenCalledTimes(1);
  const [level, message] = mockWriteToLog.mock.calls[0];
  expect(level).toBe("WARN");
  expect(message).toContain("libraryId (string of length 18)");
  expect(message).not.toContain("notification.click");
});

// A param repeated in a url reaches the screen as an array.
test("asks for nothing when the library id arrives as a list", async () => {
  stubReactNative({ OS: "android" });
  const { requested } = await renderLibrary([LIBRARY_ID, LIBRARY_ID]);

  expect(requested).toEqual([]);
});
