# Showing a hidden tab on the tvOS tab bar crashes the app

**Date**: 2026-10-21
**Category**: navigation
**Key files**: `utils/nativeTabsKey.ts`, `app/(auth)/(tabs)/_layout.tsx`, `node_modules/react-native-bottom-tabs/ios/TabView/NewTabView.swift`

## Detail

`react-native-bottom-tabs` builds the tab bar as
`TabView { ForEach(children) { if !hidden || isFocused { Tab } } }` (`NewTabView`, iOS and
tvOS 18 and later; `LegacyTabView` applies the same rule below 18). A screen hidden with
`tabBarItemHidden` stays a `ForEach` element that renders nothing, so showing it again
inserts a `Tab` into a `TabView` that is already on screen. On tvOS that throws
`UIViewControllerHierarchyInconsistency` and the app crashes.

Found when turning on the watchlist integration from the Apple TV settings, which shows the
Watchlists tab: the app crashed every time on the tvOS simulator, and no longer did once the
tab bar was keyed (6d0da40b). Only tvOS was seen to crash. Android TV draws its own tab bar
(`TVTabLayout`), and on phones the key stays undefined and the tabs change in place.

The app does not insert tabs on tvOS. `<NativeTabs key={nativeTabsKey(settings, Platform.isTV)}>`
mounts the tab bar again for each set of optional tabs, so a tab that appears comes with a
new tab bar. Each part of the key is the rule its tab is shown by, the same function the
tab bar reads (`isWatchlistsTabVisible`, `isCustomLinksTabVisible`). Any new tab whose
`tabBarItemHidden` can change while the app runs must add its rule to `nativeTabsKey`, or
showing it brings the crash back. A remount drops every tab's navigation stack, so a
setting that leaves the same tabs on screen keeps the key. For the same reason the tvOS
layout renders nothing until the stored settings are read: keyed on the defaults first, the
tab bar would be mounted again at every launch (`utils/tabLayout.test.tsx`).

PR #2310, open when this was written, changes the bottom-tabs patch so the `ForEach` only
gets the tabs it renders: a tab shown again becomes a new element rather than one that
starts rendering. That may remove the need for the key once merged, but it has not been
verified. Before dropping the key, turn the watchlist integration on from the Apple TV
settings with the key removed and check that the app survives.

## Symptom pattern

tvOS only: the app crashes the moment a setting shows a tab that was hidden, with an
uncaught `UIViewControllerHierarchyInconsistency` exception. Seen with the watchlist
integration; a Streamystats server or the custom links tab show a tab the same way. Jest
cannot show it, the SwiftUI views are mocked there.
