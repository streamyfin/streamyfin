import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { QuickConnectCodeModal } from "./QuickConnectCodeModal";

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
let mockSheetChange: ((index: number) => void) | undefined;
jest.mock("@gorhom/bottom-sheet", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    BottomSheetModal: React.forwardRef(
      (
        props: {
          children: React.ReactNode;
          onChange: (index: number) => void;
        },
        ref: React.Ref<unknown>,
      ) => {
        mockSheetChange = props.onChange;
        React.useImperativeHandle(ref, () => ({
          present: () => mockPresent(),
          dismiss: () => mockDismiss(),
        }));
        return props.children;
      },
    ),
    BottomSheetView: View,
    BottomSheetBackdrop: () => null,
  };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("sonner-native", () => ({ toast: { success: jest.fn() } }));

describe("QuickConnectCodeModal", () => {
  beforeEach(() => {
    mockPresent.mockClear();
    mockDismiss.mockClear();
    mockSheetChange = undefined;
  });

  test("replaces a server-expired code with a new-code action", async () => {
    const retry = jest.fn();
    const view = await render(
      <QuickConnectCodeModal
        code='123456'
        status='waiting'
        serverName='Media'
        onNewCode={retry}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("123456")).toBeTruthy();

    await view.rerender(
      <QuickConnectCodeModal
        code='123456'
        status='expired'
        serverName='Media'
        onNewCode={retry}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByText("123456")).toBeNull();
    expect(screen.queryByText("login.tap_code_to_copy")).toBeNull();
    expect(screen.getByText("pairing.code_expired")).toBeTruthy();
    await fireEvent.press(screen.getByText("pairing.get_new_code"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test("explains when Quick Connect is turned off and hides the code", async () => {
    await render(
      <QuickConnectCodeModal
        code='123456'
        status='disabled'
        serverName='Media'
        onNewCode={() => {}}
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByText("companion_login.error_quick_connect_disabled"),
    ).toBeTruthy();
    expect(screen.queryByText("123456")).toBeNull();
    expect(screen.queryByText("pairing.get_new_code")).toBeNull();
  });

  test.each(["authenticating", "signed-in"] as const)(
    "hides the code while Quick Connect is %s",
    async (status) => {
      await render(
        <QuickConnectCodeModal
          code='123456'
          status={status}
          serverName='Media'
          onNewCode={() => {}}
          onClose={() => {}}
        />,
      );
      expect(screen.queryByText("123456")).toBeNull();
      expect(screen.getByText("common.loading")).toBeTruthy();
    },
  );

  test("reports a swipe dismissal once and can present another code", async () => {
    const close = jest.fn();
    const view = await render(
      <QuickConnectCodeModal
        code='123456'
        status='waiting'
        serverName='Media'
        onNewCode={() => {}}
        onClose={close}
      />,
    );
    await act(async () => {
      mockSheetChange?.(0);
      mockSheetChange?.(-1);
    });
    expect(close).toHaveBeenCalledTimes(1);
    await view.rerender(
      <QuickConnectCodeModal
        code={null}
        status='idle'
        serverName='Media'
        onNewCode={() => {}}
        onClose={close}
      />,
    );
    expect(mockDismiss).not.toHaveBeenCalled();
    await view.rerender(
      <QuickConnectCodeModal
        code='654321'
        status='waiting'
        serverName='Media'
        onNewCode={() => {}}
        onClose={close}
      />,
    );
    expect(mockPresent).toHaveBeenCalledTimes(2);
    expect(screen.getByText("654321")).toBeTruthy();
  });

  test("keeps an expired code hidden during the dismissal animation", async () => {
    const props = {
      serverName: "Media",
      onNewCode: () => {},
      onClose: () => {},
    };
    const view = await render(
      <QuickConnectCodeModal {...props} code='123456' status='expired' />,
    );

    await view.rerender(
      <QuickConnectCodeModal {...props} code={null} status='idle' />,
    );

    expect(screen.queryByText("123456")).toBeNull();
    expect(screen.getByText("pairing.code_expired")).toBeTruthy();
  });
});
