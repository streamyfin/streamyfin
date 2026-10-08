/**
 * The start of an `inputAccessoryViewID` that names no view. Given to an iOS
 * number pad, it keeps away the toolbar react-native-tvos adds above it, a
 * "Default" button that upstream React Native and native apps do not have.
 * Each field adds a suffix of its own from useId: Fabric reuses a text input's
 * native view, and sets the id on it again only when the id changed.
 */
export const NO_KEYBOARD_TOOLBAR = "no-keyboard-toolbar";
