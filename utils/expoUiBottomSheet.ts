import { Platform } from "react-native";

/**
 * TV-safe re-exports of `@expo/ui/community/bottom-sheet`.
 *
 * `@expo/ui` resolves its native bridge at module load via
 * `requireNativeModule('ExpoUI')`, which does not exist on tvOS — a static
 * top-level import would crash the whole expo-router route tree. We `require()`
 * it lazily and only off-TV; on TV the exports are undefined, which is fine
 * because every call site early-returns on `Platform.isTV`.
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
