import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { getDefaultStore } from "jotai";
import type React from "react";
import { Alert } from "react-native";
import { type ToastAction, toast } from "sonner-native";
import { QUICK_CONNECT_BROWSER_REOPEN_DELAY_MS } from "@/constants/QuickConnect";
import type { QuickConnectStatus } from "@/hooks/useQuickConnect";
import { pendingAccountSaveAtom, userAtom } from "@/providers/JellyfinProvider";
import { emitAppState, stubReactNative } from "@/test-utils/reactNative";
import { Login } from "./Login";

const mockStopPolling = jest.fn();
const mockJellyfin = {
  setServer: jest.fn(),
  login: jest.fn(),
  removeServer: jest.fn(),
  initiateQuickConnect: jest.fn(async () => "123456"),
  // As the provider does: stopping resets the status.
  stopQuickConnectPolling: () => {
    mockJellyfin.quickConnectStatus = "idle";
    mockStopPolling();
  },
  quickConnectStatus: "waiting" as QuickConnectStatus,
  loginWithSavedCredential: jest.fn(),
  loginWithPassword: jest.fn(),
};
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "https://media.example.com" }),
    userAtom: atom(null),
    pendingAccountSaveAtom: atom(null),
    useJellyfin: () => mockJellyfin,
  };
});
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: (props: { name: string }) => MockIcon(props),
}));
const MockIcon = ({ name }: { name: string }) => {
  const { Text } = jest.requireActual("react-native");
  return <Text>{name}</Text>;
};
type CodeModalProps = {
  code: string | null;
  onClose: () => void;
  onNewCode: () => void;
};
jest.mock("@/components/login/QuickConnectCodeModal", () => ({
  QuickConnectCodeModal: (props: CodeModalProps) => MockCodeModal(props),
}));
/** The sheet's latest props, to call a handler without waiting for it. */
let mockCodeModalProps: CodeModalProps | null = null;
const MockCodeModal = (props: CodeModalProps) => {
  mockCodeModalProps = props;
  const { code, onClose, onNewCode } = props;
  const { Pressable, Text } = jest.requireActual("react-native");
  return code ? (
    <>
      <Pressable onPress={onClose}>
        <Text>close code</Text>
      </Pressable>
      <Pressable onPress={onNewCode}>
        <Text>new code</Text>
      </Pressable>
    </>
  ) : null;
};
type ButtonProps = {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
};
jest.mock("@/components/Button", () => ({
  // Presses are dropped while disabled or loading, as the real Button does.
  Button: ({ children, onPress, disabled, loading }: ButtonProps) => {
    const { Pressable, Text } = jest.requireActual("react-native");
    return (
      <Pressable onPress={() => !disabled && !loading && onPress?.()}>
        <Text>{children}</Text>
      </Pressable>
    );
  },
}));
jest.mock("@/components/common/Input", () => ({
  Input: (props: object) => {
    const { TextInput } = jest.requireActual("react-native");
    return <TextInput {...props} />;
  },
}));
jest.mock("@/components/JellyfinServerDiscovery", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/components/PreviousServersList", () => ({
  PreviousServersList: () => null,
}));
jest.mock("@/components/settings/CustomHeaderSheet", () => ({
  CustomHeaderSheet: () => null,
}));
jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: () => {}, hideModal: () => {} }),
}));
jest.mock("@/utils/jellyfin/checkServer", () => ({
  checkJellyfinServer: jest.fn(),
  ServerTooOldError: class extends Error {},
}));
const mockOpenBrowser = jest.fn(
  async (_url: string): Promise<{ type: string }> => ({ type: "cancel" }),
);
const mockDismissBrowser = jest.fn(async () => ({ type: "dismiss" }));
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
  dismissBrowser: () => mockDismissBrowser(),
}));

describe("Login Quick Connect", () => {
  beforeEach(() => {
    mockJellyfin.quickConnectStatus = "waiting";
    getDefaultStore().set(userAtom as never, null as never);
    getDefaultStore().set(pendingAccountSaveAtom as never, null as never);
  });

  test("keeps polling after the code sheet is closed", async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByText("save_account.save_for_later"));
    await act(async () => {
      await fireEvent.press(screen.getByText("cellphone-lock"));
    });
    mockStopPolling.mockClear();

    await fireEvent.press(screen.getByText("close code"));

    expect(mockStopPolling).not.toHaveBeenCalled();
    expect(screen.queryByText("close code")).toBeNull();
    await act(async () => {
      getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
    });
    expect(getDefaultStore().get(pendingAccountSaveAtom)).toEqual({
      serverName: "",
    });
  });

  test.each(["expired", "disabled"] as const)(
    "forgets the Quick Connect save intent when the request is %s",
    async (status) => {
      const view = await render(<Login />);
      await fireEvent.press(screen.getByText("save_account.save_for_later"));
      await act(async () => {
        await fireEvent.press(screen.getByText("cellphone-lock"));
      });
      mockJellyfin.quickConnectStatus = status;
      await view.rerender(<Login />);

      // A later password login must follow its own save-account flow.
      await act(async () => {
        getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
      });
      expect(getDefaultStore().get(pendingAccountSaveAtom)).toBeNull();
    },
  );

  // The user walked away from that code: it must not reopen the sheet, keep
  // polling, or carry the save intent into a later sign-in.
  test("drops a new code asked for from a sheet closed before it arrived", async () => {
    await render(<Login />);
    await act(async () => {
      await fireEvent.press(screen.getByText("cellphone-lock"));
    });
    let resolveCode: (code: string) => void = () => {};
    mockJellyfin.initiateQuickConnect.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveCode = resolve;
        }),
    );

    // The handler waits for the new code, so it is not awaited here; it sets
    // no state before the code arrives.
    const asked = mockCodeModalProps?.onNewCode() as unknown as Promise<void>;
    // A second press while the first is on its way asks for nothing more.
    await act(async () => {
      await (mockCodeModalProps?.onNewCode() as unknown as Promise<void>);
    });
    mockStopPolling.mockClear();
    await fireEvent.press(screen.getByText("close code"));
    await act(async () => {
      resolveCode("654321");
      await asked;
    });

    expect(screen.queryByText("close code")).toBeNull();
    expect(mockStopPolling).toHaveBeenCalled();
    expect(mockJellyfin.initiateQuickConnect).toHaveBeenCalledTimes(2);
  });

  // As the TV does: Jellyfin refuses to start one with a 401 while it is off.
  test("says Quick Connect is off when the server will not start it", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockJellyfin.initiateQuickConnect.mockRejectedValueOnce(
      new AxiosError(
        "Request failed with status code 401",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        { status: 401 } as AxiosResponse,
      ),
    );
    await render(<Login />);

    await act(async () => {
      await fireEvent.press(screen.getByText("cellphone-lock"));
    });

    expect(alert).toHaveBeenCalledWith(
      "login.error_title",
      "companion_login.error_quick_connect_disabled",
    );
    alert.mockRestore();
  });
});

describe("Login with browser", () => {
  const codePage = "https://media.example.com/web/#/quickconnect?code=123456";
  const pressLoginWithBrowser = () =>
    act(async () => {
      fireEvent.press(screen.getByText("login.login_with_browser"));
    });
  const waitBeforeReopening = () =>
    act(async () => {
      jest.advanceTimersByTime(QUICK_CONNECT_BROWSER_REOPEN_DELAY_MS);
    });

  beforeEach(() => {
    jest.useFakeTimers();
    mockJellyfin.quickConnectStatus = "waiting";
    mockOpenBrowser.mockResolvedValue({ type: "cancel" });
    getDefaultStore().set(userAtom as never, null as never);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("opens the server's Quick Connect page with the code filled in", async () => {
    mockOpenBrowser.mockResolvedValueOnce({ type: "dismiss" });
    await render(<Login />);

    await pressLoginWithBrowser();

    expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowser).toHaveBeenCalledWith(codePage);
    // The code is approved in the browser, so no sheet shows it.
    expect(screen.queryByText("close code")).toBeNull();
  });

  // SSO plugins land on Jellyfin's home page after signing in, so the code
  // page is gone by the time the browser is closed.
  test("opens the code page once more when it is closed before the approval", async () => {
    mockOpenBrowser
      .mockResolvedValueOnce({ type: "cancel" })
      .mockResolvedValueOnce({ type: "dismiss" });
    await render(<Login />);
    await pressLoginWithBrowser();

    // Not right away: iOS reports the close while the browser is still
    // animating away, and one presented then never shows.
    expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
    await waitBeforeReopening();

    expect(mockOpenBrowser).toHaveBeenCalledTimes(2);
    expect(mockOpenBrowser).toHaveBeenLastCalledWith(codePage);
  });

  // Closed again, the user may have given up, so it must not loop.
  test("asks before opening it again a second time", async () => {
    await render(<Login />);
    await pressLoginWithBrowser();
    await waitBeforeReopening();
    await waitBeforeReopening();

    expect(mockOpenBrowser).toHaveBeenCalledTimes(2);
    const [message, options] = jest.mocked(toast.info).mock.calls[0];
    expect(message).toBe("login.browser_not_finished");
    const action = options?.action as ToastAction;

    await act(async () => {
      action.onClick();
    });

    expect(mockOpenBrowser).toHaveBeenCalledTimes(3);
    expect(mockOpenBrowser).toHaveBeenLastCalledWith(codePage);
  });

  test("does not open it again when the code goes through during the wait", async () => {
    const view = await render(<Login />);
    await pressLoginWithBrowser();

    mockJellyfin.quickConnectStatus = "signed-in";
    await view.rerender(<Login />);
    await waitBeforeReopening();

    expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
  });

  test("does not open it again after leaving the login screen", async () => {
    const view = await render(<Login />);
    await pressLoginWithBrowser();

    await view.unmount();
    await waitBeforeReopening();

    expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
  });

  test("does not continue with a code that is no longer waiting", async () => {
    const view = await render(<Login />);
    await pressLoginWithBrowser();
    await waitBeforeReopening();
    await waitBeforeReopening();
    const [, options] = jest.mocked(toast.info).mock.calls[0];
    const action = options?.action as ToastAction;

    mockJellyfin.quickConnectStatus = "expired";
    await view.rerender(<Login />);
    await act(async () => {
      action.onClick();
    });

    expect(mockOpenBrowser).toHaveBeenCalledTimes(2);
  });

  test("closes the browser once the code signed the user in", async () => {
    mockOpenBrowser.mockReturnValueOnce(new Promise(() => {}));
    await render(<Login />);
    await pressLoginWithBrowser();

    await act(async () => {
      getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
    });

    expect(mockDismissBrowser).toHaveBeenCalledTimes(1);
  });

  // Android's browser call returns right away, so the app coming back to the
  // front stands in for the browser closing.
  describe("on Android", () => {
    const leaveAndComeBack = () =>
      act(async () => {
        emitAppState("background");
        emitAppState("active");
      });

    beforeEach(() => {
      stubReactNative({ OS: "android" });
      mockOpenBrowser.mockResolvedValue({ type: "opened" });
    });

    afterEach(() => {
      stubReactNative();
    });

    test("opens the code page again when the app comes back before the approval", async () => {
      await render(<Login />);
      await pressLoginWithBrowser();

      await leaveAndComeBack();
      await waitBeforeReopening();

      expect(mockOpenBrowser).toHaveBeenCalledTimes(2);
      expect(mockOpenBrowser).toHaveBeenLastCalledWith(codePage);
    });

    // Timers pause while the app is in the background, so the approval is
    // seen only after coming back, during the wait.
    test("does not open it again when the app comes back after the approval", async () => {
      const view = await render(<Login />);
      await pressLoginWithBrowser();

      await leaveAndComeBack();
      mockJellyfin.quickConnectStatus = "authenticating";
      await view.rerender(<Login />);
      await waitBeforeReopening();

      expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
    });
  });
});

describe("Login with a password", () => {
  beforeEach(() => {
    getDefaultStore().set(userAtom as never, null as never);
  });

  test("signs in only once a username is typed", async () => {
    await render(<Login />);

    await fireEvent.press(screen.getByText("login.login_button"));
    expect(mockJellyfin.login).not.toHaveBeenCalled();

    await fireEvent.changeText(
      screen.getByPlaceholderText("login.username_placeholder"),
      "alice",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("login.password_placeholder"),
      "secret",
    );
    await act(async () => {
      await fireEvent.press(screen.getByText("login.login_button"));
    });

    expect(mockJellyfin.login).toHaveBeenCalledTimes(1);
    expect(mockJellyfin.login.mock.calls[0].slice(0, 2)).toEqual([
      "alice",
      "secret",
    ]);
  });

  test("does not sign in with a username made of spaces", async () => {
    await render(<Login />);

    await fireEvent.changeText(
      screen.getByPlaceholderText("login.username_placeholder"),
      "   ",
    );
    await fireEvent.press(screen.getByText("login.login_button"));

    expect(mockJellyfin.login).not.toHaveBeenCalled();
  });
});
