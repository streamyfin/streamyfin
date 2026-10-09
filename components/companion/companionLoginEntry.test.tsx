import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import Settings from "@/app/(auth)/(tabs)/(home)/settings";

const mockPush = jest.fn();
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
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
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// The other sections of the screen have nothing to do with the entry.
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

describe("Settings, Log in on TV", () => {
  // The entry was hidden on iOS while pairing went through a UDP broadcast.
  // Quick Connect needs no local network access, so an iPhone gets it too.
  test("offers to log in on a TV from an iPhone", async () => {
    expect(Platform.OS).toBe("ios");
    await render(<Settings />);

    await fireEvent.press(screen.getByText("pairing.pair_with_phone"));
    expect(mockPush).toHaveBeenCalledWith(
      "/(auth)/(tabs)/(home)/companion-login",
    );
  });
});
