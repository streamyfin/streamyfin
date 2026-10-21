# Linking against the iOS 27 SDK reorders the tab bar and demotes the search tab

**Date**: 2026-10-05
**Category**: navigation
**Key files**: `patches/react-native-bottom-tabs@1.5.0.patch`, `patches/react-native-bottom-tabs.test.ts`, `app/(auth)/(tabs)/_layout.tsx`

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
   (`tabs[i].viewController?.tabBarItem === item`), as our 1.4.0 patch did.
2. `TabRole.search` no longer gets the detached trailing button, it sits inline at the end
   of the bar with a label. The detached button is the new `TabRole.prominent` (iOS 27).
   1.5.0 keeps `search` as `.search`, and its own `role: "prominent"` resolves to no role at
   all when built with Xcode 26 or run below iOS 27, so asking for it from JS would take the
   search role away from every Xcode 26 build. The app keeps `role: "search"` and our patch
   maps it to `.prominent` on iOS 27 when compiled with Swift 6.4 or newer (Xcode 27), so an
   Xcode 26 build, iOS 26 and below, and tvOS keep `.search`.
   `patches/react-native-bottom-tabs.test.ts` fails if a version bump or a regenerated patch
   drops the mapping.

The whole thing reproduces without React Native: a bare SwiftUI `TabView` built with
`swiftc` for the simulator, and the same binary restamped with
`vtool -set-build-version iossim 18.0 26.0` to get the Xcode 26 behaviour back.

## Symptom pattern

Only Xcode 27 builds. On react-native-bottom-tabs 1.4.x without the patch, tab labels and
icons do not match the screen they open and the highlighted tab is one to the left of the
visible screen. Without the role mapping, the search tab sits inline at the end of the bar
with a label instead of the detached button.
