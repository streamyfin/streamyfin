# A Short TV Grid Loses Left and Right Presses to the Tab Bar

**Date**: 2026-11-11
**Category**: tv
**Key files**: `app/(auth)/(tabs)/(libraries)/[libraryId].tsx`, `components/tv/TVNavBar.tsx`

## Detail

On the Android TV library page, a library whose posters fill a single short
row (Clips, three posters) lost the focus on a right press from its last card:
it went to the tab bar's Settings tab. Measured on the Android TV emulator
(API 36). A library of two rows (7 + 2 posters) behaved the same with and
without the fix: the end of the full first row already held, and the edges of
the short centred second row move to the nearest card of the first row.

Mechanism (`FocusFinder` in the Android sources picks the target):

- `TVNavBar` centres its tabs in a horizontal ScrollView, and each tab is a
  separate focusable. From a card at the end of a row narrower than the tab
  row, the outermost tab on that side passes `FocusFinder.isCandidate` for
  that direction; with no card there, it wins however far above it sits.
- The library toolbar is not the culprit. A `TVFocusGuideView` that does not
  hold the focus exposes only itself to the search (`ReactViewGroup.kt`), one
  rectangle as wide as the content, and `isCandidate` rejects a rectangle
  wider than the card on both sides for left and right alike.

**Fix**: `trapFocusLeft trapFocusRight` on the grid's guide. A trapped
direction routes the search through the guide's own descendants, so the
press stays inside the grid; up and down stay free for the toolbar and the
tab bar. On a short last row the press still moves to a card of the row
above, inside the grid.

**tvOS**: the trap lives in `shouldUpdateFocusInContext:` of
`React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm` and keys
on the focus heading, so a programmatic `requestTVFocus` (no heading) is not
blocked. Not verified on an Apple TV.

**Boundary condition**: a horizontal trap blocks every horizontal exit from
the grid. It is safe here because nothing focusable sits beside it (the
AlphabetRail is mobile only). Other centred TV grids under the same tab bar
(watchlists, studios, Seerr pages) have no trap and were not measured.
