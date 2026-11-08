# hasTVPreferredFocus Takes the Focus as the View Mounts

**Date**: 2026-11-08
**Category**: tv
**Key files**: `node_modules/react-native/React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm`

## Detail

On tvOS, `hasTVPreferredFocus` is not a hint the focus engine reads later. When the
prop turns true, `updateProps` calls `requestFocusSelf`. That sets the view as the
`reactPreferredFocusedView` of the `RCTSurfaceHostingProxyRootView`, then calls
`setNeedsFocusUpdate` and `updateFocusIfNeeded` on that root. The root holds the whole
app, the native tab bar included, so the view takes the focus from anything. A view
that is not in a window yet retries from `didMoveToWindow`.

Found on Apple TV: swiping along the tab bar kept the focus on the bar for Home and
Search, but Libraries and Settings pulled it down to their first row. Their first rows
set the prop, and a tab mounts the first time the bar lands on it. Favorites did the
same once the user had a favorite series. Home only escaped because it mounts at launch.

## Symptom pattern

The focus jumps into a screen the moment it mounts, out of the tab bar or another
zone, with no press. The rule it led to is in `docs/conventions/tv.md`.
