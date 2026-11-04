# Android focus-guide row steals horizontal edge presses from a centered grid

**Date**: 2026-10-11
**Category**: tv-platform
**Key files**: `app/(auth)/(tabs)/(libraries)/[libraryId].tsx`, `components/library/TVLibraryToolbar.tsx`

## Detail

On the TV library page, a D-pad LEFT or RIGHT press from the poster rows that
share the screen with the toolbar (first/second row, or any row while the
toolbar is still on screen) put the focus back on the toolbar instead of the
cards. Both directions; in-row presses were fine.

Mechanism (read from `ReactViewGroup.kt` in react-native):

- A `TVFocusGuideView` with `autoFocus` (no `destinations`) is a focus guide.
  On Android, when a guide does **not** hold the focus, `addFocusables`
  exposes **only the guide itself** to the focus finder — as one candidate
  spanning its whole row. Its buttons are invisible to the search; the row's
  full-width rect is what competes.
- The grid rows are centred (`justifyContent: "center"`), so every row — even
  a full one — ends short of the toolbar on both sides.
- For a horizontal press with no card in the beam (a row edge), Android's
  fallback weighs horizontal direction above vertical distance. The toolbar
  extends further left/right of centre than any card, so it qualifies as
  "in direction" with major-axis distance 0 and wins, however far it sits
  above. Landing on the guide, its `requestFocus` redirect (`autoFocus` →
  last-focused element) drops focus on the last tab/button it held.

**Fix**: `trapFocusLeft trapFocusRight` on the grid's guide. A trapped
direction routes `focusSearch` through `FocusFinder` scoped to the guide's own
descendants, so an edge press finds nothing and focus stays on the card.
Up/down stay untrapped. The same partial-trap pattern already existed on the
player control bar (`Controls.tv.tsx`). tvOS implements trapFocus too
(`RCTTVView.m`), with the same hold-at-edge outcome, and programmatic
`requestTVFocus` arrives with no heading, so the sheet-close focus restore is
not blocked by the trap.

**Boundary condition**: a horizontal trap blocks *every* horizontal exit from
the grid. Only safe because nothing focusable sits beside this grid (the
AlphabetRail is mobile-only). Screens with a horizontally adjacent zone must
not copy it blindly.
