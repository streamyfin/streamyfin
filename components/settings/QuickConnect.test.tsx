import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { AccessibilityInfo, Alert } from "react-native";
import { QuickConnect } from "@/components/settings/QuickConnect";

const mockAuthorize = jest.fn();
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getQuickConnectApi: () => ({
    authorizeQuickConnect: (
      params: { code: string },
      options?: { signal?: AbortSignal },
    ) => mockAuthorize(params, options),
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

  const pressAuthorize = async () => {
    await act(async () => {
      await fireEvent.press(
        screen.getByText("home.settings.quick_connect.authorize"),
      );
    });
  };

  // Like the PIN entry: the code goes as soon as it is complete.
  test("authorizes on its own once the sixth digit is in", async () => {
    await render(<QuickConnect />);
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
    await render(<QuickConnect />);
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
    await render(<QuickConnect />);
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
    await render(<QuickConnect />);
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
    await render(<QuickConnect />);
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
    await render(<QuickConnect />);
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
    await render(<QuickConnect />);
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
    await render(<QuickConnect />);
    await typeCode("123456");

    expect(screen.getByTestId("quick-connect-code").props.editable).toBe(false);
  });

  test("says Quick Connect is off instead of asking the server to approve", async () => {
    mockEnabled.mockResolvedValue(false);
    await render(<QuickConnect />);
    await typeCode("123456");

    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(
      screen.getByText("home.settings.quick_connect.disabled"),
    ).toBeTruthy();
  });

  test("says the server cannot be reached when its proxy answers for it", async () => {
    mockAuthorize.mockRejectedValue(httpError(502));
    await render(<QuickConnect />);
    await typeCode("123456");

    expect(screen.getByText("home.server_unreachable_message")).toBeTruthy();
  });

  test("says the server cannot be reached when no answer comes back", async () => {
    mockAuthorize.mockRejectedValue(httpError());
    await render(<QuickConnect />);
    await typeCode("123456");

    expect(screen.getByText("home.server_unreachable_message")).toBeTruthy();
  });
});
