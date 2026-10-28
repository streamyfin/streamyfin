import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { SeerrSettings } from "./Seerr";

const mockQuickConnectEnabled = jest.fn<Promise<boolean>, []>();
const mockSignInWithQuickConnect = jest.fn();
const mockLogin = jest.fn();
const mockSetSeerrUser = jest.fn();
const mockToastError = jest.fn();

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// The log module loads Sentry and its timers. Nothing asserted here logs.
jest.mock("@/utils/log", () => ({
  writeErrorLog: () => undefined,
  writeToLog: () => undefined,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("sonner-native", () => ({
  toast: { error: (message: string) => mockToastError(message) },
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
// Input reads the TV font scale through the settings atom, whose module graph
// reaches native modules a spec cannot load. Nothing here renders on TV.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({}),
}));
// The provider's module graph is the whole app. The form only reads who is
// signed in to Jellyfin, and through which client.
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "https://jellyfin.example.com" }),
    userAtom: atom({ Id: "user-1", Name: "alice" }),
  };
});
// A Seerr address the plugin pins, so that signing in does not start by
// resolving one.
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { seerrServerUrl: "https://seerr.example.com" },
    updateSettings: () => undefined,
    pluginSettings: {
      seerrServerUrl: { locked: true, value: "https://seerr.example.com" },
    },
  }),
}));
jest.mock("@/hooks/useIntegrationHeaders", () => ({
  useIntegrationHeaders: () => ({ headers: {}, resolveOptions: {} }),
}));
jest.mock("@/hooks/useSeerr", () => ({
  SeerrApi: jest.fn().mockImplementation(() => ({
    test: async () => ({ isValid: true, requiresPass: true }),
    login: (username: string, password: string) =>
      mockLogin(username, password),
  })),
  useSeerr: () => ({
    seerrUser: undefined,
    setSeerrUser: mockSetSeerrUser,
    clearAllSeerrData: async () => undefined,
  }),
}));
// The two calls that reach a server. What the form does with their answers
// is the module's own.
jest.mock("@/utils/seerrQuickConnect", () => ({
  ...jest.requireActual("@/utils/seerrQuickConnect"),
  isQuickConnectEnabled: () => mockQuickConnectEnabled(),
  signInWithQuickConnect: () => mockSignInWithQuickConnect(),
}));
jest.mock("@/utils/seerrPassword", () => ({
  deleteSeerrPassword: async () => undefined,
}));
jest.mock("../common/ServerUrlField", () => ({ ServerUrlField: () => null }));
jest.mock("./CustomHeaderSelector", () => ({
  CustomHeaderSelector: () => null,
}));

const LOGIN = "home.settings.plugins.seerr.login_button";
const PASSWORD = "home.settings.plugins.seerr.password_placeholder";
const NO_PASSWORD_NEEDED = "home.settings.plugins.seerr.credentials_not_needed";
const FAILED = "seerr.failed_to_login";
const COLD_START_TIMEOUT_MS = 60_000;

// No cache timers: a pending one keeps Jest from exiting.
const renderForm = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
            mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
          },
        })
      }
    >
      <SeerrSettings />
    </QueryClientProvider>,
  );

describe("SeerrSettings — the password sign-in behind Quick Connect", () => {
  // The first render of a spec loads and transforms what the component tree
  // requires lazily, which on a cold Jest cache has gone past the 5 s a test
  // gets (see LocalNetworkSettings.test.tsx). One pass pays for it up front.
  beforeAll(async () => {
    mockQuickConnectEnabled.mockResolvedValue(false);
    const view = await renderForm();
    await screen.findByPlaceholderText(PASSWORD);
    await view.unmount();
  }, COLD_START_TIMEOUT_MS);

  beforeEach(() => {
    mockQuickConnectEnabled.mockReset();
    mockSignInWithQuickConnect.mockReset();
    mockLogin.mockReset();
    mockSetSeerrUser.mockReset();
    mockToastError.mockReset();
    // A Seerr older than 3.4.0, or one whose Quick Connect failed: no
    // session, and nothing thrown.
    mockSignInWithQuickConnect.mockResolvedValue(undefined);
    mockLogin.mockResolvedValue({ id: 7 });
  });

  // With Quick Connect on, the form says no password is needed and shows no
  // field for one. When Quick Connect then did not sign in, it posted the
  // empty field all the same: Seerr hands that to Jellyfin as a login for
  // the user's account, which fails and counts towards the account's
  // lockout. Four of the events in REACT-NATIVE-78 and -79 are that post,
  // from a Seerr older than 3.4.0; why Seerr answered it with a 500 and not
  // Jellyfin's 401 is not known.
  test("does not post a password the form never asked for", async () => {
    mockQuickConnectEnabled.mockResolvedValue(true);
    await renderForm();
    await screen.findByText(NO_PASSWORD_NEEDED);
    expect(screen.queryByPlaceholderText(PASSWORD)).toBeNull();

    await fireEvent.press(screen.getByText(LOGIN));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(FAILED));
    expect(mockSignInWithQuickConnect).toHaveBeenCalledTimes(1);
    expect(mockLogin).not.toHaveBeenCalled();
    // The way in that is left: the field, now that it is known to be needed.
    await screen.findByPlaceholderText(PASSWORD);
  });

  // A Jellyfin account can have no password, and for it the empty field is
  // the only sign-in a Seerr without Quick Connect has.
  test("posts the field once it is on screen, even empty", async () => {
    mockQuickConnectEnabled.mockResolvedValue(true);
    await renderForm();
    await screen.findByText(NO_PASSWORD_NEEDED);
    await fireEvent.press(screen.getByText(LOGIN));
    await screen.findByPlaceholderText(PASSWORD);

    await fireEvent.press(screen.getByText(LOGIN));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("alice", ""));
    await waitFor(() =>
      expect(mockSetSeerrUser).toHaveBeenCalledWith({ id: 7 }),
    );
  });

  test("posts what was typed where Quick Connect is off", async () => {
    mockQuickConnectEnabled.mockResolvedValue(false);
    await renderForm();
    await fireEvent.changeText(
      await screen.findByPlaceholderText(PASSWORD),
      "hunter2",
    );

    await fireEvent.press(screen.getByText(LOGIN));

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith("alice", "hunter2"),
    );
  });
});
