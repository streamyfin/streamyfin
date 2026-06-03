import { Platform } from "react-native";

/**
 * TV-safe re-exports of `@expo/ui/community/bottom-sheet`.
 *
 * `@expo/ui` resolves its SwiftUI bridge at module load via
 * `requireNativeModule('ExpoUI')`. That native module does not exist on tvOS,
 * so a static top-level import from any route file crashes the whole route
 * tree (expo-router eagerly loads every route). We `require()` it lazily and
 * only when not on tvOS; on TV the exports are undefined, which is fine because
 * every call site early-returns (`if (Platform.isTV) return null;`).
 */
type BottomSheetMod = typeof import("@expo/ui/community/bottom-sheet");

const mod: BottomSheetMod = Platform.isTV
  ? ({} as BottomSheetMod)
  : (require("@expo/ui/community/bottom-sheet") as BottomSheetMod);

export const BottomSheetModal = mod.BottomSheetModal;
export const BottomSheetView = mod.BottomSheetView;
export const BottomSheetScrollView = mod.BottomSheetScrollView;
export const BottomSheetTextInput = mod.BottomSheetTextInput;

export type { BottomSheetMethods } from "@expo/ui/community/bottom-sheet";
