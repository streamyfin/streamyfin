// Spec for app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/livetv/guide.tsx,
// its layout against the window. It lives here rather than next to the page
// because Expo Router turns every file under app/ into a route.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { StyleSheet } from "react-native";
import type { TestInstance } from "test-renderer";
import LiveTvGuidePage from "@/app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/livetv/guide";
import { LIVE_TV_GUIDE_CHANNEL_COLUMN_WIDTH } from "@/constants/LiveTVGuide";
import { makeApi } from "@/test-utils/jellyfinApi";

let mockWindowWidth = 400;

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({
    width: mockWindowWidth,
    height: 800,
    scale: 1,
    fontScale: 1,
  }),
}));
jest.mock("@/providers/JellyfinProvider", () =>
  jest
    .requireActual("@/test-utils/jellyfinProvider")
    .makeJellyfinAtomsModule(null, { Id: "user-1" }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 16, right: 24 }),
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("@/test-utils/reanimated").reanimatedModule,
  __esModule: true,
}));
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) =>
    jest.requireActual("react").useEffect(effect, []),
  useSegments: () => [],
}));
jest.mock("@/components/common/ItemImage", () => ({ ItemImage: () => null }));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  itemRouter: jest.fn(),
}));
jest.mock("@/hooks/useAppRouter", () => () => ({ push: jest.fn() }));
jest.mock("@/hooks/useFavorite", () => ({
  useFavorite: () => ({ isFavorite: false, toggleFavorite: jest.fn() }),
}));
jest.mock("@/components/livetv/ChannelFavoriteSheet", () => ({
  useChannelFavoriteSheet: () => jest.fn(),
}));
jest.mock("@/components/livetv/LiveTVGuideRow", () => ({
  LiveTVGuideRow: () => null,
}));

/** The programs' scroll view: the one the page sizes itself. */
const programsViewportWidth = (root: TestInstance | null) => {
  const [scrollView] = root!.queryAll(
    (node) =>
      node.props?.horizontal === true &&
      StyleSheet.flatten(node.props.style)?.width !== undefined,
  );
  return scrollView && StyleSheet.flatten(scrollView.props.style).width;
};

const page = () => {
  const api = makeApi();
  api.mock.onGet(/\/LiveTv\/Channels\?/).reply(200, {
    Items: [{ Id: "channel-1", Name: "One", Type: "TvChannel" }],
    TotalRecordCount: 1,
  });
  api.mock.onPost(/\/LiveTv\/Programs$/).reply(200, { Items: [] });
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const store = createStore();
  const { apiAtom } = jest.requireMock("@/providers/JellyfinProvider");
  store.set(apiAtom, api);
  return () => (
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>
        <LiveTvGuidePage />
      </JotaiProvider>
    </QueryClientProvider>
  );
};

describe("LiveTvGuidePage layout", () => {
  beforeEach(() => {
    mockWindowWidth = 400;
  });

  test("sizes the programs to the window between the insets and the channels", async () => {
    const tree = page();
    const { root, rerender } = await render(tree());

    await waitFor(() =>
      expect(programsViewportWidth(root)).toBe(
        400 - 16 - 24 - LIVE_TV_GUIDE_CHANNEL_COLUMN_WIDTH,
      ),
    );

    mockWindowWidth = 520;
    await rerender(tree());

    expect(programsViewportWidth(root)).toBe(
      520 - 16 - 24 - LIVE_TV_GUIDE_CHANNEL_COLUMN_WIDTH,
    );
  });
});
