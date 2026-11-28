import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { PixelRatio } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { router } from "@/test-utils/expoRouter";
import { makeApi } from "@/test-utils/jellyfinApi";
import { CurrentSeries } from "./CurrentSeries";

// The session is the real atoms, seeded: the card's image is built from the
// api's base path.
jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/realSessionAtoms"),
);
// No navigator above the row, so no navigation context to gate the press.
jest.mock(
  "expo-router/react-navigation",
  () => jest.requireActual("@/test-utils/expoRouter").reactNavigationModule,
);
// The long-press sheet chain reaches native download modules; cards mode
// never opens one.
jest.mock("@/components/common/ItemActionSheetHost", () => ({
  ItemActionSheetHost: () => null,
}));
// The sheet's transitive imports require the native downloader at module load.
jest.mock("@/modules", () => ({ BackgroundDownloader: {} }));

const api = makeApi();
const base = api.basePath;

const episode = {
  Id: "episode",
  Type: "Episode",
  SeriesId: "series",
  SeriesName: "Severance",
  SeriesPrimaryImageTag: "series-v1",
  ParentId: "parent",
  SeasonId: "season",
} satisfies BaseItemDto;

// The card is the portrait width at the pinned density: 118pt * 2, rounded up.
const SERIES_POSTER = `${base}/Items/series/Images/Primary?fillWidth=300&quality=90`;

beforeEach(() => {
  getDefaultStore().set(apiAtom, api);
  jest.spyOn(PixelRatio, "get").mockReturnValue(2);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("CurrentSeries", () => {
  test("the card requests the series' tagged poster, not the parent id untagged", async () => {
    await render(<CurrentSeries item={episode} />);

    expect(
      screen.getByTestId(`image ${SERIES_POSTER}&tag=series-v1`),
    ).toBeTruthy();
  });

  test("a new tag asks for the new image, not the cached one", async () => {
    const view = await render(<CurrentSeries item={episode} />);
    await view.rerender(
      <CurrentSeries item={{ ...episode, SeriesPrimaryImageTag: "v2" }} />,
    );

    expect(screen.getByTestId(`image ${SERIES_POSTER}&tag=v2`)).toBeTruthy();
  });

  test("pressing the card opens the series page", async () => {
    await render(<CurrentSeries item={episode} />);

    await fireEvent.press(screen.getByText("Severance"));

    expect(router.push).toHaveBeenCalledWith("/series/series");
  });
});
