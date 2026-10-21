import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { ItemContent } from "@/components/ItemContent";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";

const mockSetOptions = jest.fn();
jest.mock("expo-router", () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: { useKefinTweaks: true } }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom({ Id: "user-1" }) };
});
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ getDownloadedItemById: () => undefined }),
}));
// Stable values: the page resets its selected options whenever they change.
jest.mock("@/hooks/useDefaultPlaySettings", () => {
  const defaults = { defaultBitrate: { key: "Max", value: undefined } };
  return { __esModule: true, default: () => defaults };
});
jest.mock("@/hooks/useImageColorsReturn", () => {
  const colors = {};
  return { useImageColorsReturn: () => colors };
});
jest.mock("@/hooks/useOrientation", () => ({
  useOrientation: () => ({ orientation: 1 }),
}));
jest.mock("@/hooks/useVersionItem", () => ({
  useVersionItemState: () => ({ versionItem: undefined, isPending: false }),
}));
jest.mock("@/packages/expo-screen-orientation", () => ({
  OrientationLock: { PORTRAIT_UP: 1 },
}));
jest.mock("@/utils/jellyfin/image/getLogoImageUrlById", () => ({
  getLogoImageUrlById: () => null,
}));

jest.mock("@/components/AddToKefinWatchlist", () => ({
  AddToKefinWatchlist: () => {
    const { Text } = jest.requireActual("react-native");
    return <Text>watchlist</Text>;
  },
}));

// The rest of the page has nothing to do with the header's offline mode. A
// function declaration, so the hoisted mock factories already find it.
function mockNothing() {
  return null;
}
jest.mock("@/components/AddToFavorites", () => ({
  AddToFavorites: mockNothing,
}));
jest.mock("@/components/AddToWatchlist", () => ({
  AddToWatchlist: mockNothing,
}));
jest.mock("@/components/Chromecast", () => ({ Chromecast: mockNothing }));
jest.mock("@/components/common/ItemImage", () => ({ ItemImage: mockNothing }));
jest.mock("@/components/common/ServerImage", () => ({ Image: mockNothing }));
jest.mock("@/components/DownloadItem", () => ({
  DownloadSingleItem: mockNothing,
}));
jest.mock("@/components/ItemCollections", () => ({
  ItemCollections: mockNothing,
}));
jest.mock("@/components/ItemHeader", () => ({ ItemHeader: mockNothing }));
jest.mock("@/components/ItemTechnicalDetails", () => ({
  ItemTechnicalDetails: mockNothing,
}));
jest.mock("@/components/item/ItemCredits", () => ({
  ItemCredits: mockNothing,
}));
jest.mock("@/components/item/ItemPeopleSections", () => ({
  ItemPeopleSections: mockNothing,
}));
jest.mock("@/components/MediaSourceButton", () => ({
  MediaSourceButton: mockNothing,
}));
jest.mock("@/components/OverviewText", () => ({ OverviewText: mockNothing }));
jest.mock("@/components/ParallaxPage", () => ({
  ParallaxScrollView: mockNothing,
}));
jest.mock("@/components/PlayButton", () => ({ PlayButton: mockNothing }));
jest.mock("@/components/PlayedStatus", () => ({ PlayedStatus: mockNothing }));
jest.mock("@/components/PlayInRemoteSession", () => ({
  PlayInRemoteSessionButton: mockNothing,
}));
jest.mock("@/components/SimilarItems", () => ({ SimilarItems: mockNothing }));
jest.mock("@/components/series/CurrentSeries", () => ({
  CurrentSeries: mockNothing,
}));
jest.mock("@/components/series/SeasonEpisodesCarousel", () => ({
  SeasonEpisodesCarousel: mockNothing,
}));
jest.mock("@/components/syncplay/SyncPlayButton", () => ({
  SyncPlayButton: mockNothing,
}));
jest.mock("@/components/syncplay/SyncPlayQueueButton", () => ({
  SyncPlayQueueButton: mockNothing,
}));

const movie: BaseItemDto = { Id: "movie-1", Name: "Movie", Type: "Movie" };

/** The header's buttons as the page last set them. */
const headerRight = () => {
  const options = mockSetOptions.mock.calls.at(-1)?.[0] as {
    headerRight: () => ReactElement;
  };
  return options.headerRight();
};

describe("ItemContent header", () => {
  beforeEach(() => mockSetOptions.mockClear());

  // The native stack renders headerRight outside the page, so the page's
  // OfflineModeProvider does not reach it: the watchlist button of a download
  // opened offline read online and stayed on screen (#2171).
  test("leaves the watchlist button out on a download opened offline", async () => {
    await render(
      <OfflineModeProvider isOffline>
        <ItemContent item={movie} itemWithSources={movie} />
      </OfflineModeProvider>,
    );

    // Rendered on its own, as the native header renders it.
    await render(headerRight());

    expect(screen.queryByText("watchlist")).toBeNull();
  });

  test("shows the watchlist button on a page that is online", async () => {
    await render(<ItemContent item={movie} itemWithSources={movie} />);

    await render(headerRight());

    expect(screen.getByText("watchlist")).toBeTruthy();
  });
});
