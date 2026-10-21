# Linking against the iOS 27 SDK reorders the tab bar and demotes the search tab

**Date**: 2026-10-05
**Category**: navigation
**Key files**: `app/(auth)/(tabs)/_layout.tsx` (the patch this fact described is gone since 1.5.0)

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
   the bar looks like "pressing Library opens Search". Fixed upstream in 1.5.0
   (callstack/react-native-bottom-tabs#602), which matches an item to its tab by identity
   (`tabs[i].viewController?.tabBarItem === item`).
2. `TabRole.search` no longer gets the detached trailing button, it sits inline at the end
   of the bar with a label. The detached button is the new `TabRole.prominent` (iOS 27).
   1.5.0 exposes `role: "prominent"`, but resolves it to no role at all when built with
   Xcode 26 or run below iOS 27, and keeps `search` as `.search`. The app keeps
   `role: "search"`: Xcode 26 builds (CI and EAS) still get the detached search button, and an
   Xcode 27 build gets iOS 27's inline search tab with its label. Asking for `prominent` instead
   would drop the search role from every Xcode 26 build.

Until 1.5.0 the app carried a patch for both points, mapping `search` to `.prominent` on an
Xcode 27 build to keep the detached button there.

The whole thing reproduces without React Native: a bare SwiftUI `TabView` built with
`swiftc` for the simulator, and the same binary restamped with
`vtool -set-build-version iossim 18.0 26.0` to get the Xcode 26 behaviour back.

## Symptom pattern

Only Xcode 27 builds. On react-native-bottom-tabs 1.4.x, tab labels and icons do not match
the screen they open and the highlighted tab is one to the left of the visible screen. From
1.5.0 on, the only difference left is the search tab sitting inline with a label instead of
the detached button, which is iOS 27's own layout for `TabRole.search`.
