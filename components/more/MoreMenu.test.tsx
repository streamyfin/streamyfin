import { fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { MoreMenu } from "@/components/more/MoreMenu";
import { userAtom } from "@/providers/JellyfinProvider";

const mockPush = jest.fn();
let mockSettings: Record<string, unknown> = {};
let mockDownloadedItems: unknown[] = [];

jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { userAtom: atom({ Id: "user-1" }) };
});
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ downloadedItems: mockDownloadedItems }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: mockSettings }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// The links have their own spec, utils/customLinks.test.tsx: here only
// whether the menu shows them.
jest.mock("@/components/more/CustomLinksGroup", () => {
  const { Text } = jest.requireActual("react-native");
  return { CustomLinksGroup: () => <Text>custom links</Text> };
});
// The TV rows carry focus animation the menu has nothing to do with.
jest.mock("@/components/tv", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    TVSectionHeader: ({ title }: { title: string }) => <Text>{title}</Text>,
    TVSettingsRow: ({
      label,
      onPress,
    }: {
      label: string;
      onPress: () => void;
    }) => (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ title: 40 }),
}));

const STREAMYSTATS = { streamyStatsServerUrl: "https://stats.example.com" };

beforeEach(() => {
  mockPush.mockReset();
  mockSettings = {};
  mockDownloadedItems = [];
  getDefaultStore().set(userAtom, { Id: "user-1" } as never);
});

describe("More menu, phone", () => {
  test("opens each row in the More tab", async () => {
    getDefaultStore().set(userAtom, {
      Id: "admin",
      Policy: { IsAdministrator: true },
    } as never);
    mockSettings = STREAMYSTATS;
    await render(<MoreMenu />);

    for (const [label, href] of [
      ["tabs.favorites", "/(auth)/(tabs)/(more)/favorites"],
      ["watchlists.title", "/(auth)/(tabs)/(more)/watchlists"],
      ["home.downloads.downloads_title", "/(auth)/(tabs)/(more)/downloads"],
      ["home.sessions.title", "/(auth)/(tabs)/(more)/sessions"],
      ["tabs.settings", "/(auth)/(tabs)/(more)/settings"],
    ]) {
      await fireEvent.press(screen.getByText(label));
      expect(mockPush).toHaveBeenLastCalledWith(href);
    }
  });

  // The rows that used to be tabs keep the settings that hid those tabs.
  test("shows watchlists with a Streamystats server, unless they are hidden", async () => {
    const view = await render(<MoreMenu />);
    expect(screen.queryByText("watchlists.title")).toBeNull();
    await view.unmount();

    mockSettings = STREAMYSTATS;
    const shown = await render(<MoreMenu />);
    expect(screen.getByText("watchlists.title")).toBeTruthy();
    await shown.unmount();

    mockSettings = { ...STREAMYSTATS, hideWatchlistsTab: true };
    await render(<MoreMenu />);
    expect(screen.queryByText("watchlists.title")).toBeNull();
  });

  test("shows the server's links only when they are turned on", async () => {
    const view = await render(<MoreMenu />);
    expect(screen.queryByText("custom links")).toBeNull();
    await view.unmount();

    mockSettings = { showCustomMenuLinks: true };
    await render(<MoreMenu />);
    expect(screen.getByText("custom links")).toBeTruthy();
  });

  // Sessions was a header button on Home that only administrators had.
  test("shows sessions to an administrator only", async () => {
    const view = await render(<MoreMenu />);
    expect(screen.queryByText("home.sessions.title")).toBeNull();
    await view.unmount();

    getDefaultStore().set(userAtom, {
      Id: "admin",
      Policy: { IsAdministrator: true },
    } as never);
    await render(<MoreMenu />);
    expect(screen.getByText("home.sessions.title")).toBeTruthy();
  });

  test("counts what is downloaded", async () => {
    const view = await render(<MoreMenu />);
    expect(screen.queryByText("0")).toBeNull();
    await view.unmount();

    mockDownloadedItems = [{}, {}, {}];
    await render(<MoreMenu />);
    expect(screen.getByText("3")).toBeTruthy();
  });
});
