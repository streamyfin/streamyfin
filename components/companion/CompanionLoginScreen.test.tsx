import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
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
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getQuickConnectApi: () => ({
    authorizeQuickConnect: (params: { code: string; userId?: string }) =>
      mockAuthorize(params),
  }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "https://media.example.com" }),
    userAtom: atom({ Id: "user-1", Name: "Ada" }),
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
jest.mock("expo-camera", () => ({
  Camera: {
    getCameraPermissionsAsync: async () => ({ granted: true }),
    requestCameraPermissionsAsync: async () => ({ granted: true }),
  },
  CameraView: (props: {
    onBarcodeScanned: (result: { data: string }) => void;
  }) => MockCamera(props),
}));

const scan = async (data: string) => {
  mockScanned = data;
  await fireEvent.press(screen.getByText("camera"));
};

describe("CompanionLoginScreen", () => {
  beforeEach(() => {
    mockAuthorize.mockClear();
    mockAuthorize.mockImplementation(async () => ({ status: 200, data: true }));
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

    await fireEvent.press(screen.getByText("companion_login.authorize_button"));
    expect(mockAuthorize).toHaveBeenCalledWith({
      code: "123456",
      userId: "user-1",
    });
    expect(screen.getByText("companion_login.success_title")).toBeTruthy();
  });

  test("approves a code typed by hand", async () => {
    await render(<CompanionLoginScreen />);
    await fireEvent.press(
      screen.getByText("companion_login.enter_code_manually"),
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText("companion_login.pairing_code_label"),
      "042 117",
    );
    await fireEvent.press(screen.getByText("companion_login.authorize_button"));
    expect(mockAuthorize).toHaveBeenCalledWith({
      code: "042117",
      userId: "user-1",
    });
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
      throw new Error("404");
    });
    await render(<CompanionLoginScreen />);
    await scan(quickConnectPairingUrl("https://other.example.com", "123456"));
    await act(async () => {
      await fireEvent.press(
        screen.getByText("companion_login.authorize_button"),
      );
    });

    expect(
      screen.getByText(
        'companion_login.error_code_not_waiting {"server":"media.example.com"}',
      ),
    ).toBeTruthy();
  });

  test("says the code is not waiting when the server does not approve it", async () => {
    mockAuthorize.mockImplementation(async () => ({
      status: 200,
      data: false,
    }));
    await render(<CompanionLoginScreen />);
    await scan(quickConnectPairingUrl("https://media.example.com", "123456"));
    await act(async () => {
      await fireEvent.press(
        screen.getByText("companion_login.authorize_button"),
      );
    });

    expect(
      screen.getByText(
        'companion_login.error_code_not_waiting {"server":"media.example.com"}',
      ),
    ).toBeTruthy();
  });
});
