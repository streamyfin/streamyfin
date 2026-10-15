# A Closed TV Modal Route Leaves Android TV With Nothing Focused

**Date**: 2026-10-09
**Category**: tv
**Key files**: `components/library/TVLibraryToolbar.tsx`, `components/library/TVLibrarySheet.tsx`

## Detail

When a navigation based TV modal (`transparentModal` route) is dismissed on
Android TV, the focus does not go back to the button that opened it: nothing
is focused. Select does nothing, and the next Back acts on the page below, so
it leaves the screen. Seen with a real D-pad (`adb shell input keyevent`) on
the library sheets; tvOS was only driven without a remote and is unverified.

The page asks for the focus itself: the sheet's `onClose` sets a focus request
and the toolbar calls `requestTVFocus()` on the opening button after 300 ms.

Two more Android TV traps from the same work:

- `expo-blur`'s `BlurView` does not blur there, it only tints. A panel over
  posters needs a backing colour of its own or the posters show through.
- A screen that returns a loader in place of its whole tree while a list
  reloads remounts its header, and `hasTVPreferredFocus` then pulls the focus
  to the header's first button. Keep the header mounted on TV.

## Symptom pattern

After closing a sheet, no element has the focus ring, and pressing Back once
navigates away from the page.
