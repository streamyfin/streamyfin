// Spec for app/(auth)/tv-series-season-modal.tsx and the hook that opens it.
// It lives here rather than next to the page because Expo Router turns every
// file under app/ into a route.
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";
import { Provider } from "jotai";
import { Pressable, Text } from "react-native";
import TVSeriesSeasonModalPage from "@/app/(auth)/tv-series-season-modal";
import { TVSheetTiming } from "@/constants/TVSheet";
import { useTVSeriesSeasonModal } from "@/hooks/useTVSeriesSeasonModal";
import { store } from "@/utils/store";

/** What reached the router and the caller, in order. */
const mockCalls: string[] = [];
const mockRouter = {
  back: jest.fn(() => {
    mockCalls.push("back");
  }),
  push: jest.fn(),
};
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => mockRouter,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The real scale reads the settings atom, which loads the whole settings UI.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 20, heading: 28 }),
}));
/** How many times one press fires onPress, to stand for a remote that fires twice. */
let mockSelectFires = 1;
// The real cards pull the TV focus animation and, through it, the whole
// provider tree. The sheet only needs something to press.
const MockCard = (props: { label: string; onPress: () => void }) => (
  <Pressable
    onPress={() => {
      for (let fire = 0; fire < mockSelectFires; fire++) props.onPress();
    }}
  >
    <Text>{props.label}</Text>
  </Pressable>
);
jest.mock("@/components/tv", () => ({
  TVOptionCard: (props: { label: string; onPress: () => void }) =>
    MockCard(props),
  TVCancelButton: (props: { label: string; onPress: () => void }) =>
    MockCard(props),
}));

const openSheet = async () => {
  const { result } = await renderHook(() => useTVSeriesSeasonModal());
  await act(async () => {
    result.current.showSeasonModal({
      seasons: [
        { label: "Season 1", value: 0, selected: true },
        { label: "Season 2", value: 1, selected: false },
      ],
      selectedSeasonIndex: 0,
      itemId: "series-1",
      onSeasonSelect: (seasonIndex: number) => {
        mockCalls.push(`select ${seasonIndex}`);
      },
    });
  });
  // The app reads its atoms from this store, through the provider at its root.
  await render(
    <Provider store={store}>
      <TVSeriesSeasonModalPage />
    </Provider>,
  );
  // The cards mount once the sheet has laid out.
  await act(async () => {
    jest.advanceTimersByTime(TVSheetTiming.contentDelayMs);
  });
};

describe("TV season sheet", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCalls.length = 0;
    mockSelectFires = 1;
  });
  afterEach(() => jest.useRealTimers());

  test("applies the season, then closes", async () => {
    await openSheet();

    await fireEvent.press(screen.getByText("Season 2"));
    expect(mockCalls).toEqual(["select 1", "back"]);
  });

  // One remote select on Android TV can fire onPress twice in the same JS
  // batch (react-native-tvos#110/#138, see useAppRouter). A second
  // router.back() would pop the series page under the sheet as well.
  test("applies and closes once when one select fires twice", async () => {
    mockSelectFires = 2;
    await openSheet();

    await fireEvent.press(screen.getByText("Season 2"));
    expect(mockCalls).toEqual(["select 1", "back"]);
  });

  test("closes once when one cancel fires twice", async () => {
    mockSelectFires = 2;
    await openSheet();

    await fireEvent.press(screen.getByText("common.cancel"));
    expect(mockCalls).toEqual(["back"]);
  });
});
