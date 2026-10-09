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
import { AxiosError, type AxiosResponse } from "axios";
import { createStore, Provider as JotaiProvider } from "jotai";
import { AccessibilityInfo, Alert } from "react-native";
import { QuickConnect } from "@/components/settings/QuickConnect";
import { userAtom } from "@/providers/JellyfinProvider";

const mockAuthorize = jest.fn();
const mockGetUsers = jest.fn<Promise<{ data: UserDto[] }>, []>();
const mockGetPublicSystemInfo = jest.fn<
  Promise<{ data: PublicSystemInfo }>,
  []
>();
// The three calls that reach a server.
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getQuickConnectApi: () => ({
    authorizeQuickConnect: (
      params: { code: string },
      options?: { signal?: AbortSignal },
    ) => mockAuthorize(params, options),
  }),
  getSystemApi: () => ({
    getPublicSystemInfo: () => mockGetPublicSystemInfo(),
  }),
  getUserApi: () => ({ getUsers: () => mockGetUsers() }),
}));
const mockEnabled = jest.fn(async () => true);
jest.mock("@/utils/seerrQuickConnect", () => ({
  isQuickConnectEnabled: () => mockEnabled(),
}));
// The provider's module graph is the whole app. The sheet only reads who is
// signed in, and through which client.
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "https://media.example.com" }),
    userAtom: atom(null),
  };
});
const mockClose = jest.fn();
// The sheet's content is always on screen here; only close() is watched.
jest.mock("@gorhom/bottom-sheet", () => {
  const React = jest.requireActual("react");
  const { TextInput, View } = jest.requireActual("react-native");
  return {
    BottomSheetModal: React.forwardRef(
      (props: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(ref, () => ({
          present: () => {},
          close: () => mockClose(),
        }));
        return props.children;
      },
    ),
    BottomSheetView: View,
    BottomSheetBackdrop: () => null,
    BottomSheetTextInput: TextInput,
  };
});
jest.mock("react-native-gesture-handler", () => ({
  Pressable: jest.requireActual("react-native").Pressable,
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    // The interpolated values ride along, so a test can tell who a message
    // names.
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  }),
}));
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
jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireOptionalNativeModule: () => ({}),
}));
let mockClipboard = "";
jest.mock("expo-clipboard", () => ({
  getStringAsync: async () => mockClipboard,
}));

const httpError = (status?: number) =>
  new AxiosError(
    "request failed",
    status ? "ERR_BAD_RESPONSE" : "ERR_NETWORK",
    undefined,
    undefined,
    status ? ({ status } as AxiosResponse) : undefined,
  );

const ADA: UserDto = { Id: "user-1", Name: "Ada", Policy: {} as never };
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
const USER_UNAVAILABLE =
  "home.settings.quick_connect.selected_user_unavailable";
const AUTHORIZED_FOR =
  "home.settings.quick_connect.quick_connect_authorized_for";
const CODE = "123456";
const COLD_START_TIMEOUT_MS = 60_000;

// No cache timers: a pending one keeps Jest from exiting.
const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

const renderSheet = (signedIn: UserDto = ADA, client = createClient()) => {
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

const typeCode = async (code: string) => {
  await act(async () => {
    await fireEvent.changeText(screen.getByTestId("quick-connect-code"), code);
  });
};

const pressAuthorize = async () => {
  await act(async () => {
    await fireEvent.press(screen.getByText(AUTHORIZE));
  });
};

describe("Settings, Quick Connect", () => {
  let alert: jest.SpyInstance;
  let announce: jest.SpyInstance;
  beforeEach(() => {
    mockClipboard = "";
    announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => {});
    mockAuthorize.mockReset();
    mockAuthorize.mockResolvedValue({ status: 200, data: true });
    mockEnabled.mockReset();
    mockEnabled.mockResolvedValue(true);
    mockClose.mockClear();
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    alert.mockRestore();
    announce.mockRestore();
  });

  // Like the PIN entry: the code goes as soon as it is complete.
  test("authorizes on its own once the sixth digit is in", async () => {
    await renderSheet();
    await typeCode("12345");
    expect(mockAuthorize).not.toHaveBeenCalled();

    await typeCode("123456");
    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    expect(mockAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({ code: "123456" }),
      expect.anything(),
    );
    expect(mockClose).toHaveBeenCalled();
  });

  test("authorizes a pasted code", async () => {
    mockClipboard = "123 456";
    await renderSheet();
    await act(async () => {
      await fireEvent.press(
        screen.getByText("home.settings.quick_connect.paste_code"),
      );
    });

    expect(mockAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({ code: "123456" }),
      expect.anything(),
    );
  });

  // As other apps do with a code: the first one goes by itself, and after a
  // failure the code stays for a fix and Authorize sends it.
  test("keeps a failed code for a fix and waits for Authorize", async () => {
    mockAuthorize.mockRejectedValueOnce(httpError(404));
    await renderSheet();
    await typeCode("123456");

    expect(
      screen.getByText("home.settings.quick_connect.invalid_code"),
    ).toBeTruthy();
    expect(screen.getByTestId("quick-connect-code").props.value).toBe("123456");
    expect(alert).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(
      "home.settings.quick_connect.invalid_code",
    );

    await typeCode("12345");
    await typeCode("123457");
    expect(mockAuthorize).toHaveBeenCalledTimes(1);

    await pressAuthorize();
    expect(mockAuthorize).toHaveBeenCalledTimes(2);
    expect(mockAuthorize).toHaveBeenLastCalledWith(
      expect.objectContaining({ code: "123457" }),
      expect.anything(),
    );
  });

  // Six digits pulled out of any text are not a code: they fill the cells and
  // wait to be checked.
  test("fills the cells from a pasted text that is not a code, without sending it", async () => {
    mockClipboard = "2026-10-08 code 482913";
    await renderSheet();
    await act(async () => {
      await fireEvent.press(
        screen.getByText("home.settings.quick_connect.paste_code"),
      );
    });

    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(screen.getByTestId("quick-connect-code").props.value).toBe("202610");
  });

  // A request still running when the sheet closes belongs to the sheet that
  // was closed, not to the one opened since.
  test("ignores a result that comes back after the sheet was opened again", async () => {
    let answer: (value: unknown) => void = () => {};
    mockAuthorize.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    await renderSheet();
    await typeCode("123456");

    await act(async () => {
      await fireEvent.press(
        screen.getByText("home.settings.quick_connect.authorize_button"),
      );
    });
    await act(async () => {
      answer({ status: 200, data: true });
    });

    expect(mockClose).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByTestId("quick-connect-code").props.value).toBe("");
  });

  // Jellyfin answers an approval with a 401 while Quick Connect is off, and
  // the session handling takes any 401 for an expired token (#2237).
  // A sheet opened again during the check that Quick Connect is on must not
  // let the previous attempt send its approval.
  test("sends no approval for an attempt the sheet was reopened over", async () => {
    let enabled: (value: boolean) => void = () => {};
    mockEnabled.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          enabled = resolve;
        }),
    );
    await renderSheet();
    await typeCode("123456");
    await act(async () => {
      await fireEvent.press(
        screen.getByText("home.settings.quick_connect.authorize_button"),
      );
    });
    await act(async () => {
      enabled(true);
    });

    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  test("cancels an approval on its way when the sheet is opened again", async () => {
    mockAuthorize.mockImplementationOnce(() => new Promise(() => {}));
    await renderSheet();
    await typeCode("123456");
    const signal = mockAuthorize.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    await act(async () => {
      await fireEvent.press(
        screen.getByText("home.settings.quick_connect.authorize_button"),
      );
    });
    expect(signal.aborted).toBe(true);
  });

  // The cells show the code being checked: they are locked until it answers.
  test("locks the cells while a code is being checked", async () => {
    mockAuthorize.mockImplementationOnce(() => new Promise(() => {}));
    await renderSheet();
    await typeCode("123456");

    expect(screen.getByTestId("quick-connect-code").props.editable).toBe(false);
  });

  test("says Quick Connect is off instead of asking the server to approve", async () => {
    mockEnabled.mockResolvedValue(false);
    await renderSheet();
    await typeCode("123456");

    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(
      screen.getByText("home.settings.quick_connect.disabled"),
    ).toBeTruthy();
  });

  test("says the server cannot be reached when its proxy answers for it", async () => {
    mockAuthorize.mockRejectedValue(httpError(502));
    await renderSheet();
    await typeCode("123456");

    expect(screen.getByText("home.server_unreachable_message")).toBeTruthy();
  });

  test("says the server cannot be reached when no answer comes back", async () => {
    mockAuthorize.mockRejectedValue(httpError());
    await renderSheet();
    await typeCode("123456");

    expect(screen.getByText("home.server_unreachable_message")).toBeTruthy();
  });
});

describe("Settings, Quick Connect for another user", () => {
  let alertSpy: jest.SpyInstance;
  let announce: jest.SpyInstance;

  const menuItem = (name: string) => screen.queryByRole("menuitem", { name });
  const pick = (name: string) =>
    fireEvent.press(screen.getByRole("menuitem", { name }));
  const expectApprovedFor = (approved: UserDto) =>
    waitFor(() =>
      expect(mockAuthorize).toHaveBeenCalledWith(
        { code: CODE, userId: approved.Id },
        expect.anything(),
      ),
    );

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
    mockEnabled.mockReset();
    mockEnabled.mockResolvedValue(true);
    mockAuthorize.mockResolvedValue({ status: 200, data: true });
    mockGetUsers.mockResolvedValue({ data: [ADMIN, BOB, CAROL] });
    mockGetPublicSystemInfo.mockResolvedValue({ data: { Version: "10.10.7" } });
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    announce.mockRestore();
  });

  test("an administrator approves a code for the user they pick", async () => {
    await renderSheet(ADMIN);
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());

    await pick("bob");
    await typeCode(CODE);
    await pressAuthorize();

    await expectApprovedFor(BOB);
    // The confirmation names who was signed in: it is not the admin.
    expect(alertSpy).toHaveBeenCalledWith(
      SUCCESS,
      `${AUTHORIZED_FOR} ${JSON.stringify({ username: "bob" })}`,
    );
  });

  // A code that went on its last digit would be approved for the
  // administrator before they had picked whose device it is, and that device
  // would be signed in as an admin.
  test("waits for Authorize while there is a user to pick", async () => {
    await renderSheet(ADMIN);
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());

    await typeCode(CODE);
    expect(mockAuthorize).not.toHaveBeenCalled();

    await pick("bob");
    await pressAuthorize();
    await expectApprovedFor(BOB);
    expect(mockAuthorize).toHaveBeenCalledTimes(1);
  });

  test("the picker starts on the administrator themselves", async () => {
    await renderSheet(ADMIN);
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());

    await typeCode(CODE);
    await pressAuthorize();

    await expectApprovedFor(ADMIN);
    expect(alertSpy).toHaveBeenCalledWith(SUCCESS, AUTHORIZED);
  });

  test("a disabled user is not offered", async () => {
    await renderSheet(ADMIN);
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());

    expect(menuItem("carol")).toBeNull();
  });

  // Reopening the sheet must not quietly keep the last pick: the next code
  // would sign someone else's device in as that user.
  test("goes back to the administrator when the sheet is opened again", async () => {
    await renderSheet(ADMIN);
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());
    await pick("bob");

    await fireEvent.press(screen.getByText(OPEN));
    await typeCode(CODE);
    await pressAuthorize();

    await expectApprovedFor(ADMIN);
  });

  test("an administrator on a server older than 10.9 approves for themselves only", async () => {
    mockGetPublicSystemInfo.mockResolvedValue({ data: { Version: "10.8.13" } });
    await renderSheet(ADMIN);
    await waitFor(() => expect(mockGetPublicSystemInfo).toHaveBeenCalled());

    await typeCode(CODE);

    await expectApprovedFor(ADMIN);
    expect(mockGetUsers).not.toHaveBeenCalled();
    expect(menuItem("bob")).toBeNull();
  });

  // A request without a user id is approved for whoever sends it. A pick
  // that quietly fell back to the administrator would sign the other user's
  // device in as an admin.
  test.each([
    // Without a picker the code goes on its last digit.
    ["and nobody else is left to pick", [ADMIN, CAROL], false],
    ["while others remain", [ADMIN, DAVE], true],
  ])(
    "refuses to approve when the picked user has left the list %s",
    async (_case, remaining, waitsForAuthorize) => {
      const client = createClient();
      await renderSheet(ADMIN, client);
      await waitFor(() => expect(menuItem("bob")).toBeTruthy());
      await pick("bob");

      mockGetUsers.mockResolvedValue({ data: remaining });
      await act(() =>
        client.refetchQueries({ queryKey: ["jellyfin", "users", "enabled"] }),
      );
      await waitFor(() => expect(menuItem("bob")).toBeNull());
      await typeCode(CODE);
      if (waitsForAuthorize) await pressAuthorize();

      expect(await screen.findByText(USER_UNAVAILABLE)).toBeTruthy();
      expect(mockAuthorize).not.toHaveBeenCalled();
    },
  );

  // Their own name is in the menu too. Tapping it is not a pick that can go
  // missing: it is where the sheet starts.
  test("approves for the administrator who picked their own name", async () => {
    const client = createClient();
    await renderSheet(ADMIN, client);
    await waitFor(() => expect(menuItem("bob")).toBeTruthy());
    await pick("alice");

    mockGetUsers.mockResolvedValue({ data: [ADMIN, CAROL] });
    await act(() =>
      client.refetchQueries({ queryKey: ["jellyfin", "users", "enabled"] }),
    );
    await waitFor(() => expect(menuItem("bob")).toBeNull());
    await typeCode(CODE);

    await expectApprovedFor(ADMIN);
  });

  // The gate and the list are extras: without either answer the sheet is
  // the one it always was, and the code goes to the signed-in user.
  test("approves for the administrator when the server version cannot be read", async () => {
    mockGetPublicSystemInfo.mockRejectedValue(new Error("offline"));
    await renderSheet(ADMIN);
    await waitFor(() => expect(mockGetPublicSystemInfo).toHaveBeenCalled());

    await typeCode(CODE);

    await expectApprovedFor(ADMIN);
    expect(mockGetUsers).not.toHaveBeenCalled();
  });

  test("approves for the administrator when the user list cannot be fetched", async () => {
    mockGetUsers.mockRejectedValue(new Error("offline"));
    await renderSheet(ADMIN);
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalled());

    await typeCode(CODE);

    await expectApprovedFor(ADMIN);
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

    await typeCode(CODE);

    await expectApprovedFor(BOB);
    expect(mockGetPublicSystemInfo).not.toHaveBeenCalled();
    expect(mockGetUsers).not.toHaveBeenCalled();
    expect(menuItem("alice")).toBeNull();
  });

  test("no picker on a server whose only enabled account is the administrator", async () => {
    mockGetUsers.mockResolvedValue({ data: [ADMIN, CAROL] });
    await renderSheet(ADMIN);
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalled());

    await typeCode(CODE);

    await expectApprovedFor(ADMIN);
    expect(menuItem("alice")).toBeNull();
  });
});
