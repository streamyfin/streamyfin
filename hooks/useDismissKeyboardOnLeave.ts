import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Keyboard } from "react-native";

/**
 * Dismisses the keyboard when the screen loses focus.
 *
 * Without this the keyboard lingers over the previous screen after navigating
 * back from a form (e.g. leaving the Seerr login while typing). Use this
 * on any pushed screen that contains a text input.
 *
 * Losing focus covers every way out of the screen: the native back button,
 * the iOS swipe-back gesture, Android's hardware back, and a screen pushed on
 * top. Expo Router 58 removed `beforeRemove`, which this listened to before.
 */
export function useDismissKeyboardOnLeave() {
  useFocusEffect(useCallback(() => () => Keyboard.dismiss(), []));
}
