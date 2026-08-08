import { useNavigation } from "expo-router";
import { useEffect } from "react";
import { Keyboard } from "react-native";

/**
 * Dismisses the keyboard when the screen is popped off the stack.
 *
 * Without this the keyboard lingers over the previous screen after navigating
 * back from a form (e.g. leaving the Jellyseerr login while typing). Use this
 * on any pushed screen that contains a text input.
 *
 * `beforeRemove` fires for every way out of the screen — the native back
 * button, the iOS swipe-back gesture and Android's hardware back — unlike the
 * custom back button this replaced, which only covered taps.
 */
export function useDismissKeyboardOnLeave() {
  const navigation = useNavigation();

  useEffect(
    () => navigation.addListener("beforeRemove", () => Keyboard.dismiss()),
    [navigation],
  );
}
