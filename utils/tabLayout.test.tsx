// Spec for app/(auth)/(tabs)/_layout.tsx on Apple TV. It lives here rather than
// next to the layout because Expo Router turns every file under app/ into a
// route.
import { act, cleanup, render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import type { ReactNode } from "react";
import { clearMmkv } from "@/test-utils/mmkv";
import { stubReactNative } from "@/test-utils/reactNative";
import type { Settings } from "@/utils/atoms/settings";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// BitrateSelector is a React component module; only the BITRATES table matters.
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
// The api atoms read react-native-device-info, native at test time.
jest.mock("@/utils/atoms/api", () => ({
  apiAtom: jest.requireActual("jotai").atom(null),
  userAtom: jest.requireActual("jotai").atom(null),
}));
// The log module reaches Sentry.
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  logAndCaptureError: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  readFromLog: () => [],
  useLog: () => ({ logs: [], clearLogs: () => undefined }),
  LogProvider: ({ children }: { children: unknown }) => children,
  default: jest.requireActual("jotai").atom([]),
}));

/** Every mount and unmount of the native tab bar, in order. */
const mockBarEvents: string[] = [];
/** The optional tabs each tab bar showed, once per commit, by instance. */
const mockBarTabs = new Map<number, string[][]>();
let mockBarInstances = 0;

jest.mock("@bottom-tabs/react-navigation", () => ({
  createNativeBottomTabNavigator: () => ({ Navigator: () => null }),
}));
// NativeTabs stands for the native tab bar. React never hands a component its
// key, so a new key shows up here as a new instance: an unmount, then a mount.
jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  const NativeTabs = ({ children }: { children: ReactNode }) => {
    const [id] = React.useState(() => ++mockBarInstances);
    const shown = React.Children.toArray(children)
      .filter(
        (screen: any) =>
          ["(watchlists)", "(custom-links)"].includes(screen.props.name) &&
          !screen.props.options?.tabBarItemHidden,
      )
      .map((screen: any) => screen.props.name);
    React.useEffect(() => {
      mockBarTabs.set(id, [...(mockBarTabs.get(id) ?? []), shown]);
    });
    React.useEffect(() => {
      mockBarEvents.push(`mount ${id}`);
      return () => {
        mockBarEvents.push(`unmount ${id}`);
      };
    }, [id]);
    return null;
  };
  NativeTabs.Screen = () => null;
  return {
    Stack: Object.assign(() => null, { Screen: () => null }),
    useSegments: () => [],
    withLayoutContext: () => NativeTabs,
  };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-edge-to-edge", () => ({ SystemBars: () => null }));
// Android TV's own tab bar.
jest.mock("@/components/tv/TVNavBar", () => ({ TVNavBar: () => null }));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ replace: () => undefined }),
}));
// Reaches the native TV menu key handling.
jest.mock("@/hooks/useTVBackHandler", () => ({
  isAtTabRoot: () => true,
  isTabRoute: () => false,
  useTVHomeBackHandler: () => undefined,
  useTVTabRootBackHandler: () => undefined,
}));
// Re-exported by the layout as its error boundary; it reaches Sentry.
jest.mock("@/components/RouteErrorBoundary", () => ({
  RouteErrorBoundary: () => null,
}));

// Apple TV. Set before the modules below are required: the layout and
// settings.ts read Platform when they are evaluated.
stubReactNative({ OS: "ios", isTV: true });

const { storage } = require("@/utils/mmkv") as typeof import("@/utils/mmkv");
const { SETTINGS_KEY } =
  require("@/utils/storedSettings") as typeof import("@/utils/storedSettings");
const { settingsAtom, useSettings } =
  require("@/utils/atoms/settings") as typeof import("@/utils/atoms/settings");
const TabLayout = (
  require("@/app/(auth)/(tabs)/_layout") as typeof import("@/app/(auth)/(tabs)/_layout")
).default;

const STATS_URL = "https://stats.example";

let updateSettings: (update: Partial<Settings>) => void = () => undefined;

/**
 * What app/_layout.tsx does above the tabs: it reads the settings, which loads
 * the stored ones after the first commit, and renders its children at once.
 */
const Root = ({ children }: { children: ReactNode }) => {
  updateSettings = useSettings().updateSettings;
  return <>{children}</>;
};

/** Launches the app with `stored` as the settings saved on the device. */
const coldStart = async (stored: Partial<Settings>) => {
  storage.set(SETTINGS_KEY, JSON.stringify(stored));
  await render(
    <Root>
      <TabLayout />
    </Root>,
  );
  await act(async () => {});
};

const mounts = () =>
  mockBarEvents.filter((event) => event.startsWith("mount")).length;

/** The optional tabs on the tab bar mounted last, as it last rendered. */
const shownTabs = () => [...mockBarTabs.values()].at(-1)?.at(-1);

/**
 * Whether an optional tab appeared or went on a tab bar while it was mounted,
 * an appearing one being what crashes tvOS. It reads the screens' own options,
 * so a tab that changes without the key changing shows up here.
 */
const changedInPlace = () =>
  [...mockBarTabs.values()].some(
    (commits) => new Set(commits.map((tabs) => tabs.join())).size > 1,
  );

beforeEach(() => {
  clearMmkv();
  mockBarEvents.length = 0;
  mockBarTabs.clear();
  mockBarInstances = 0;
});

afterEach(async () => {
  await cleanup();
  // The next test launches the app again, before anything has been read.
  getDefaultStore().set(settingsAtom, null);
});

describe("the Apple TV tab bar", () => {
  // The stored settings arrive one commit after launch. A tab bar mounted on
  // the defaults was keyed without the tab and mounted again as they arrived,
  // Home and every tab's stack with it, at every launch.
  test.each<[string, Partial<Settings>, string[]]>([
    ["the KefinTweaks watchlist", { useKefinTweaks: true }, ["(watchlists)"]],
    ["Streamystats", { streamyStatsServerUrl: STATS_URL }, ["(watchlists)"]],
    ["the custom links tab", { showCustomMenuLinks: true }, ["(custom-links)"]],
    ["no optional tab", {}, []],
  ])("mounts once at launch with %s on", async (_name, stored, tabs) => {
    await coldStart(stored);

    expect(mounts()).toBe(1);
    expect(shownTabs()).toEqual(tabs);
    expect(changedInPlace()).toBe(false);
  });

  // tvOS throws UIViewControllerHierarchyInconsistency when a tab is inserted
  // into a tab bar on screen (#2171), so the bar is mounted again instead.
  test.each<[string, Partial<Settings>, string[]]>([
    ["the watchlist integration", { useKefinTweaks: true }, ["(watchlists)"]],
    ["the custom links tab", { showCustomMenuLinks: true }, ["(custom-links)"]],
  ])(
    "mounts the bar again when %s is turned on",
    async (_name, update, tabs) => {
      await coldStart({});

      await act(async () => updateSettings(update));

      expect(mockBarEvents).toEqual(["mount 1", "unmount 1", "mount 2"]);
      expect(shownTabs()).toEqual(tabs);
      expect(changedInPlace()).toBe(false);
    },
  );

  // A remount drops every tab's navigation stack.
  test("keeps the bar when a setting leaves the same tabs on screen", async () => {
    await coldStart({ useKefinTweaks: true });
    const atLaunch = [...mockBarEvents];

    await act(async () => updateSettings({ streamyStatsServerUrl: STATS_URL }));

    expect(mockBarEvents).toEqual(atLaunch);
    expect(shownTabs()).toEqual(["(watchlists)"]);
  });
});
