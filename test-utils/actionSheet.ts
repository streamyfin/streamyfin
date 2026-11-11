/**
 * `@expo/react-native-action-sheet` for every unit spec, wired in
 * `unitSetup.ts`. The real sheet is drawn natively. `showActionSheetWithOptions`
 * records each sheet, and `chooseAction(index)` answers the latest one as if
 * the user tapped that option.
 */
export const showActionSheetWithOptions = jest.fn();

export const actionSheetModule = {
  useActionSheet: () => ({ showActionSheetWithOptions }),
  ActionSheetProvider: ({ children }: { children: unknown }) => children,
  connectActionSheet: <T>(component: T) => component,
};

/** Tap option `index` of the latest sheet, or dismiss it with `undefined`. */
export const chooseAction = (index?: number) => {
  const onSelect = showActionSheetWithOptions.mock.calls.at(-1)?.[1] as
    | ((index?: number) => unknown)
    | undefined;
  return onSelect?.(index);
};
