# SwiftUI evicts a ForEach element no tab retains, and tvOS traps rebuilding it

**Date**: 2026-10-20
**Category**: navigation
**Key files**: `patches/react-native-bottom-tabs@1.5.0.patch`, `patches/react-native-bottom-tabs.test.ts`

## Detail

`react-native-bottom-tabs` builds the tab bar as `TabView { ForEach(children) { if !hidden { Tab } } }`,
in 1.4.0 and still in 1.5.0. Without the patch, a hidden tab stays a `ForEach` element that
renders nothing, so no tab retains it.

SwiftUI evicts such elements: with `ForEachEvictionInput.evictByDefault` (true in this app,
it follows the SDK the app is linked against), an element that only the `ForEach` holds and
that goes untouched for 8 eviction passes is erased. On tvOS the passes around the native
player being presented and dismissed do not touch hidden elements, so a few playback sessions
are enough.

When the focus engine later selects a tab to the right of the erased element
(`-[UITabBarButton _sendFocusAction:]`, after a delay), SwiftUI writes the selection binding
through `TagIndexProjection`, which walks the view list outside any view update. Reaching the
erased element, `ForEachState.item(at:offset:)` rebuilds it, and
`AGAttribute.syncMainIfReferences` hits a `brk` because there is no current update group. That
is Sentry REACT-NATIVE-24.

The patch feeds the `ForEach` only the tabs it renders (`renderedChildren`, the rule
`filteredItems` already used), in both tab views (`NewTabView` from iOS and tvOS 18,
`LegacyTabView` below), so every element is retained by its tab and never evicted. A tab
shown again becomes a new element, and SwiftUI builds it inside the update
(`TVTabView.updateUIViewController` counts the list). `patches/react-native-bottom-tabs.test.ts`
fails if a version bump or a regenerated patch drops it.

The tvOS 27 simulator runtime ships SwiftUICore with its symbols, so lldb breakpoints on
`ForEachState.eraseItem`, `ForEachState.evictItems` and `TagIndexProjection.readUntil` show
the whole sequence.

## Symptom pattern

tvOS only: SIGTRAP on the main thread, from `__NSFireDelayedPerform` and
`-[UITabBarButton _sendFocusAction:]` down to `TagIndexProjection.set`, `ForEachState.item` and
`syncMainIfReferences`. It usually comes seconds after native playback ended, with the
watchlists or custom links tab hidden.
