# dismiss() on a Sheet That Is Not Up Kills It

**Date**: 2026-10-05
**Category**: ui
**Key files**: `hooks/useSheetOpenState.ts`, `components/music/TrackOptionsSheet.tsx`, `components/PINEntryModal.tsx`

## Detail

`BottomSheetModal.dismiss()` in `@gorhom/bottom-sheet` 5.2.14 does not check
that the modal is on screen. Called in the initial state, it sets the modal's
status to "dismissing" and asks the sheet to close; there is no sheet, so the
close never finishes and the status never leaves "dismissing". From then on
`present()` mounts the modal but `handlePortalRender` skips rendering it while
it is "dismissing". Nothing shows and nothing is logged.

Two ways to get there with the usual `open` prop effect
(`open ? present() : dismiss()`):

- the sheet mounts closed, so the effect dismisses it before it was ever shown;
- the user swipes the sheet away, the library unmounts it, and the effect
  dismisses it again once `open` follows.

A component that returns `null` until it has an item to show has no ref on
mount, which hides the first case and leaves the second.

Use `useSheetOpenState(ref, open)` and pass what it returns to `onDismiss`. It
only dismisses a sheet it presented and that has not reported a dismissal yet.

## Symptom pattern

A button that should open a sheet does nothing, either from the start or after
the sheet was swiped down once. No error, no warning. A second `dismiss()`
resets the modal, so the sheet can appear to work on every other attempt.
