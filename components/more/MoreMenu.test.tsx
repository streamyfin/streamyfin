import { fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { MoreMenu } from "@/components/more/MoreMenu";
import { userAtom } from "@/providers/JellyfinProvider";

const mockPush = jest.fn();
let mockSettings: Record<string, unknown> = {};
let mockShowsLiveTV = false;

jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { userAtom: atom({ Id: "user-1" }) };
});
jest.mock("@/hooks/useShowsLiveTV", () => ({
  useShowsLiveTV: () => mockShowsLiveTV,
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: mockSettings }),
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
  mockShowsLiveTV = false;
  getDefaultStore().set(userAtom, { Id: "user-1" } as never);
});

describe("More menu, phone", () => {
  test("opens each row in the More tab", async () => {
    getDefaultStore().set(userAtom, {
      Id: "admin",
      Policy: { IsAdministrator: true },
    } as never);
    mockSettings = STREAMYSTATS;
    mockShowsLiveTV = true;
    await render(<MoreMenu />);

    for (const [label, href] of [
      ["tabs.favorites", "/(auth)/(tabs)/(more)/favorites"],
      ["live_tv.title", "/(auth)/(tabs)/(more)/livetv"],
      ["watchlists.title", "/(auth)/(tabs)/(more)/watchlists"],
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

  // useShowsLiveTV is false on a server without Live TV, and when the user
  // turned Live TV off.
  test("shows Live TV only when the app offers it", async () => {
    const view = await render(<MoreMenu />);
    expect(screen.queryByText("live_tv.title")).toBeNull();
    await view.unmount();

    mockShowsLiveTV = true;
    await render(<MoreMenu />);
    expect(screen.getByText("live_tv.title")).toBeTruthy();
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

  // Home's header already has a downloads button; a row here showed the same
  // page twice.
  test("has no downloads row", async () => {
    await render(<MoreMenu />);
    expect(screen.queryByText("home.downloads.downloads_title")).toBeNull();
  });
});
