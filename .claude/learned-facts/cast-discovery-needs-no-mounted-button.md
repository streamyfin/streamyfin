# Cast Discovery Needs No Mounted Button

**Date**: 2026-10-28
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/CastModule.kt`, `components/Chromecast.tsx`

## Detail

With react-native-google-cast, Android only discovered receivers while a `MediaRouteButton`
was mounted: the library started discovery through the button, so the header kept an
invisible `CastButton` just for that. The module registers a `MediaRouter.Callback` on the
Cast context's merged selector with `CALLBACK_FLAG_REQUEST_DISCOVERY` and
`CALLBACK_FLAG_PERFORM_ACTIVE_SCAN` when `startCastDiscovery()` is called, and keeps the
device list current from the callback. No view is needed, and the header button is a plain
`HeaderButton` again.
