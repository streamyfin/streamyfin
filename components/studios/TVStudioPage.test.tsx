import { fireEvent, render, screen } from "@testing-library/react-native";
import { TVStudioPage } from "./TVStudioPage";

const mockLoadMore = jest.fn();

jest.mock("@/hooks/useStudioItems", () => ({
  useStudioItems: () => ({
    studio: { Name: "Ghibli" },
    items: [{ Id: "a", Name: "a" }],
    isLoading: false,
    loadMore: mockLoadMore,
  }),
}));
// The poster is not what is under test, and it reaches for native modules.
jest.mock("@/components/tv/TVPosterCard", () => ({
  TVPosterCard: () => null,
}));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => "/",
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: jest.fn() }),
}));
jest.mock("@/hooks/useTVItemActionModal", () => ({
  useTVItemActionModal: () => ({ showItemActions: jest.fn() }),
}));
jest.mock("@/constants/TVSizes", () => ({
  TV_GRID_LOAD_MORE_DISTANCE: 600,
  useScaledTVSizes: () => ({
    padding: { horizontal: 60 },
    gaps: { item: 24 },
    posters: { poster: 300 },
  }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ title: 40, body: 24 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const SCREEN_HEIGHT = 1080;

const layOut = async (contentHeight: number) => {
  await render(<TVStudioPage studioId='studio-1' />);
  const list = screen.getByTestId("studio-grid");
  await fireEvent(list, "layout", {
    nativeEvent: { layout: { height: SCREEN_HEIGHT } },
  });
  await fireEvent(list, "contentSizeChange", 1920, contentHeight);
};

describe("TVStudioPage", () => {
  beforeEach(() => mockLoadMore.mockClear());

  // The next page is asked for on scroll, and a grid no taller than the
  // screen never scrolls: at the smallest poster size a page fits on it.
  test("asks for the next page when the first does not fill the screen", async () => {
    await layOut(SCREEN_HEIGHT - 200);

    expect(mockLoadMore).toHaveBeenCalled();
  });

  test("leaves a grid taller than the screen to its scrolling", async () => {
    await layOut(SCREEN_HEIGHT * 2);

    expect(mockLoadMore).not.toHaveBeenCalled();
  });
});
