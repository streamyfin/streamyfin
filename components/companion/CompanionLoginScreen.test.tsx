import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { Pressable, StyleSheet, Text } from "react-native";
import { CompanionLoginScreen } from "@/components/companion/CompanionLoginScreen";
import { quickConnectPairingUrl } from "@/utils/quickConnectPairing";

const mockAuthorize = jest.fn(
  async (_params: {
    code: string;
    userId?: string;
  }): Promise<{ status: number; data: boolean }> => ({
    status: 200,
    data: true,
  }),
);
const mockEnabled = jest.fn(async () => ({ data: true }));
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getQuickConnectApi: () => ({
    authorizeQuickConnect: (params: { code: string; userId?: string }) =>
      mockAuthorize(params),
    getQuickConnectEnabled: () => mockEnabled(),
  }),
}));
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));
// The sheet's own input throws outside a bottom sheet, which this screen is
// not: the code field has to be a plain one.
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetTextInput: () => {
    throw new Error("BottomSheetTextInput outside a bottom sheet");
  },
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "https://media.example.com" }),
    userAtom: atom({ Id: "user-1", Name: "Ada", ServerId: "server-1" }),
  };
});
const mockRouter = { back: jest.fn() };
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => mockRouter,
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

/** What the camera reads when the spec presses it. */
let mockScanned = "";
// The camera stands for a scan: pressing it reads mockScanned.
const MockCamera = (props: {
  onBarcodeScanned: (result: { data: string }) => void;
}) => (
  <Pressable onPress={() => props.onBarcodeScanned({ data: mockScanned })}>
    <Text>camera</Text>
  </Pressable>
);
/** What the camera permission prompts answer. */
let mockPermission = { granted: true, canAskAgain: true };
/** Set to make the permission check itself fail. */
let mockPermissionCheckFails = false;
/** Set to hold the permission prompt open until the spec answers it. */
let mockPermissionPrompt: Promise<typeof mockPermission> | null = null;
jest.mock("expo-camera", () => ({
  Camera: {
    getCameraPermissionsAsync: async () => {
      if (mockPermissionCheckFails) throw new Error("no camera service");
      return mockPermission;
    },
    requestCameraPermissionsAsync: async () =>
      mockPermissionPrompt ?? mockPermission,
  },
  CameraView: (props: {
    onBarcodeScanned: (result: { data: string }) => void;
  }) => MockCamera(props),
}));

const httpError = (status?: number) =>
  new AxiosError(
    "request failed",
    status ? "ERR_BAD_RESPONSE" : "ERR_NETWORK",
    undefined,
    undefined,
    status ? ({ status } as AxiosResponse) : undefined,
  );

const pressAuthorize = async () => {
  await act(async () => {
    await fireEvent.press(screen.getByText("companion_login.authorize_button"));
  });
};

const scan = async (data: string) => {
  mockScanned = data;
  await fireEvent.press(screen.getByText("camera"));
};

describe("CompanionLoginScreen", () => {
  beforeEach(() => {
    mockAuthorize.mockClear();
    mockAuthorize.mockImplementation(async () => ({ status: 200, data: true }));
    mockEnabled.mockClear();
    mockEnabled.mockImplementation(async () => ({ data: true }));
    mockPermission = { granted: true, canAskAgain: true };
    mockPermissionCheckFails = false;
    mockPermissionPrompt = null;
  });

  // The TV shows a Quick Connect code; the phone approves it with its own
  // session, so no password crosses the network.
  test("approves the code a TV shows with the phone's session", async () => {
    await render(<CompanionLoginScreen />);
    await scan(quickConnectPairingUrl("http://jellyfin.local:8096", "123456"));

    expect(
      screen.getByText('companion_login.login_as {"username":"Ada"}'),
    ).toBeTruthy();
    expect(screen.getByText("123456")).toBeTruthy();

    await pressAuthorize();
    // Approved as the phone's own user: the server takes the caller.
    expect(mockAuthorize).toHaveBeenCalledWith({ code: "123456" });
    expect(screen.getByText("companion_login.success_title")).toBeTruthy();
  });

  test("approves a code typed by hand", async () => {
    await render(<CompanionLoginScreen />);
    await fireEvent.press(
      screen.getByText("companion_login.enter_code_manually"),
    );

    await fireEvent.changeText(screen.getByTestId("pairing-code"), "042 117");
    await pressAuthorize();
    expect(mockAuthorize).toHaveBeenCalledWith({ code: "042117" });
  });

  // react-native-tvos puts a toolbar above every iOS number pad; upstream
  // React Native and native apps show none, and Authorize stays in reach.
  test("keeps the toolbar away from the number pad", async () => {
    await render(<CompanionLoginScreen />);
    await fireEvent.press(
      screen.getByText("companion_login.enter_code_manually"),
    );
    const input = screen.getByTestId("pairing-code");

    // With an accessory view id set, React Native leaves its own toolbar out
    // whatever else the input carries.
    expect(input.props.inputAccessoryViewID).toBeTruthy();
  });

  // Fabric reuses a text input's native view and diffs the new props against
  // the ones that view had. Its reuse clears the id, so the same id again is
  // never set back and the toolbar returns from the second opening on.
  test("names another accessory view each time the screen opens", async () => {
    const typeByHand = () =>
      fireEvent.press(screen.getByText("companion_login.enter_code_manually"));
    const { unmount } = await render(<CompanionLoginScreen />);
    await typeByHand();
    const first = screen.getByTestId("pairing-code").props.inputAccessoryViewID;
    await unmount();
    await render(<CompanionLoginScreen />);
    await typeByHand();

    expect(
      screen.getByTestId("pairing-code").props.inputAccessoryViewID,
    ).not.toBe(first);
  });

  // Digits only, so the same six cells as Quick Connect in Settings.
  test("shows a typed code in six cells, as Quick Connect does", async () => {
    await render(<CompanionLoginScreen />);
    await fireEvent.press(
      screen.getByText("companion_login.enter_code_manually"),
    );
    await fireEvent.changeText(screen.getByTestId("pairing-code"), "042117");

    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getByText("7")).toBeTruthy();
  });

  // The header floats over the screen on iOS. An automatic inset for it put
  // the card in a box pushed down by the header's height, so the card sat low;
  // the header's height on both sides keeps it mid-screen, as on every other
  // step, and the title clear of the header when the keyboard is up.
  test.each([
    [
      "a scanned code",
      () =>
        scan(quickConnectPairingUrl("http://jellyfin.local:8096", "123456")),
    ],
    [
      "a typed code",
      () =>
        fireEvent.press(
          screen.getByText("companion_login.enter_code_manually"),
        ),
    ],
  ])(
    "keeps the card for %s mid-screen under the header",
    async (_label, open) => {
      await render(
        <HeaderHeightContext value={100}>
          <CompanionLoginScreen />
        </HeaderHeightContext>,
      );
      await open();

      const card = screen.getByTestId("pairing-approval");
      expect(card.props.contentInsetAdjustmentBehavior ?? "never").toBe(
        "never",
      );
      const style = StyleSheet.flatten(card.props.contentContainerStyle);
      const top = style.paddingTop ?? style.paddingVertical ?? style.padding;
      const bottom =
        style.paddingBottom ?? style.paddingVertical ?? style.padding;
      expect(top).toBe(bottom);
      expect(top).toBeGreaterThanOrEqual(100);
    },
  );

  // A second approval of the same code comes back as a 500 from Jellyfin,
  // which would turn a success into an error on screen.
  test("approves a code once for a double tap", async () => {
    let answer: (value: { status: number; data: boolean }) => void = () => {};
    mockAuthorize.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    await render(<CompanionLoginScreen />);
    await scan(quickConnectPairingUrl("https://media.example.com", "123456"));
    await act(async () => {
      fireEvent.press(screen.getByText("companion_login.authorize_button"));
    });
    await act(async () => {
      answer({ status: 200, data: true });
    });

    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    expect(screen.getByText("companion_login.success_title")).toBeTruthy();
  });

  test("shows the permission screen when the permission check itself fails", async () => {
    mockPermissionCheckFails = true;
    await render(<CompanionLoginScreen />);

    expect(
      screen.getByText("companion_login.error_permission_denied"),
    ).toBeTruthy();
  });

  // The prompt can still be open when someone goes on to type the code; a
  // refusal that comes after must not take the code field away.
  test("keeps the code field when the camera is refused after it opened", async () => {
    mockPermission = { granted: false, canAskAgain: true };
    let answer: (value: typeof mockPermission) => void = () => {};
    mockPermissionPrompt = new Promise((resolve) => {
      answer = resolve;
    });
    await render(<CompanionLoginScreen />);
    await fireEvent.press(
      screen.getByText("companion_login.enter_code_manually"),
    );

    await act(async () => {
      answer({ granted: false, canAskAgain: false });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId("pairing-code")).toBeTruthy();
    expect(
      screen.queryByText("companion_login.error_permission_denied"),
    ).toBeNull();
  });

  // A TV on an older version waits for a password over the network, which
  // this app no longer sends.
  test("asks to update a TV that still shows the old pairing code", async () => {
    await render(<CompanionLoginScreen />);
    await scan('{"action":"streamyfin-pair","code":"123456"}');

    expect(screen.getByText("companion_login.error_old_tv")).toBeTruthy();
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  test("rejects a QR code that is not a TV's", async () => {
    await render(<CompanionLoginScreen />);
    await scan("https://example.com/some/page");

    expect(screen.getByText("companion_login.error_invalid_qr")).toBeTruthy();
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  // The server refuses a code it does not hold: expired, typed wrong, or
  // started on another server than the phone's.
  test("says the code is not waiting on the phone's server when refused", async () => {
    mockAuthorize.mockImplementation(async () => {
      throw httpError(404);
    });
    await render(<CompanionLoginScreen />);
    await scan(quickConnectPairingUrl("https://other.example.com", "123456"));
    await pressAuthorize();

    expect(
      screen.getByText(
        'companion_login.error_code_not_waiting {"server":"media.example.com"}',
      ),
    ).toBeTruthy();
  });

  test("says something went wrong when the server does not approve the code", async () => {
    mockAuthorize.mockImplementation(async () => ({
      status: 200,
      data: false,
    }));
    await render(<CompanionLoginScreen />);
    await scan(quickConnectPairingUrl("https://media.example.com", "123456"));
    await pressAuthorize();

    expect(screen.getByText("companion_login.error_generic")).toBeTruthy();
  });

  // Jellyfin answers 401 to an approval while Quick Connect is off, which the
  // session handling would read as an expired token and sign the phone out.
  test("checks that Quick Connect is on before approving, and says when it is not", async () => {
    mockEnabled.mockImplementation(async () => ({ data: false }));
    await render(<CompanionLoginScreen />);
    await scan(quickConnectPairingUrl("https://media.example.com", "123456"));
    await pressAuthorize();

    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'companion_login.error_quick_connect_disabled {"server":"media.example.com"}',
      ),
    ).toBeTruthy();
  });

  test("says the server cannot be reached when no answer comes back", async () => {
    mockAuthorize.mockImplementation(async () => {
      throw httpError();
    });
    await render(<CompanionLoginScreen />);
    await scan(quickConnectPairingUrl("https://media.example.com", "123456"));
    await pressAuthorize();

    expect(screen.getByText("home.server_unreachable_message")).toBeTruthy();
  });

  // An already approved code comes back as a 500.
  test("says something went wrong for any other failure", async () => {
    mockAuthorize.mockImplementation(async () => {
      throw httpError(500);
    });
    await render(<CompanionLoginScreen />);
    await scan(quickConnectPairingUrl("https://media.example.com", "123456"));
    await pressAuthorize();

    expect(screen.getByText("companion_login.error_generic")).toBeTruthy();
  });

  // The TV puts its server's id in the QR code, so a TV on another server is
  // told apart without contacting the address it carries.
  test("says the TV is on another server before asking to approve", async () => {
    await render(<CompanionLoginScreen />);
    await scan(
      quickConnectPairingUrl(
        "http://tv.example.com:8096",
        "123456",
        "server-2",
      ),
    );

    expect(
      screen.getByText(
        'companion_login.error_other_server {"server":"tv.example.com:8096"}',
      ),
    ).toBeTruthy();
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  test("asks to approve when the QR code names the phone's server", async () => {
    await render(<CompanionLoginScreen />);
    await scan(
      quickConnectPairingUrl(
        "http://tv.example.com:8096",
        "123456",
        "SERVER-1",
      ),
    );

    expect(
      screen.getByText('companion_login.login_as {"username":"Ada"}'),
    ).toBeTruthy();
  });

  // With the camera refused, scanning again has to land back on the
  // permission screen, not on a camera that shows nothing.
  test("goes back to the permission screen on scan again when the camera is refused", async () => {
    mockPermission = { granted: false, canAskAgain: false };
    await render(<CompanionLoginScreen />);
    expect(
      screen.getByText("companion_login.error_permission_denied"),
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByText("companion_login.enter_code_manually"),
    );
    await act(async () => {
      await fireEvent.press(screen.getByText("companion_login.scan_again"));
    });

    expect(
      screen.getByText("companion_login.error_permission_denied"),
    ).toBeTruthy();
    expect(screen.queryByText("camera")).toBeNull();
  });
});
