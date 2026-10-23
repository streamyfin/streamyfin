# Sheets Draw Under the Android Navigation Bar

**Date**: 2026-10-23
**Category**: ui
**Key files**: `hooks/useActionSheet.ts`, `components/common/SheetContent.tsx`, `components/GlobalModal.tsx`

## Detail

The app draws edge to edge, so on Android the navigation bar sits over the
bottom of the window, and nothing at the bottom of a sheet avoids it for you:

- `@expo/react-native-action-sheet` draws its own sheet on Android and ignores
  the safe area. Import `useActionSheet` from `@/hooks/useActionSheet`, which
  pads the sheet's container by the bottom inset. iOS shows the system sheet,
  which ignores `containerStyle` and is already placed correctly.
- A gorhom bottom sheet lays its content out down to the bottom of the screen.
  For `showModal` content, use `SheetView` or `SheetScrollView` from
  `@/components/common/SheetContent`; a list or a sheet that adds to the
  padding (the keyboard, for one) reads `useSheetContentPadding()`.

## Symptom pattern

The last row of a sheet (Cancel, the last option of a long dropdown) sits under
the navigation bar on a phone with three-button navigation, and looks fine
with gesture navigation, where the bar is thin.
