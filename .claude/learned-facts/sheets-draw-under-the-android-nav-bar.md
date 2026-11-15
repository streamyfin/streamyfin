# Sheets Draw Under the Android Navigation Bar

**Date**: 2026-10-23
**Category**: ui
**Key files**: `hooks/useActionSheet.ts`, `components/common/SheetContent.tsx`, `utils/sideInsetPadding.ts`

## Detail

The app draws edge to edge, so a sheet reaches under the Android navigation
bar unless its content is padded by the insets: below the sheet, and on a side
when three-button navigation puts the bar there in landscape.

- Use `useActionSheet` from `@/hooks/useActionSheet`, not the library's. It pads
  with the insets `ActionSheetInsets` keeps, rendered once in `app/_layout.tsx`
  and read when the sheet opens, so the posters that call the hook do not
  render again whenever the insets change.
- Put `showModal` content in `SheetView` or `SheetScrollView`. A virtualized
  list, a `BottomSheetFlatList`, takes `useSheetContentPadding()` as its
  `contentContainerStyle` instead: inside `SheetScrollView` it would nest
  VirtualizedLists and lose its virtualization.
- Side padding goes through `sideInsetPadding`. React Native swaps left and
  right styles in a right-to-left layout while the insets stay physical, so it
  swaps them back.
