import type { ViewInstance } from "react-native";

// react-native-tvos attaches requestTVFocus() to every View host instance at
// runtime (Libraries/Components/View/View.js), but its ViewInstance type does
// not declare it.
type TVFocusableInstance = ViewInstance & { requestTVFocus?: () => void };

/**
 * Moves the TV focus engine onto `view`. Use it rather than `focus()`, which
 * react-native-tvos only dispatches for text inputs. A no-op when the view is
 * not mounted, or off TV where the method does not exist.
 */
export const requestTVFocus = (view: ViewInstance | null | undefined) => {
  (view as TVFocusableInstance | null | undefined)?.requestTVFocus?.();
};
