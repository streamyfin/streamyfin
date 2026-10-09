# Linking against the iOS 27 SDK reorders the tab bar and demotes the search tab

**Date**: 2026-10-05
**Category**: navigation
**Key files**: `patches/react-native-bottom-tabs@1.4.0.patch`, `app/(auth)/(tabs)/_layout.tsx`

## Detail

Two things change for a SwiftUI `TabView` once the binary is linked against the iOS 27 SDK
(Xcode 27). Both are gated on the SDK the app was built with, not on the OS it runs on, so
the same source gives a correct tab bar from an Xcode 26 build and a broken one from an
Xcode 27 build on the same iOS 27 device.

1. `UITabBar.items` comes back in display order. A tab with the search role is displayed
   last, so it is last in `items` too, while `UITabBarController.tabs` keeps the declaration
   order. `react-native-bottom-tabs` 1.4.0 writes each item's title and icon from
   `filteredItems[indexOfItem]`, which shifts every label after the search tab by one and
   leaves the last item carrying the wrong tab's label. Selection itself is unaffected, so
   the bar looks like "pressing Library opens Search". The patch matches an item to its tab
   by identity (`tabs[i].viewController?.tabBarItem === item`).
2. `TabRole.search` no longer gets the detached trailing button, it sits inline at the end
   of the bar with a label. The detached button is the new `TabRole.prominent` (iOS 27).
   The patch maps the library's `search` role to `.prominent` on iOS 27 when compiled with
   Swift 6.4 or newer, so an Xcode 26 build is untouched.

Upstream `main` (the unreleased 1.5.0) still indexes `tabBar.items` by position, and its
`prominent` role resolves to no role at all on an older compiler. Bumping the dependency
does not replace the patch until both are checked again.

The whole thing reproduces without React Native: a bare SwiftUI `TabView` built with
`swiftc` for the simulator, and the same binary restamped with
`vtool -set-build-version iossim 18.0 26.0` to get the Xcode 26 behaviour back.

## Symptom pattern

Only local Xcode 27 builds: tab labels and icons do not match the screen they open, the
highlighted tab is one to the left of the visible screen, and the detached search button
is gone. The EAS build of the same commit is fine.
