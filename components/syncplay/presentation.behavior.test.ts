import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function evaluate(name: string, imports: Record<string, unknown>) {
  const compiled = ts.transpileModule(
    readFileSync(join(__dirname, `${name}.tsx`), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports: Record<string, (props: unknown) => unknown> = {};
  new Function("require", "exports", compiled)((id: string) => {
    if (!(id in imports)) throw new Error(`Unexpected UI test import: ${id}`);
    return Object.assign({ __esModule: true }, imports[id]);
  }, exports);
  return exports;
}

describe("native group sheet dismissal behavior", () => {
  test("join, create and resume stay pending until the native onDismiss callback", async () => {
    for (const actionIndex of [0, 1, 3]) {
      type ElementProps = {
        onPress?: () => void;
        onClose?: () => Promise<void>;
        onDismiss?: () => void;
      };
      const elements: Array<{ type: unknown; props: ElementProps }> = [];
      const jsx = (type: unknown, props: ElementProps) => {
        const element = { type, props };
        elements.push(element);
        return element;
      };
      const actions = {
        joinGroup: mock(async () => {}),
        createGroup: mock(async () => {}),
        leaveGroup: mock(async () => {}),
        resumeGroupPlayback: mock(async () => {}),
      };
      const sheet = { present: mock(() => {}), dismiss: mock(() => {}) };
      let refIndex = 0;
      const common = {
        "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
        "react-i18next": {
          useTranslation: () => ({ t: (key: string) => key }),
        },
        "react-native": {
          Platform: { OS: "ios", isTV: false },
          View: "View",
          TouchableOpacity: "TouchableOpacity",
          ActivityIndicator: "ActivityIndicator",
        },
        "@expo/vector-icons": { Ionicons: "Ionicons" },
        "sonner-native": { toast: { error: mock(() => {}) } },
      };
      const button = evaluate("SyncPlayButton", {
        ...common,
        react: {
          useRef: (value: unknown) => ({
            current: refIndex++ === 0 ? sheet : value,
          }),
          useCallback: (callback: unknown) => callback,
          useEffect: () => {},
        },
        "@expo/ui/community/bottom-sheet": {
          BottomSheetModal: "Sheet",
          BottomSheetScrollView: "Scroll",
        },
        "react-native-google-cast": { useCastDevice: () => null },
        "@/components/common/HeaderButton": {
          HeaderButton: "Header",
          HEADER_ICON_SIZE: 24,
        },
        "@/providers/NetworkStatusProvider": {
          useNetworkStatus: () => ({ isConnected: true }),
        },
        "@/providers/SyncPlay": {
          useSyncPlay: () => ({
            isEnabled: false,
            canJoinGroups: true,
            registerPlaybackPresentationGuard: () => () => {},
          }),
        },
        "./GroupSelectionMenu": { GroupSelectionMenu: "Menu" },
      });
      button.SyncPlayButton({});
      elements.find((element) => element.type === "Header")!.props.onPress!();
      const onClose = elements.find((element) => element.type === "Menu")!.props
        .onClose;
      const onDismiss = elements.find((element) => element.type === "Sheet")!
        .props.onDismiss;
      const callbacks: Array<(...args: unknown[]) => Promise<void>> = [];
      const menu = evaluate("GroupSelectionMenu", {
        ...common,
        react: {
          useState: (value: unknown) => [value, () => {}],
          useRef: (value: unknown) => ({ current: value }),
          useEffect: () => {},
          useCallback: (callback: (...args: unknown[]) => Promise<void>) => {
            callbacks.push(callback);
            return callback;
          },
        },
        "react-native-safe-area-context": {
          useSafeAreaInsets: () => ({ left: 0, right: 0, bottom: 0 }),
        },
        "@/components/Button": { Button: "Button" },
        "@/components/common/Text": { Text: "Text" },
        "@/providers/SyncPlay": {
          useSyncPlay: () => ({
            ...actions,
            isEnabled: false,
            canCreateGroups: true,
            getGroups: async () => [],
          }),
        },
      });
      menu.GroupSelectionMenu({ onClose });
      const pending = callbacks[actionIndex]("group");
      await Promise.resolve();
      expect(sheet.dismiss).toHaveBeenCalledTimes(1);
      expect(actions.joinGroup).not.toHaveBeenCalled();
      expect(actions.createGroup).not.toHaveBeenCalled();
      expect(actions.resumeGroupPlayback).not.toHaveBeenCalled();
      onDismiss!();
      await pending;
      expect(
        [
          actions.joinGroup,
          actions.createGroup,
          actions.resumeGroupPlayback,
        ].reduce((total, action) => total + action.mock.calls.length, 0),
      ).toBe(1);
    }
  });
});
