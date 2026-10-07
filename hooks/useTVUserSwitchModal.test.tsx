// Spec for app/(auth)/tv-user-switch-modal.tsx and the hook that opens it. It
// lives here rather than next to the page because Expo Router turns every file
// under app/ into a route.
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";
import { Provider } from "jotai";
import { Pressable, Text } from "react-native";
import TVUserSwitchModalPage from "@/app/(auth)/tv-user-switch-modal";
import { TVSheetTiming } from "@/constants/TVSheet";
import { useTVUserSwitchModal } from "@/hooks/useTVUserSwitchModal";
import type {
  SavedServer,
  SavedServerAccount,
} from "@/utils/secureCredentials";
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
/** How many times one press fires onPress, to stand for a remote that fires twice. */
let mockSelectFires = 1;
// The real card pulls the TV focus animation and, through it, the whole
// provider tree. The sheet only needs something to press.
const MockUserCard = (props: { username: string; onPress: () => void }) => (
  <Pressable
    onPress={() => {
      for (let fire = 0; fire < mockSelectFires; fire++) props.onPress();
    }}
  >
    <Text>{props.username}</Text>
  </Pressable>
);
jest.mock("@/components/tv/TVUserCard", () => ({
  TVUserCard: (props: { username: string; onPress: () => void }) =>
    MockUserCard(props),
}));

const account = (userId: string, username: string): SavedServerAccount => ({
  userId,
  username,
  securityType: "none",
  savedAt: 0,
});

const openSheet = async () => {
  const { result } = await renderHook(() => useTVUserSwitchModal());
  await act(async () => {
    result.current.showUserSwitchModal(
      {
        address: "http://jellyfin.test",
        name: "Home",
        accounts: [account("user-1", "Ada"), account("user-2", "Bea")],
      } satisfies SavedServer,
      "user-1",
      {
        onAccountSelect: (picked) => {
          mockCalls.push(`select ${picked.username}`);
        },
      },
    );
  });
  // The app reads its atoms from this store, through the provider at its root.
  await render(
    <Provider store={store}>
      <TVUserSwitchModalPage />
    </Provider>,
  );
  // The cards mount once the sheet has laid out.
  await act(async () => {
    jest.advanceTimersByTime(TVSheetTiming.contentDelayMs);
  });
};

describe("TV user switch sheet", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCalls.length = 0;
    mockSelectFires = 1;
  });
  afterEach(() => jest.useRealTimers());

  test("switches to the account, then closes", async () => {
    await openSheet();

    await fireEvent.press(screen.getByText("Bea"));
    expect(mockCalls).toEqual(["select Bea", "back"]);
  });

  // One remote select on Android TV can fire onPress twice in the same JS
  // batch (react-native-tvos#110/#138, see useAppRouter). The switch would run
  // twice and a second router.back() would pop the screen under the sheet.
  test("switches and closes once when one select fires twice", async () => {
    mockSelectFires = 2;
    await openSheet();

    await fireEvent.press(screen.getByText("Bea"));
    expect(mockCalls).toEqual(["select Bea", "back"]);
  });
});
