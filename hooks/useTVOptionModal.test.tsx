// Spec for app/(auth)/tv-option-modal.tsx and the hook that opens it. It lives
// here rather than next to the page because Expo Router turns every file under
// app/ into a route.
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";
import { Provider } from "jotai";
import { Pressable, Text } from "react-native";
import TVOptionModal from "@/app/(auth)/tv-option-modal";
import { TVSheetTiming } from "@/constants/TVSheet";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
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
/** The sheet's back and menu handler, as it last handed it over. */
let mockBackPress: () => boolean | null | undefined = () => false;
jest.mock("@/hooks/useTVBackPress", () => ({
  useTVBackPress: (handler: () => boolean | null | undefined) => {
    mockBackPress = handler;
  },
}));
// The real scale reads the settings atom, which loads the whole settings UI.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 20 }),
}));
/** How many times one press fires onPress, to stand for a remote that fires twice. */
let mockSelectFires = 1;
// The real card pulls the TV focus animation and, through it, the whole
// provider tree. The sheet only needs something to press.
const MockOptionCard = (props: { label: string; onPress: () => void }) => (
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
    MockOptionCard(props),
}));

const openSheet = async (
  deferApplyUntilDismissed: boolean,
  onSelect = (value: string) => {
    mockCalls.push(`select ${value}`);
  },
) => {
  const { result } = await renderHook(() => useTVOptionModal());
  await act(async () => {
    result.current.showOptions({
      title: "Audio",
      options: [
        { label: "English", value: "eng", selected: true },
        { label: "French", value: "fre", selected: false },
      ],
      onSelect,
      deferApplyUntilDismissed,
    });
  });
  // The app reads its atoms from this store, through the provider at its root.
  await render(
    <Provider store={store}>
      <TVOptionModal />
    </Provider>,
  );
  // The cards mount once the sheet has laid out.
  await act(async () => {
    jest.advanceTimersByTime(TVSheetTiming.contentDelayMs);
  });
};

describe("TV option sheet", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCalls.length = 0;
    mockSelectFires = 1;
  });
  afterEach(() => jest.useRealTimers());

  // A choice that navigates (the player's audio or quality switch while
  // transcoding) fired while the sheet is the active route would be
  // swallowed, so the sheet closes first and the choice lands right after the
  // press, on the timing the player was tested with.
  test("closes first and applies a navigating choice once the press has returned", async () => {
    await openSheet(true);

    const pressed = fireEvent.press(screen.getByText("French"));
    expect(mockCalls).toEqual(["back"]);

    await pressed;
    expect(mockCalls).toEqual(["back", "select fre"]);
  });

  // State-only callers (detail page, filters, settings) re-render while the
  // sheet is still up, so TV focus does not jump after it closes.
  test("applies a state-only choice before closing", async () => {
    await openSheet(false);

    await fireEvent.press(screen.getByText("French"));
    expect(mockCalls).toEqual(["select fre", "back"]);
  });

  // One remote select on Android TV can fire onPress twice in the same JS
  // batch (react-native-tvos#110/#138, see useAppRouter). A second
  // router.back() would pop the screen under the sheet as well.
  test("closes and applies once when one select fires twice", async () => {
    mockSelectFires = 2;
    await openSheet(true);

    await fireEvent.press(screen.getByText("French"));
    expect(mockCalls).toEqual(["back", "select fre"]);
  });

  test("closes and applies once when one select fires twice on a state-only sheet", async () => {
    mockSelectFires = 2;
    await openSheet(false);

    await fireEvent.press(screen.getByText("French"));
    expect(mockCalls).toEqual(["select fre", "back"]);
  });

  // The back and menu press closes through the same guard as a choice.
  test("closes once when back follows a choice", async () => {
    await openSheet(false);

    await fireEvent.press(screen.getByText("French"));
    await act(async () => {
      mockBackPress();
    });
    expect(mockCalls).toEqual(["select fre", "back"]);
  });

  test("closes once when back fires twice", async () => {
    await openSheet(false);

    await act(async () => {
      mockBackPress();
      mockBackPress();
    });
    expect(mockCalls).toEqual(["back"]);
  });

  // The guard is spent before the choice runs: a choice that throws must still
  // close the sheet, or it stays open and ignores every press, back included.
  test("still closes when the choice throws", async () => {
    await openSheet(false, () => {
      throw new Error("choice failed");
    });

    await expect(fireEvent.press(screen.getByText("French"))).rejects.toThrow(
      "choice failed",
    );
    expect(mockCalls).toEqual(["back"]);
  });
});
