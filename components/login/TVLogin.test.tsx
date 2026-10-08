import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { getDefaultStore } from "jotai";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { TVLogin } from "@/components/login/TVLogin";
import { QUICK_CONNECT_CODE_LIFETIME_MS } from "@/constants/QuickConnect";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const mockInitiateQuickConnect = jest.fn(async () => "123456");
const mockStopQuickConnectPolling = jest.fn();
const mockSaveCurrentAccount = jest.fn(async (_options: unknown) => {});
const mockPublicInfo = jest.fn(async () => ({ data: { Id: "server-1" } }));
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getSystemApi: () => ({ getPublicSystemInfo: () => mockPublicInfo() }),
}));
// Stable, like the provider's own callbacks: TVLogin's cleanup effect keys on
// stopQuickConnectPolling.
const mockJellyfin = {
  setServer: jest.fn(),
  login: jest.fn(),
  removeServer: jest.fn(),
  initiateQuickConnect: () => mockInitiateQuickConnect(),
  stopQuickConnectPolling: () => mockStopQuickConnectPolling(),
  loginWithSavedCredential: jest.fn(),
  loginWithPassword: jest.fn(),
  saveCurrentAccount: (options: unknown) => mockSaveCurrentAccount(options),
};
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://jellyfin.local:8096" }),
    userAtom: atom(null),
    useJellyfin: () => mockJellyfin,
  };
});
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ setOptions: () => {} }),
}));
jest.mock("i18next", () => ({ t: (key: string) => key }));
/** The last back handler a screen registered, to press back from the spec. */
let mockBackHandler: (() => unknown) | null = null;
jest.mock("@/hooks/useTVBackPress", () => ({
  useTVBackPress: (handler: () => unknown) => {
    mockBackHandler = handler;
  },
  useTVMenuKeyInterception: () => {},
}));
// The real scale reads the settings atom, which loads the whole settings UI.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 20, heading: 28 }),
}));
// The real button's focus animation pulls in the settings atom and, through
// it, Reanimated.
jest.mock("@/components/tv/TVButton", () => ({
  TVButton: (props: { onPress: () => void; children: React.ReactNode }) =>
    MockTVButton(props),
}));
const MockTVButton = (props: {
  onPress: () => void;
  children: React.ReactNode;
}) => <Pressable onPress={props.onPress}>{props.children}</Pressable>;
// The QR code itself is native SVG; what matters is the address it carries.
jest.mock("react-native-qrcode-svg", () => ({
  __esModule: true,
  default: (props: { value: string }) => MockQRCode(props),
}));
const MockQRCode = (props: { value: string }) => <Text>{props.value}</Text>;
/** The form's "save account" switch, read when Quick Connect is pressed. */
let mockSaveAccount = false;
jest.mock("@/components/login/TVAddUserForm", () => ({
  TVAddUserForm: (props: { onQuickConnect: (saveAccount: boolean) => void }) =>
    MockAddUserForm(props),
}));
const MockAddUserForm = (props: {
  onQuickConnect: (saveAccount: boolean) => void;
}) => (
  <Pressable onPress={() => props.onQuickConnect(mockSaveAccount)}>
    <Text>add user form</Text>
  </Pressable>
);
type SaveModalProps = {
  visible: boolean;
  username: string;
  allowPassword?: boolean;
  onSave: (securityType: string, pinCode?: string) => void;
};
const mockToastError = jest.fn();
jest.mock("sonner-native", () => ({
  toast: { error: (message: string) => mockToastError(message) },
}));
jest.mock("@/components/login/TVSaveAccountModal", () => ({
  TVSaveAccountModal: (props: SaveModalProps) => MockSaveAccountModal(props),
}));
const MockSaveAccountModal = (props: SaveModalProps) =>
  props.visible ? (
    <>
      <Text>{props.username}</Text>
      {props.allowPassword === false && <Text>no password option</Text>}
      <Pressable onPress={() => props.onSave("pin", "1234")}>
        <Text>protect with a PIN</Text>
      </Pressable>
    </>
  ) : null;
jest.mock("@/components/login/TVPINEntryModal", () => ({
  TVPINEntryModal: () => null,
}));
jest.mock("@/components/login/TVPasswordEntryModal", () => ({
  TVPasswordEntryModal: () => null,
}));
jest.mock("@/components/login/TVServerSelectionScreen", () => ({
  TVServerSelectionScreen: () => null,
}));
jest.mock("@/components/login/TVUserSelectionScreen", () => ({
  TVUserSelectionScreen: () => null,
}));
jest.mock("@/components/login/TVAddServerForm", () => ({
  TVAddServerForm: () => null,
}));

describe("TVLogin", () => {
  beforeEach(() => {
    mockInitiateQuickConnect.mockClear();
    mockInitiateQuickConnect.mockImplementation(async () => "123456");
    mockStopQuickConnectPolling.mockClear();
    mockSaveCurrentAccount.mockReset();
    mockSaveCurrentAccount.mockImplementation(async () => {});
    mockPublicInfo.mockReset();
    mockPublicInfo.mockImplementation(async () => ({
      data: { Id: "server-1" },
    }));
    mockToastError.mockClear();
    getDefaultStore().set(
      apiAtom as never,
      { basePath: "http://jellyfin.local:8096" } as never,
    );
    mockSaveAccount = false;
    mockBackHandler = null;
    getDefaultStore().set(userAtom as never, null as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const startQuickConnect = async () => {
    await act(async () => {
      await fireEvent.press(screen.getByText("add user form"));
    });
  };

  // The TV starts Quick Connect on its server and shows the code with a QR
  // code a phone approves it from. The TV then signs in by itself.
  test("shows the Quick Connect code and its QR code for the server", async () => {
    await render(<TVLogin />);
    await act(async () => {
      await fireEvent.press(screen.getByText("add user form"));
    });

    expect(mockInitiateQuickConnect).toHaveBeenCalledTimes(1);
    expect(screen.getByText("123456")).toBeTruthy();
    // The server id lets the phone tell a TV on another server apart.
    expect(
      screen.getByText(
        "http://jellyfin.local:8096/web/#/quickconnect?code=123456&serverId=server-1",
      ),
    ).toBeTruthy();
  });

  test("still shows the code when the server id cannot be read", async () => {
    mockPublicInfo.mockImplementation(async () => {
      throw new Error("offline");
    });
    await render(<TVLogin />);
    await startQuickConnect();

    expect(
      screen.getByText(
        "http://jellyfin.local:8096/web/#/quickconnect?code=123456",
      ),
    ).toBeTruthy();
  });

  // Jellyfin drops a Quick Connect request after ten minutes. The TV says so
  // and offers a new code instead of showing one nobody can approve.
  test("offers a new code once the code has expired", async () => {
    jest.useFakeTimers();
    await render(<TVLogin />);
    await startQuickConnect();
    mockInitiateQuickConnect.mockImplementation(async () => "654321");

    await act(async () => {
      jest.advanceTimersByTime(QUICK_CONNECT_CODE_LIFETIME_MS);
    });
    expect(screen.getByText("pairing.code_expired")).toBeTruthy();
    expect(screen.queryByText("123456")).toBeNull();

    await act(async () => {
      await fireEvent.press(screen.getByText("pairing.get_new_code"));
    });
    expect(mockStopQuickConnectPolling).toHaveBeenCalled();
    expect(mockInitiateQuickConnect).toHaveBeenCalledTimes(2);
    expect(screen.getByText("654321")).toBeTruthy();
  });

  // With "save account" on, the TV asks how to protect the account first, as
  // the password sign-in does, and saves it once the phone has approved.
  test("asks how to protect the account first, and saves it once signed in", async () => {
    mockSaveAccount = true;
    await render(<TVLogin />);
    await startQuickConnect();
    expect(mockInitiateQuickConnect).not.toHaveBeenCalled();

    await act(async () => {
      await fireEvent.press(screen.getByText("protect with a PIN"));
    });
    expect(mockInitiateQuickConnect).toHaveBeenCalledTimes(1);
    expect(mockSaveCurrentAccount).not.toHaveBeenCalled();

    await act(async () => {
      getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
    });
    expect(mockSaveCurrentAccount).toHaveBeenCalledWith({
      securityType: "pin",
      pinCode: "1234",
      serverName: "",
    });
  });

  // Going back from the code drops the protection chosen for it: a password
  // sign-in afterwards follows its own "save account" switch.
  test("forgets the protection chosen for Quick Connect after going back", async () => {
    mockSaveAccount = true;
    await render(<TVLogin />);
    await startQuickConnect();
    await act(async () => {
      await fireEvent.press(screen.getByText("protect with a PIN"));
    });

    await act(async () => {
      mockBackHandler?.();
    });
    await act(async () => {
      getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
    });
    expect(mockSaveCurrentAccount).not.toHaveBeenCalled();
  });

  test("forgets the protection chosen when Quick Connect cannot start", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockInitiateQuickConnect.mockImplementation(async () => {
      throw new Error("403");
    });
    mockSaveAccount = true;
    await render(<TVLogin />);
    await startQuickConnect();
    await act(async () => {
      await fireEvent.press(screen.getByText("protect with a PIN"));
    });

    await act(async () => {
      getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
    });
    expect(mockSaveCurrentAccount).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  test("saves nothing after a start that brought no code", async () => {
    mockInitiateQuickConnect.mockImplementation(
      async () => undefined as unknown as string,
    );
    mockSaveAccount = true;
    await render(<TVLogin />);
    await startQuickConnect();
    await act(async () => {
      await fireEvent.press(screen.getByText("protect with a PIN"));
    });
    await act(async () => {
      getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
    });

    expect(mockSaveCurrentAccount).not.toHaveBeenCalled();
  });

  // Getting a new code is the same sign-in: a failed attempt keeps the
  // protection chosen for it.
  test("keeps the protection when getting a new code fails once", async () => {
    jest.useFakeTimers();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockSaveAccount = true;
    await render(<TVLogin />);
    await startQuickConnect();
    await act(async () => {
      await fireEvent.press(screen.getByText("protect with a PIN"));
    });
    await act(async () => {
      jest.advanceTimersByTime(QUICK_CONNECT_CODE_LIFETIME_MS);
    });

    mockInitiateQuickConnect.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    await act(async () => {
      await fireEvent.press(screen.getByText("pairing.get_new_code"));
    });
    mockInitiateQuickConnect.mockImplementationOnce(async () => "654321");
    await act(async () => {
      await fireEvent.press(screen.getByText("pairing.get_new_code"));
    });
    expect(screen.getByText("654321")).toBeTruthy();

    await act(async () => {
      getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
    });
    expect(mockSaveCurrentAccount).toHaveBeenCalledWith(
      expect.objectContaining({ securityType: "pin", pinCode: "1234" }),
    );
  });

  // The provider starts polling as soon as it has a code: a new code still on
  // its way when the user goes back must not leave it polling a code nobody
  // sees, which would sign the TV in from the form.
  test("stops polling for a new code that arrives after going back", async () => {
    jest.useFakeTimers();
    await render(<TVLogin />);
    await startQuickConnect();
    await act(async () => {
      jest.advanceTimersByTime(QUICK_CONNECT_CODE_LIFETIME_MS);
    });
    let answer: (code: string) => void = () => {};
    mockInitiateQuickConnect.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          answer = resolve;
        }),
    );
    await act(async () => {
      fireEvent.press(screen.getByText("pairing.get_new_code"));
    });
    await act(async () => {
      mockBackHandler?.();
    });
    mockStopQuickConnectPolling.mockClear();

    await act(async () => {
      answer("654321");
    });
    expect(mockStopQuickConnectPolling).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("654321")).toBeNull();
  });

  test("starts Quick Connect once for a press made twice", async () => {
    let answer: (code: string) => void = () => {};
    mockInitiateQuickConnect.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          answer = resolve;
        }),
    );
    await render(<TVLogin />);
    await act(async () => {
      fireEvent.press(screen.getByText("add user form"));
      fireEvent.press(screen.getByText("add user form"));
    });
    await act(async () => {
      answer("123456");
    });

    expect(mockInitiateQuickConnect).toHaveBeenCalledTimes(1);
  });

  // The default TV button turns white when focused, as the new code button is
  // from the start.
  test("writes Get a new code dark on its light button", async () => {
    jest.useFakeTimers();
    await render(<TVLogin />);
    await startQuickConnect();
    await act(async () => {
      jest.advanceTimersByTime(QUICK_CONNECT_CODE_LIFETIME_MS);
    });

    expect(
      StyleSheet.flatten(screen.getByText("pairing.get_new_code").props.style)
        .color,
    ).toBe("#000000");
  });

  // Nobody has approved the code yet, so the sheet says whose account it will
  // be, and a password protection would lock out an account that signs in
  // through single sign-on.
  test("names the account the save is for, without a password protection", async () => {
    mockSaveAccount = true;
    await render(<TVLogin />);
    await startQuickConnect();

    expect(screen.getByText("pairing.account_that_approves")).toBeTruthy();
    expect(screen.getByText("no password option")).toBeTruthy();
  });

  test("says the account was not saved when saving fails", async () => {
    mockSaveCurrentAccount.mockImplementation(async () => {
      throw new Error("keychain");
    });
    mockSaveAccount = true;
    await render(<TVLogin />);
    await startQuickConnect();
    await act(async () => {
      await fireEvent.press(screen.getByText("protect with a PIN"));
    });
    await act(async () => {
      getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
    });

    expect(mockToastError).toHaveBeenCalledWith("save_account.not_saved");
  });

  // Jellyfin answers 401 to a start while Quick Connect is off.
  test("says Quick Connect is off when the server will not start it", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockInitiateQuickConnect.mockImplementation(async () => {
      throw new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 401,
      } as AxiosResponse);
    });
    await render(<TVLogin />);
    await startQuickConnect();

    expect(alert).toHaveBeenCalledWith(
      "login.error_title",
      "companion_login.error_quick_connect_disabled",
    );
  });

  // Over http, the camera would open the web client and have the password
  // typed in clear on the local network: only the app is suggested then.
  test("suggests only the app for a server reached over http", async () => {
    await render(<TVLogin />);
    await startQuickConnect();

    expect(screen.getByText("pairing.scan_with_app")).toBeTruthy();
    expect(screen.queryByText("pairing.scan_quick_connect")).toBeNull();
  });

  test("suggests the app or the camera for a server reached over https", async () => {
    getDefaultStore().set(
      apiAtom as never,
      { basePath: "https://media.example.com" } as never,
    );
    await render(<TVLogin />);
    await startQuickConnect();

    expect(screen.getByText("pairing.scan_quick_connect")).toBeTruthy();
  });

  test("saves nothing when the account is not to be saved", async () => {
    await render(<TVLogin />);
    await startQuickConnect();
    await act(async () => {
      getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
    });

    expect(mockSaveCurrentAccount).not.toHaveBeenCalled();
  });

  test("stops waiting for approval and returns to the form on back", async () => {
    await render(<TVLogin />);
    await act(async () => {
      await fireEvent.press(screen.getByText("add user form"));
    });
    mockStopQuickConnectPolling.mockClear();

    await act(async () => {
      mockBackHandler?.();
    });
    expect(mockStopQuickConnectPolling).toHaveBeenCalledTimes(1);
    expect(screen.getByText("add user form")).toBeTruthy();
  });

  // Quick Connect can be turned off on the server: the TV says so instead of
  // showing a code nobody can approve.
  test("says so when the server will not start Quick Connect", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockInitiateQuickConnect.mockImplementation(async () => {
      throw new Error("403");
    });
    await render(<TVLogin />);
    await act(async () => {
      await fireEvent.press(screen.getByText("add user form"));
    });

    expect(alert).toHaveBeenCalledWith(
      "login.error_title",
      "login.failed_to_initiate_quick_connect",
    );
    expect(screen.getByText("add user form")).toBeTruthy();
    alert.mockRestore();
  });
});
