// Spec for app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/livetv/guide.tsx,
// its layout against the window. It lives here rather than next to the page
// because Expo Router turns every file under app/ into a route.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { StyleSheet } from "react-native";
import type { TestInstance } from "test-renderer";
import LiveTvGuidePage from "@/app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/livetv/guide";
import { LIVE_TV_GUIDE_PINNED_TITLE_MIN_WIDTH } from "@/constants/LiveTVGuide";

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
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(null),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 16, right: 24 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[] }) => ({
    data:
      options.queryKey[1] === "channels"
        ? {
            Items: [
              { Id: "channel-1", Name: "One", Type: "TvChannel" },
            ] as BaseItemDto[],
          }
        : {
            Items: [
              {
                Id: "program-1",
                Name: "Long Movie",
                ChannelId: "channel-1",
                StartDate: "2026-01-01T20:00:00Z",
                EndDate: "2026-01-01T21:45:00Z",
              },
            ] as BaseItemDto[],
          },
  }),
}));
jest.mock("@/components/common/ItemImage", () => ({ ItemImage: () => null }));
jest.mock("@/components/livetv/HourHeader", () => ({ HourHeader: () => null }));
jest.mock("../common/TouchableItemRouter", () => ({
  TouchableItemRouter: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const horizontalScrollView = (root: TestInstance | null) => {
  const [scrollView] = root!.queryAll(
    (node) => node.props?.horizontal === true,
  );
  return scrollView;
};

const scrollViewWidth = (root: TestInstance | null) =>
  StyleSheet.flatten(horizontalScrollView(root).props.style).width;

const marginLeftOf = () =>
  StyleSheet.flatten(screen.getByText("Long Movie").parent?.props?.style)
    ?.marginLeft;

const renderPage = () =>
  render(
    <JotaiProvider store={createStore()}>
      <LiveTvGuidePage />
    </JotaiProvider>,
  );

describe("LiveTvGuidePage layout", () => {
  beforeEach(() => {
    mockWindowWidth = 400;
    // Ten past the program's first hour, which the guide then starts at.
    jest.useFakeTimers({ now: new Date("2026-01-01T20:10:00Z") });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("sizes the guide viewport by window minus insets and keeps titles pinned", async () => {
    const { root, rerender } = await renderPage();

    expect(scrollViewWidth(root)).toBe(296);

    await fireEvent.scroll(horizontalScrollView(root), {
      nativeEvent: { contentOffset: { x: 30 } },
    });
    expect(screen.getByText("Long Movie")).toBeTruthy();
    expect(marginLeftOf()).toBe(30);

    mockWindowWidth = 520;
    await rerender(
      <JotaiProvider store={createStore()}>
        <LiveTvGuidePage />
      </JotaiProvider>,
    );

    expect(scrollViewWidth(root)).toBe(416);

    await fireEvent.scroll(horizontalScrollView(root), {
      nativeEvent: { contentOffset: { x: 300 } },
    });
    // 350 wide: the title stops short of the end, keeping its room.
    expect(marginLeftOf()).toBe(350 - LIVE_TV_GUIDE_PINNED_TITLE_MIN_WIDTH);
  });
});
