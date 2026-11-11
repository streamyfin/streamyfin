import { render } from "@testing-library/react-native";
import { QueryWrapper } from "@/test-utils/queryWrapper";

/**
 * Covers `app/(auth)/(tabs)/(more)/settings.tv.tsx`, the TV settings tab root.
 * Expo Router would turn a spec under `app/` into a route.
 */

jest.mock("@/components/tv", () => ({
  TVBelowTabBar: ({ children }: { children: React.ReactNode }) => children,
  TVCustomHeadersSection: () => null,
  TVLogoutButton: () => null,
  TVSectionHeader: () => null,
  // The rows render for real: a mock that returns null hides the native prop
  // `hasTVPreferredFocus` lands on, which is the whole point of the spec below.
  // Why that prop matters on a tab root: docs/conventions/tv.md.
  TVSettingsOptionButton: jest.requireActual(
    "@/components/tv/settings/TVSettingsOptionButton",
  ).TVSettingsOptionButton,
  TVSettingsRow: jest.requireActual("@/components/tv/settings/TVSettingsRow")
    .TVSettingsRow,
  TVSettingsStepper: jest.requireActual(
    "@/components/tv/settings/TVSettingsStepper",
  ).TVSettingsStepper,
  TVSettingsTextInput: jest.requireActual(
    "@/components/tv/settings/TVSettingsTextInput",
  ).TVSettingsTextInput,
  TVSettingsToggle: jest.requireActual(
    "@/components/tv/settings/TVSettingsToggle",
  ).TVSettingsToggle,
  useTVBelowTabBarContentTop: () => 0,
}));
jest.mock("@/components/login/TVPasswordEntryModal", () => ({
  TVPasswordEntryModal: () => null,
}));
jest.mock("@/components/login/TVPINEntryModal", () => ({
  TVPINEntryModal: () => null,
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// The settings only read its table of bitrates. The component pulls in the
// bottom sheet, which needs the native worklets.
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock("@/utils/atoms/settings", () => ({
  ...jest.requireActual("@/utils/atoms/settings"),
  ...jest.requireActual("@/test-utils/settings").makeSettingsModule(),
}));
jest.mock(
  "@/utils/atoms/api",
  () => jest.requireActual("@/test-utils/jellyfinProvider").apiAtomsModule,
);
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    ...jest.requireActual("@/test-utils/jellyfinProvider")
      .jellyfinProviderModule,
    cacheVersionAtom: atom(0),
    useJellyfin: () => ({}),
  };
});
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ available: true }),
}));
jest.mock("@/providers/AudioStorage", () => ({ clearCache: jest.fn() }));
jest.mock("@/hooks/useMediaPreferences", () => ({
  useMediaPreferences: () => ({ cultures: [] }),
}));
jest.mock("@/hooks/useTVOptionModal", () => ({
  useTVOptionModal: () => ({ showOptions: jest.fn() }),
}));
jest.mock("@/hooks/useTVUserSwitchModal", () => ({
  useTVUserSwitchModal: () => ({ showUserSwitchModal: jest.fn() }),
}));
jest.mock("@/i18n", () => ({ APP_LANGUAGES: [] }));
jest.mock("@/utils/secureCredentials", () => ({
  getPreviousServers: () => [],
}));
jest.mock("@/utils/topshelf/cache", () => ({
  clearTopShelfCacheSafely: jest.fn(),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const SettingsTV = jest.requireActual(
  "@/app/(auth)/(tabs)/(more)/settings.tv",
).default;

describe("TV settings tab", () => {
  // Swiping across the tvOS tab bar landed on the first settings row. The row
  // rendered with `isFirst` set hasTVPreferredFocus, and a tab root that sets
  // it pulls the focus off the bar as the tab first mounts. The rule is in
  // docs/conventions/tv.md.
  test("leaves the initial focus on the tab bar", async () => {
    const { container, getByText } = await render(<SettingsTV />, {
      wrapper: QueryWrapper,
    });

    getByText("syncplay.ignore_wait");
    getByText("home.settings.security.inactivity_timeout.title");

    expect(
      container.queryAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.hasTVPreferredFocus === true,
      ),
    ).toHaveLength(0);
  });
});
