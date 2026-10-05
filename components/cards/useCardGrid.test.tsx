import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import { PixelRatio } from "react-native";
import { useCardGrid } from "./useCardGrid";

const mockWindow = { width: 430, height: 932, scale: 3, fontScale: 1 };

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockWindow,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  // The cards are built from the api's base path; nothing is requested.
  return { apiAtom: atom({ basePath: "http://server" }) };
});
jest.mock("expo-router", () => ({ useSegments: () => [] }));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: () => {} }),
}));
// Navigation and the long-press sheet are not what is under test.
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => "",
  itemRouter: () => "",
}));
jest.mock("@/components/common/ItemActionSheetHost", () => ({
  ItemActionSheetHost: () => null,
}));
jest.mock("./Card", () => ({ Card: () => null }));

const MOVIE: BaseItemDto = {
  Id: "movie-1",
  Type: "Movie",
  Name: "Example Movie",
  ImageTags: { Primary: "poster-tag" },
  BackdropImageTags: [],
};

const fillWidthOf = async (columns: number) => {
  const { result } = await renderHook(() =>
    useCardGrid({ items: [MOVIE], columns }),
  );
  return new URL(result.current.data[0].imageUrl ?? "").searchParams.get(
    "fillWidth",
  );
};

afterEach(() => {
  jest.restoreAllMocks();
});

// Issue #2166: a grid sizes its cards by the column count, but the artwork was
// requested for the narrower row card whatever the grid drew.
describe("useCardGrid artwork size", () => {
  test("requests artwork for the width of its columns", async () => {
    jest.spyOn(PixelRatio, "get").mockReturnValue(3);

    // 430 points less the insets and the gutter, over two columns: 194 points.
    expect(await fillWidthOf(2)).toBe("600");
    // Over three: 126 points.
    expect(await fillWidthOf(3)).toBe("400");
  });
});
