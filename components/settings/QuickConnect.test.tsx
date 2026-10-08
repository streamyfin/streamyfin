import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { Alert } from "react-native";
import { QuickConnect } from "@/components/settings/QuickConnect";

const mockAuthorize = jest.fn();
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getQuickConnectApi: () => ({
    authorizeQuickConnect: (params: { code: string }) => mockAuthorize(params),
  }),
}));
const mockEnabled = jest.fn(async () => true);
jest.mock("@/utils/seerrQuickConnect", () => ({
  isQuickConnectEnabled: () => mockEnabled(),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "https://media.example.com" }),
    userAtom: atom({ Id: "user-1", Name: "Ada" }),
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
  useTranslation: () => ({ t: (key: string) => key }),
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

const typeCode = async (code: string) => {
  await act(async () => {
    await fireEvent.changeText(screen.getByTestId("quick-connect-code"), code);
  });
};

describe("Settings, Quick Connect", () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    mockAuthorize.mockReset();
    mockAuthorize.mockResolvedValue({ status: 200, data: true });
    mockEnabled.mockReset();
    mockEnabled.mockResolvedValue(true);
    mockClose.mockClear();
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  // Like the PIN entry: the code goes as soon as it is complete.
  test("authorizes on its own once the sixth digit is in", async () => {
    await render(<QuickConnect />);
    await typeCode("12345");
    expect(mockAuthorize).not.toHaveBeenCalled();

    await typeCode("123456");
    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    expect(mockAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({ code: "123456" }),
    );
    expect(mockClose).toHaveBeenCalled();
  });

  test("authorizes a pasted code", async () => {
    mockClipboard = "123 456";
    await render(<QuickConnect />);
    await act(async () => {
      await fireEvent.press(
        screen.getByText("home.settings.quick_connect.paste_code"),
      );
    });

    expect(mockAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({ code: "123456" }),
    );
  });

  // A wrong or expired code: say so under the cells and empty them for
  // another try, without a dialog in the way.
  test("shows a wrong code under the cells and clears them", async () => {
    mockAuthorize.mockRejectedValue(httpError(404));
    await render(<QuickConnect />);
    await typeCode("123456");

    expect(
      screen.getByText("home.settings.quick_connect.invalid_code"),
    ).toBeTruthy();
    expect(screen.getByTestId("quick-connect-code").props.value).toBe("");
    expect(alert).not.toHaveBeenCalled();
    expect(mockClose).not.toHaveBeenCalled();
  });

  // Jellyfin answers an approval with a 401 while Quick Connect is off, and
  // the session handling takes any 401 for an expired token (#2237).
  test("says Quick Connect is off instead of asking the server to approve", async () => {
    mockEnabled.mockResolvedValue(false);
    await render(<QuickConnect />);
    await typeCode("123456");

    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(
      screen.getByText("home.settings.quick_connect.disabled"),
    ).toBeTruthy();
  });

  test("says the server cannot be reached when no answer comes back", async () => {
    mockAuthorize.mockRejectedValue(httpError());
    await render(<QuickConnect />);
    await typeCode("123456");

    expect(screen.getByText("home.server_unreachable_message")).toBeTruthy();
  });
});
