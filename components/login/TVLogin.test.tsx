import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, Pressable, Text } from "react-native";
import { TVLogin } from "@/components/login/TVLogin";

const mockInitiateQuickConnect = jest.fn(async () => "123456");
const mockStopQuickConnectPolling = jest.fn();
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
};
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://jellyfin.local:8096" }),
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
// The QR code itself is native SVG; what matters is the address it carries.
jest.mock("react-native-qrcode-svg", () => ({
  __esModule: true,
  default: (props: { value: string }) => MockQRCode(props),
}));
const MockQRCode = (props: { value: string }) => <Text>{props.value}</Text>;
jest.mock("@/components/login/TVAddUserForm", () => ({
  TVAddUserForm: (props: { onQuickConnect: () => void }) =>
    MockAddUserForm(props),
}));
const MockAddUserForm = (props: { onQuickConnect: () => void }) => (
  <Pressable onPress={props.onQuickConnect}>
    <Text>add user form</Text>
  </Pressable>
);
jest.mock("@/components/login/TVSaveAccountModal", () => ({
  TVSaveAccountModal: () => null,
}));
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
    mockBackHandler = null;
  });

  // The TV starts Quick Connect on its server and shows the code with a QR
  // code a phone approves it from. The TV then signs in by itself.
  test("shows the Quick Connect code and its QR code for the server", async () => {
    await render(<TVLogin />);
    await act(async () => {
      await fireEvent.press(screen.getByText("add user form"));
    });

    expect(mockInitiateQuickConnect).toHaveBeenCalledTimes(1);
    expect(screen.getByText("123456")).toBeTruthy();
    expect(
      screen.getByText(
        "http://jellyfin.local:8096/web/#/quickconnect?code=123456",
      ),
    ).toBeTruthy();
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
