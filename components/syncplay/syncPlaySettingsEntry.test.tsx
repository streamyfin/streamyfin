import { fireEvent, render, screen } from "@testing-library/react-native";
import Settings from "@/app/(auth)/(tabs)/(home)/settings";

jest.mock(
  "@/hooks/useAppRouter",
  () => jest.requireActual("@/test-utils/stubModules").appRouterModule,
);

const mockUpdateSettings = jest.fn();
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    userAtom: atom({ Id: "user-1", Name: "Ada" }),
    useJellyfin: () => ({ logout: jest.fn() }),
  };
});
jest.mock("expo-router", () => ({
  useNavigation: () => ({ setOptions: () => {} }),
}));
jest.mock("i18next", () => ({ t: (key: string) => key }));
// The other sections of the screen have nothing to do with the switch.
jest.mock("@/components/common/HeaderButton", () => ({
  HeaderButton: () => null,
}));
jest.mock("@/components/settings/AppLanguageSelector", () => ({
  AppLanguageSelector: () => null,
}));
jest.mock("@/components/settings/QuickConnect", () => ({
  QuickConnect: () => null,
}));
jest.mock("@/components/settings/StorageSettings", () => ({
  StorageSettings: () => null,
}));
jest.mock("@/components/settings/UserInfo", () => ({ UserInfo: () => null }));
// The Notifications row asks the server's plugin first: here no plugin
// answers, as on a server whose plugin does not serve the routes.
jest.mock("@/hooks/useMyNotifications", () => ({
  useMyNotifications: () => ({ supported: false, mine: undefined }),
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ available: true }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { syncPlayIgnoreWait: false },
    updateSettings: mockUpdateSettings,
  }),
}));

describe("Settings, SyncPlay", () => {
  // The row's title is a sibling of the switch, not its name: a screen
  // reader would announce a bare switch.
  test("the switch is named after its setting", async () => {
    await render(<Settings />);

    await fireEvent(
      screen.getByLabelText("syncplay.ignore_wait"),
      "valueChange",
      true,
    );
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      syncPlayIgnoreWait: true,
    });
  });
});
