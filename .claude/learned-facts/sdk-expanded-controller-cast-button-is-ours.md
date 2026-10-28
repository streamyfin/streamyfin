# The SDK Expanded Controller Has No Cast Button Of Its Own

**Date**: 2026-10-28
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/CastExpandedControllerActivity.kt`, `modules/mpv-player/android/src/main/res/menu/cast_expanded_controller.xml`

## Detail

`ExpandedControllerActivity` draws the artwork, the seek bar and the transport buttons,
but its toolbar is empty: the Cast button, whose dialog is the only "Stop casting" on
that screen, comes from a menu the host app inflates in `onCreateOptionsMenu` and wires
with `CastButtonFactory.setUpMediaRouteButton(context, menu, R.id.media_route_menu_item)`.
react-native-google-cast did that in its own subclass, so a bare subclass of the SDK
activity looks complete on a quick launch and only shows the gap when someone tries to
stop casting from it: the notification's "Disconnect" was the one way left. The
`uiautomator dump` of the open controller is the check: a toolbar with "Navigate up" and
two titles and nothing else means the menu is missing.
