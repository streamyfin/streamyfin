import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { TV_TOP_PADDING } from "@/constants/Values";
import { TVWatchlists } from "./TVWatchlists";

// Not zero, so the padding shows up added to the inset, not in its place.
const mockInsets = { top: 12, bottom: 0, left: 0, right: 0 };

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets,
}));
// What scaleSize does on a 960x540 Android TV: a scaled padding is half of
// an unscaled one there.
jest.mock("@/utils/scaleSize", () => ({
  scaleSize: (size: number) => size / 2,
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({}), userAtom: atom({ Id: "me" }) };
});
jest.mock("@/hooks/useWatchlists", () => ({
  useWatchlistsQuery: () => ({
    data: [{ id: 1, name: "My list", userId: "me", isPublic: true }],
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));
// A row is its title and the toggle its labels: only where the first one sits
// is under test, not their own layout.
jest.mock("@/components/home/InfiniteScrollingCollectionList.tv", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    InfiniteScrollingCollectionList: ({ title }: { title: string }) => (
      <Text>{title}</Text>
    ),
  };
});
jest.mock("@/components/tv", () => {
  const { Text, View } = jest.requireActual("react-native");
  return {
    TVSegmentedControl: ({
      options,
    }: {
      options: { value: string; label: string }[];
    }) => (
      <View>
        {options.map((option) => (
          <Text key={option.value}>{option.label}</Text>
        ))}
      </View>
    ),
  };
});
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: jest.fn() }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ heading: 32, callout: 26, body: 24 }),
}));
jest.mock("@/components/tv/hooks/useTVFocusAnimation", () => ({
  useTVFocusAnimation: () => ({
    focused: false,
    handleFocus: () => {},
    handleBlur: () => {},
    animatedStyle: {},
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderTab = (sources: {
  streamystatsShown: boolean;
  kefinShown: boolean;
}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TVWatchlists {...sources} />
    </QueryClientProvider>,
  );

/** How far below the top of the tab a text sits: the top paddings above it. */
const topPaddingAbove = (text: string) => {
  let total = 0;
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText(text);
  while (node) {
    for (const style of [node.props.style, node.props.contentContainerStyle]) {
      total += Number(StyleSheet.flatten(style)?.paddingTop ?? 0);
    }
    node = node.parent;
  }
  return total;
};

// Depending on the sources enabled, the tab opens on the Streamystats list,
// the KefinTweaks watchlist (the Favorites screen) or the toggle between the
// two. Two of them took a scaled top padding, so on Android TV the content
// moved by 50 dp whenever a source was turned on or off.
test.each([
  [
    "Streamystats alone",
    { streamystatsShown: true, kefinShown: false },
    "watchlists.my_watchlists",
  ],
  [
    "KefinTweaks alone",
    { streamystatsShown: false, kefinShown: true },
    "favorites.series",
  ],
  [
    "both sources",
    { streamystatsShown: true, kefinShown: true },
    "watchlists.source_streamystats",
  ],
])(
  "starts the tab's content at one top padding with %s",
  async (_label, sources, first) => {
    await renderTab(sources);
    expect(topPaddingAbove(first)).toBe(mockInsets.top + TV_TOP_PADDING);
  },
);
