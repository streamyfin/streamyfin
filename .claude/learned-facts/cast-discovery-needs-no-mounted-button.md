# Cast Discovery Needs No Mounted Button

**Date**: 2026-10-28
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/target/GoogleCastTargetPort.kt`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/target/RemoteTargetHub.kt`, `components/cast/OutputButton.tsx`

## Detail

With react-native-google-cast, Android only discovered receivers while a `MediaRouteButton`
was mounted: the library started discovery through the button, so the header kept an
invisible `CastButton` just for that. The Android port (`GoogleCastTargetPort.watchRoutes`)
registers a `MediaRouter.Callback` on the Cast context's merged selector with
`CALLBACK_FLAG_REQUEST_DISCOVERY` and `CALLBACK_FLAG_PERFORM_ACTIVE_SCAN`, and keeps the
device list current from the callback. No view is needed, and the header button is a plain
`HeaderButton` again.

The hub runs that callback while any owner still asks for discovery, and each owner releases
only its own request: `app` for JS's `startCastDiscovery()` (`AppDiscovery`, held back in the
background), `sheet` while the output sheet is open (paused in the background too), and
`probe` for the debug probe, which never pauses. Since B2 the button starts no discovery on
mount: the sheet asks for it.
