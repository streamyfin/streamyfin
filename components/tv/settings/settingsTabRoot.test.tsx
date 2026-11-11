import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryWrapper } from "@/test-utils/queryWrapper";
import type { SavedServer } from "@/utils/secureCredentials";

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
/** Saved servers the screen reads; the current one lists other accounts. */
let mockServers: SavedServer[] = [];
let mockSyncPlayAvailable = true;
/** What the PIN prompt was last rendered with. */
let mockPinPrompt: { visible: boolean; onClose: () => void } | null = null;
const mockShowUserSwitchModal = jest.fn();
const mockRequestTVFocus = jest.fn();

jest.mock("@/components/login/TVPINEntryModal", () => ({
  TVPINEntryModal: (props: { visible: boolean; onClose: () => void }) => {
    mockPinPrompt = props;
    return null;
  },
}));
jest.mock("@/utils/requestTVFocus", () => ({
  requestTVFocus: (view: unknown) => mockRequestTVFocus(view),
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
  useSyncPlay: () => ({ available: mockSyncPlayAvailable }),
}));
jest.mock("@/providers/AudioStorage", () => ({ clearCache: jest.fn() }));
jest.mock("@/hooks/useMediaPreferences", () => ({
  useMediaPreferences: () => ({ cultures: [] }),
}));
jest.mock("@/hooks/useTVOptionModal", () => ({
  useTVOptionModal: () => ({ showOptions: jest.fn() }),
}));
jest.mock("@/hooks/useTVUserSwitchModal", () => ({
  useTVUserSwitchModal: () => ({
    showUserSwitchModal: mockShowUserSwitchModal,
  }),
}));
jest.mock("@/i18n", () => ({ APP_LANGUAGES: [] }));
jest.mock("@/utils/secureCredentials", () => ({
  getPreviousServers: () => mockServers,
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

/** The test api's server, with the signed-in user and a second, PIN protected account. */
const serverWithTwoAccounts = (): SavedServer => ({
  address: "https://jellyfin.example.com",
  accounts: [
    { userId: "user-1", username: "me", securityType: "none", savedAt: 1 },
    { userId: "user-2", username: "kid", securityType: "pin", savedAt: 2 },
  ],
});

const preferredFocusNodes = (container: {
  queryAll: (
    predicate: (node: {
      type: unknown;
      props: Record<string, unknown>;
    }) => boolean,
  ) => unknown[];
}) =>
  container.queryAll(
    (node) =>
      typeof node.type === "string" && node.props.hasTVPreferredFocus === true,
  );

beforeEach(() => {
  mockServers = [];
  mockSyncPlayAvailable = true;
  mockPinPrompt = null;
  mockShowUserSwitchModal.mockReset();
  mockRequestTVFocus.mockReset();
});

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

    expect(preferredFocusNodes(container)).toHaveLength(0);
  });

  // Each of the first rows set it in its own configuration: Switch user with a
  // second account, inactivity without SyncPlay. One configuration only
  // guarded the SyncPlay row.
  test("leaves it there with another account and without SyncPlay", async () => {
    mockServers = [serverWithTwoAccounts()];
    mockSyncPlayAvailable = false;
    const { container, getByText } = await render(<SettingsTV />, {
      wrapper: QueryWrapper,
    });

    getByText("home.settings.switch_user.switch_user");
    getByText("home.settings.security.inactivity_timeout.title");

    expect(preferredFocusNodes(container)).toHaveLength(0);
  });

  // The PIN prompt is an overlay in this page. The row's hasTVPreferredFocus
  // turned true again as it closed, which handed the focus back; without it
  // the focus stayed nowhere once the prompt went away.
  test("gives the focus back to Switch user when the PIN prompt closes", async () => {
    mockServers = [serverWithTwoAccounts()];
    const { getByText } = await render(<SettingsTV />, {
      wrapper: QueryWrapper,
    });

    fireEvent.press(getByText("home.settings.switch_user.switch_user"));
    const { onAccountSelect } = mockShowUserSwitchModal.mock.calls[0][2];
    await act(async () => {
      await onAccountSelect(mockServers[0].accounts[1]);
    });
    expect(mockPinPrompt?.visible).toBe(true);
    expect(mockRequestTVFocus).not.toHaveBeenCalled();

    await act(async () => {
      mockPinPrompt?.onClose();
    });

    await waitFor(() => expect(mockPinPrompt?.visible).toBe(false));
    expect(mockRequestTVFocus).toHaveBeenCalledTimes(1);
    expect(mockRequestTVFocus.mock.calls[0][0]).toBeTruthy();
  });
});
