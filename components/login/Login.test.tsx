import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { getDefaultStore } from "jotai";
import type React from "react";
import { Alert } from "react-native";
import type { QuickConnectStatus } from "@/hooks/useQuickConnect";
import { pendingAccountSaveAtom, userAtom } from "@/providers/JellyfinProvider";
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
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ setOptions: () => {} }),
}));
jest.mock("i18next", () => ({ t: (key: string) => key }));
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
jest.mock("@/components/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => {
    const { Text } = jest.requireActual("react-native");
    return <Text>{children}</Text>;
  },
}));
jest.mock("@/components/common/Input", () => ({ Input: () => null }));
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
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
jest.mock("@/utils/jellyfin/checkServer", () => ({
  checkJellyfinServer: jest.fn(),
  ServerTooOldError: class extends Error {},
}));

describe("Login Quick Connect", () => {
  beforeEach(() => {
    mockStopPolling.mockClear();
    mockJellyfin.initiateQuickConnect.mockClear();
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
