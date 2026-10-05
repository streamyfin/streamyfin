import type {
  PublicSystemInfo,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { Alert } from "react-native";
import { userAtom } from "@/providers/JellyfinProvider";
import { QuickConnect } from "./QuickConnect";

const mockAuthorize = jest.fn();
const mockGetUsers = jest.fn<Promise<{ data: UserDto[] }>, []>();
const mockGetPublicSystemInfo = jest.fn<
  Promise<{ data: PublicSystemInfo }>,
  []
>();

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    // The interpolated values ride along, so a test can tell who a message
    // names.
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  }),
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
// The provider's module graph is the whole app. The sheet only reads who is
// signed in, and through which client.
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "https://jellyfin.example.com" }),
    userAtom: atom(null),
  };
});
// The three calls that reach a server.
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getQuickConnectApi: () => ({
    authorizeQuickConnect: (params: unknown) => mockAuthorize(params),
  }),
  getSystemApi: () => ({
    getPublicSystemInfo: () => mockGetPublicSystemInfo(),
  }),
  getUserApi: () => ({ getUsers: () => mockGetUsers() }),
}));
// The library's own Jest double: the sheet is its content, always on screen.
jest.mock("@gorhom/bottom-sheet", () =>
  jest.requireActual("@gorhom/bottom-sheet/mock"),
);
// The native menu is not what is under test: the trigger shows who is
// picked, and every option is a menu item that can be pressed.
jest.mock("../PlatformDropdown", () => ({
  PlatformDropdown: ({
    trigger,
    groups,
  }: {
    trigger: React.ReactNode;
    groups: { options: { label: string; onPress: () => void }[] }[];
  }) => {
    const { Text: OptionText, View: MenuView } =
      jest.requireActual("react-native");
    return (
      <MenuView>
        {trigger}
        {groups
          .flatMap((group) => group.options)
          .map((option) => (
            <OptionText
              key={option.label}
              accessibilityRole='menuitem'
              onPress={option.onPress}
            >
              {option.label}
            </OptionText>
          ))}
      </MenuView>
    );
  },
}));

const ADMIN: UserDto = {
  Id: "admin-1",
  Name: "alice",
  Policy: { IsAdministrator: true } as UserDto["Policy"],
};
const BOB: UserDto = { Id: "user-2", Name: "bob", Policy: {} as never };
const DAVE: UserDto = { Id: "user-4", Name: "dave", Policy: {} as never };
const CAROL: UserDto = {
  Id: "user-3",
  Name: "carol",
  Policy: { IsDisabled: true } as UserDto["Policy"],
};

const OPEN = "home.settings.quick_connect.authorize_button";
const AUTHORIZE = "home.settings.quick_connect.authorize";
const SUCCESS = "home.settings.quick_connect.success";
const AUTHORIZED = "home.settings.quick_connect.quick_connect_authorized";
const ERROR = "home.settings.quick_connect.error";
const USER_UNAVAILABLE =
  "home.settings.quick_connect.selected_user_unavailable";
const AUTHORIZED_FOR =
  "home.settings.quick_connect.quick_connect_authorized_for";
const CODE = "123456";
const COLD_START_TIMEOUT_MS = 60_000;

const menuItem = (name: string) => screen.queryByRole("menuitem", { name });

// No cache timers: a pending one keeps Jest from exiting.
const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

const renderSheet = (signedIn: UserDto = ADMIN, client = createClient()) => {
  const store = createStore();
  store.set(userAtom, signedIn);
  return render(
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>
        <QuickConnect />
      </JotaiProvider>
    </QueryClientProvider>,
  );
};

const enterCodeAndAuthorize = async () => {
  await fireEvent.changeText(screen.getByDisplayValue(""), CODE);
  await fireEvent.press(screen.getByText(AUTHORIZE));
};

describe("QuickConnect — approving a code for another user", () => {
  let alertSpy: jest.SpyInstance;

  // The first render of a spec loads and transforms what the component tree
  // requires lazily, which on a cold Jest cache has gone past the 5 s a test
  // gets (see LocalNetworkSettings.test.tsx). One pass pays for it up front.
  beforeAll(async () => {
    const view = await renderSheet(BOB);
    await screen.findByText(OPEN);
    await view.unmount();
  }, COLD_START_TIMEOUT_MS);

  beforeEach(() => {
    mockAuthorize.mockReset();
    mockGetUsers.mockReset();
    mockGetPublicSystemInfo.mockReset();
    mockAuthorize.mockResolvedValue({ status: 200 });
    mockGetUsers.mockResolvedValue({ data: [ADMIN, BOB, CAROL] });
    mockGetPublicSystemInfo.mockResolvedValue({ data: { Version: "10.10.7" } });
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  test("an administrator approves a code for the user they pick", async () => {
    await renderSheet();
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());

    await fireEvent.press(screen.getByRole("menuitem", { name: "bob" }));
    await enterCodeAndAuthorize();

    await waitFor(() =>
      expect(mockAuthorize).toHaveBeenCalledWith({
        code: CODE,
        userId: BOB.Id,
      }),
    );
    // The confirmation names who was signed in: it is not the admin.
    expect(alertSpy).toHaveBeenCalledWith(
      SUCCESS,
      `${AUTHORIZED_FOR} ${JSON.stringify({ username: "bob" })}`,
    );
  });

  test("the picker starts on the administrator themselves", async () => {
    await renderSheet();
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());

    await enterCodeAndAuthorize();

    await waitFor(() =>
      expect(mockAuthorize).toHaveBeenCalledWith({
        code: CODE,
        userId: ADMIN.Id,
      }),
    );
    expect(alertSpy).toHaveBeenCalledWith(SUCCESS, AUTHORIZED);
  });

  test("a disabled user is not offered", async () => {
    await renderSheet();
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());

    expect(menuItem("carol")).toBeNull();
  });

  // Reopening the sheet must not quietly keep the last pick: the next code
  // would sign someone else's device in as that user.
  test("goes back to the administrator when the sheet is opened again", async () => {
    await renderSheet();
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());
    await fireEvent.press(screen.getByRole("menuitem", { name: "bob" }));

    await fireEvent.press(screen.getByText(OPEN));
    await enterCodeAndAuthorize();

    await waitFor(() =>
      expect(mockAuthorize).toHaveBeenCalledWith({
        code: CODE,
        userId: ADMIN.Id,
      }),
    );
  });

  test("an administrator on a server older than 10.9 approves for themselves only", async () => {
    mockGetPublicSystemInfo.mockResolvedValue({ data: { Version: "10.8.13" } });
    await renderSheet();
    await waitFor(() => expect(mockGetPublicSystemInfo).toHaveBeenCalled());

    await enterCodeAndAuthorize();

    await waitFor(() =>
      expect(mockAuthorize).toHaveBeenCalledWith({
        code: CODE,
        userId: ADMIN.Id,
      }),
    );
    expect(mockGetUsers).not.toHaveBeenCalled();
    expect(menuItem("bob")).toBeNull();
  });

  // A request without a user id is approved for whoever sends it. A pick
  // that quietly fell back to the administrator would sign the other user's
  // device in as an admin.
  test.each([
    ["and nobody else is left to pick", [ADMIN, CAROL]],
    ["while others remain", [ADMIN, DAVE]],
  ])(
    "refuses to approve when the picked user has left the list %s",
    async (_case, remaining) => {
      const client = createClient();
      await renderSheet(ADMIN, client);
      await waitFor(() => expect(menuItem("bob")).toBeTruthy());
      await fireEvent.press(screen.getByRole("menuitem", { name: "bob" }));

      mockGetUsers.mockResolvedValue({ data: remaining });
      await act(() =>
        client.refetchQueries({ queryKey: ["jellyfin", "users", "enabled"] }),
      );
      await waitFor(() => expect(menuItem("bob")).toBeNull());
      await enterCodeAndAuthorize();

      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith(ERROR, USER_UNAVAILABLE),
      );
      expect(mockAuthorize).not.toHaveBeenCalled();
    },
  );

  // Their own name is in the menu too. Tapping it is not a pick that can go
  // missing: it is where the sheet starts.
  test("approves for the administrator who picked their own name", async () => {
    const client = createClient();
    await renderSheet(ADMIN, client);
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());
    await fireEvent.press(screen.getByRole("menuitem", { name: "alice" }));

    mockGetUsers.mockResolvedValue({ data: [ADMIN, CAROL] });
    await act(() =>
      client.refetchQueries({ queryKey: ["jellyfin", "users", "enabled"] }),
    );
    await waitFor(() => expect(menuItem("bob")).toBeNull());
    await enterCodeAndAuthorize();

    await waitFor(() =>
      expect(mockAuthorize).toHaveBeenCalledWith({
        code: CODE,
        userId: ADMIN.Id,
      }),
    );
  });

  // The gate and the list are extras: without either answer the sheet is
  // the one it always was, and the code goes to the signed-in user.
  test("approves for the administrator when the server version cannot be read", async () => {
    mockGetPublicSystemInfo.mockRejectedValue(new Error("offline"));
    await renderSheet();
    await waitFor(() => expect(mockGetPublicSystemInfo).toHaveBeenCalled());

    await enterCodeAndAuthorize();

    await waitFor(() =>
      expect(mockAuthorize).toHaveBeenCalledWith({
        code: CODE,
        userId: ADMIN.Id,
      }),
    );
    expect(mockGetUsers).not.toHaveBeenCalled();
  });

  test("approves for the administrator when the user list cannot be fetched", async () => {
    mockGetUsers.mockRejectedValue(new Error("offline"));
    await renderSheet();
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalled());

    await enterCodeAndAuthorize();

    await waitFor(() =>
      expect(mockAuthorize).toHaveBeenCalledWith({
        code: CODE,
        userId: ADMIN.Id,
      }),
    );
    expect(menuItem("alice")).toBeNull();
    expect(alertSpy).toHaveBeenCalledWith(SUCCESS, AUTHORIZED);
  });

  // The server info query is shared with useMediaPreferences, which reads
  // its status. A refetch from here that fails, offline for one, would mark
  // it as errored and lock the audio language settings.
  test("does not ask again for a server version the cache already holds", async () => {
    const client = createClient();
    client.setQueryData(["jellyfin", "serverInfo"], { Version: "10.11.2" });
    await renderSheet(ADMIN, client);

    await waitFor(() => expect(menuItem("bob")).toBeTruthy());
    expect(mockGetPublicSystemInfo).not.toHaveBeenCalled();
  });

  test("a regular user gets no picker and the user list is never asked for", async () => {
    await renderSheet(BOB);

    await enterCodeAndAuthorize();

    await waitFor(() =>
      expect(mockAuthorize).toHaveBeenCalledWith({
        code: CODE,
        userId: BOB.Id,
      }),
    );
    expect(mockGetPublicSystemInfo).not.toHaveBeenCalled();
    expect(mockGetUsers).not.toHaveBeenCalled();
    expect(menuItem("alice")).toBeNull();
  });

  test("no picker on a server whose only enabled account is the administrator", async () => {
    mockGetUsers.mockResolvedValue({ data: [ADMIN, CAROL] });
    await renderSheet();
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalled());

    await enterCodeAndAuthorize();

    await waitFor(() =>
      expect(mockAuthorize).toHaveBeenCalledWith({
        code: CODE,
        userId: ADMIN.Id,
      }),
    );
    expect(menuItem("alice")).toBeNull();
  });
});
