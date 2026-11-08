import { render } from "@testing-library/react-native";
import { QueryWrapper } from "@/test-utils/queryWrapper";

/**
 * Covers `app/(auth)/(tabs)/(home)/settings.tv.tsx`, the TV settings tab root.
 * Expo Router would turn a spec under `app/` into a route.
 */

/** Labels of the settings rows rendered with `isFirst`. */
const mockFirstRows = new Set<string>();

jest.mock("@/components/tv", () => {
  const row = ({ label, isFirst }: { label?: string; isFirst?: boolean }) => {
    if (isFirst) mockFirstRows.add(label ?? "");
    return null;
  };
  return {
    TVBelowTabBar: ({ children }: { children: React.ReactNode }) => children,
    TVCustomHeadersSection: () => null,
    TVLogoutButton: () => null,
    TVSectionHeader: () => null,
    TVSettingsOptionButton: row,
    TVSettingsRow: row,
    TVSettingsStepper: row,
    TVSettingsTextInput: row,
    TVSettingsToggle: row,
    useTVBelowTabBarContentTop: () => 0,
  };
});
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
  "@/app/(auth)/(tabs)/(home)/settings.tv",
).default;

describe("TV settings tab", () => {
  // Swiping across the tvOS tab bar landed on the first settings row. The row
  // rendered with `isFirst` set hasTVPreferredFocus, and a tab root that sets
  // it pulls the focus off the bar as the tab first mounts. The rule is in
  // docs/conventions/tv.md.
  test("leaves the initial focus on the tab bar", async () => {
    mockFirstRows.clear();

    await render(<SettingsTV />, { wrapper: QueryWrapper });

    expect([...mockFirstRows]).toEqual([]);
  });
});
