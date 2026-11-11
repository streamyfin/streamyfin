# hasTVPreferredFocus Takes the Focus as the View Mounts

**Date**: 2026-11-08
**Category**: tv
**Key files**: `node_modules/react-native/React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm`,
`node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/views/view/ReactViewManager.kt`,
`components/home/useHomeInitialFocus.ts`

## Detail

On tvOS, `hasTVPreferredFocus` is not a hint the focus engine reads later. When the
prop turns true, `updateProps` calls `requestFocusSelf`. That sets the view as the
`reactPreferredFocusedView` of the `RCTSurfaceHostingProxyRootView`, then calls
`setNeedsFocusUpdate` and `updateFocusIfNeeded` on that root. The root holds the whole
app, the native tab bar included, so the view takes the focus from anything. A view
that is not in a window yet retries from `didMoveToWindow`.

It asks a second way too: `updateLayoutMetrics` asks again when a view that still holds
the prop is laid out while the root's preferred view is another one or gone (the root
keeps it weakly). A view that keeps the prop, like Home's first card, can so take the
focus back long after its mount (read in the code, not seen on a device yet).

Found on Apple TV: swiping along the tab bar kept the focus on the bar for Home and
Search, but Libraries and Settings pulled it down to their first row. Their first rows
set the prop, and a tab's page enters the window the first time the bar lands on the
tab, which is when the view asks. Favorites did the same once the user had a favorite
series. Home only escaped because it is on screen at launch.

Android TV does the same through `ReactViewManager.setTVPreferredFocus`, which calls
`requestFocus()` when the prop turns true. Its tab bar replaces the route on a press, so
a page mounts again on every press that opens its tab: pressing Library put the focus on
the first library row each time, Settings on its first enabled row, Favorites on the
first favorite series, and Home on its first card. That last one is why Home takes the
initial focus once per session (`useHomeInitialFocus`), not on every mount.

## Symptom pattern

The focus jumps into a screen the moment it mounts, out of the tab bar or another
zone, without the user moving into it. The rule it led to is in
`docs/conventions/tv.md`.
