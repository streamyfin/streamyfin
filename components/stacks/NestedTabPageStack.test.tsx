// Each tab that can open a watchlist registers its create and edit sheets as
// modals. The routing spec (utils/tabRoutes.test.ts) stubs every layout, so a
// registration gone would leave it green while the form opens as a plain page.
import { render } from "@testing-library/react-native";
import type { ComponentType, ReactNode } from "react";

type ScreenProps = { name: string; options?: { presentation?: string } };

const mockScreens: ScreenProps[] = [];

jest.mock("expo-router", () => {
  const Stack = ({ children }: { children?: ReactNode }) => children;
  Stack.Screen = (props: ScreenProps) => {
    mockScreens.push(props);
    return null;
  };
  return { Stack };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// What the layouts draw in their headers, never rendered here.
jest.mock("@/components/cast/OutputButton", () => ({
  OutputButton: () => null,
}));
jest.mock("@/components/syncplay/SyncPlayButton", () => ({
  SyncPlayButton: () => null,
}));
jest.mock("@/components/PlatformDropdown", () => ({
  PlatformDropdown: () => null,
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: jest.fn() }),
}));
jest.mock("@/hooks/useWatchlists", () => ({
  useStreamystatsEnabled: () => true,
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { libraryOptions: {} },
    updateSettings: jest.fn(),
    pluginSettings: undefined,
  }),
}));

const LAYOUTS: Record<string, () => ComponentType> = {
  "(home)": () => require("@/app/(auth)/(tabs)/(home)/_layout").default,
  "(libraries)": () =>
    require("@/app/(auth)/(tabs)/(libraries)/_layout").default,
  "(search)": () => require("@/app/(auth)/(tabs)/(search)/_layout").default,
  "(more)": () => require("@/app/(auth)/(tabs)/(more)/_layout").default,
  "(tv-watchlists)": () =>
    require("@/app/(auth)/(tabs)/(tv-watchlists)/_layout").default,
};

describe("watchlist sheets", () => {
  beforeEach(() => {
    mockScreens.length = 0;
  });

  test.each(Object.keys(LAYOUTS))(
    "%s opens the create and edit sheets as modals",
    async (tab) => {
      const Layout = LAYOUTS[tab]();
      await render(<Layout />);

      const presentation = (name: string) =>
        mockScreens.find((screen) => screen.name === name)?.options
          ?.presentation;
      expect(presentation("watchlists/create")).toBe("modal");
      expect(presentation("watchlists/edit/[watchlistId]")).toBe("modal");
    },
  );
});
