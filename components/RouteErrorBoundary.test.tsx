import { Slot, Stack } from "expo-router";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { useState } from "react";
import { Text } from "react-native";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const mockCaptureException = jest.fn();
jest.mock("@sentry/react-native", () => ({
  captureException: (error: unknown) => mockCaptureException(error),
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// Only the layout's stand-in renders here; these would load the providers.
jest.mock("@/components/tv/TVNavBar", () => ({ TVNavBar: () => null }));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));
jest.mock("@/components/music/MiniPlayerBar", () => ({
  MiniPlayerBar: () => null,
}));
jest.mock("@/components/music/MusicPlaybackEngine", () => ({
  MusicPlaybackEngine: () => null,
}));

// The tabs layout's real exports around a stand-in navigator: NativeTabs needs
// the native tab bar, which Jest does not have.
const tabsLayout = jest.requireActual("@/app/(auth)/(tabs)/_layout");

// The tab bar and the state it holds: a press counter, which a remount of the
// navigator would set back to zero.
function TabBarStandIn() {
  const [presses, setPresses] = useState(0);
  return (
    <Text onPress={() => setPresses((count) => count + 1)}>
      {`Tab bar ${presses}`}
    </Text>
  );
}

let mockBroken = true;
function BrokenScreen() {
  if (mockBroken) {
    throw new Error("The library failed to load");
  }
  return <Text>Library</Text>;
}

const renderTabs = () =>
  renderRouter(
    {
      "(tabs)/_layout": {
        ...tabsLayout,
        default: () => (
          <>
            <Slot />
            <TabBarStandIn />
          </>
        ),
      },
      "(tabs)/(home)/_layout": () => <Stack />,
      "(tabs)/(home)/index": () => <Text>Home</Text>,
      "(tabs)/(home)/library": BrokenScreen,
    },
    { initialUrl: "/library" },
  );

beforeEach(() => {
  mockBroken = true;
  mockCaptureException.mockClear();
  // React logs every error a boundary catches, with its component stack.
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// A screen that throws while rendering used to take the whole tab navigator
// down with it: the fallback replaced the tab bar, and retry remounted every
// tab from scratch. It now stays inside the screen that crashed.
test("shows a crashed screen's error in that screen and keeps the tab bar", async () => {
  await renderTabs();

  expect(screen.getByText("common.something_went_wrong")).toBeTruthy();
  expect(screen.getByText("The library failed to load")).toBeTruthy();
  expect(screen.getByText("Tab bar 0")).toBeTruthy();
  expect(mockCaptureException).toHaveBeenCalledWith(
    expect.objectContaining({ message: "The library failed to load" }),
  );
});

test("renders the crashed screen again on retry and leaves the rest as it was", async () => {
  await renderTabs();
  await fireEvent.press(screen.getByText("Tab bar 0"));
  expect(screen.getByText("Tab bar 1")).toBeTruthy();

  mockBroken = false;
  await fireEvent.press(screen.getByText("home.retry"));

  expect(await screen.findByText("Library")).toBeTruthy();
  expect(screen.queryByText("common.something_went_wrong")).toBeNull();
  expect(screen.getByText("Tab bar 1")).toBeTruthy();
});
