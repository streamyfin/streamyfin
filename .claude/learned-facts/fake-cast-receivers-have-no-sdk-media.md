# The fake Cast receivers have a fake TV, but no media for the Cast SDK

**Date**: 2026-11-19
**Category**: testing
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/nativeplayer/remote/FakeRemoteEngine.kt`, `modules/mpv-player/ios/NativePlayer/Remote/FakeRemoteEngine.swift`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/CastModule.kt`, `components/PlayButton.tsx`, `e2e/suites/cast/flows/remote-player-fake-receiver.yml`

## Detail

In a tier 1 build (`e2e/README.md`, "Fake Cast receivers") a connected fake receiver drives a
`FakeRemoteEngine` in place of the Cast engine. Play opens the remote player on it and the fake TV
plays, pauses and seeks, but only the `RemotePlayback` holder hears it: the Cast SDK has no session
media, so its media status stays empty. Everything that reads that status is missing on the fake
receivers:

- the output sheet's Remote row and its Stop playback (`receiverPlaying`, `CastModule.kt`): the sheet
  offers Disconnect only, even while the fake TV plays;
- Play on the item the TV plays (`receiverPlaysItem`, `PlayButton.tsx`), which opens the remote player
  on it like Remote: on a fake it loads the item again, from the position the server saved;
- the SDK's media notification, which asks for the remote player through `RemotePlayerRequests`.

So no gesture opens the remote player again on a fake TV once it is closed: that path is proven on a
real receiver. `openRemotePlayer` itself reads the holder and works on the fake TV.

The fake TV also has its own clock: each item lasts `FAKE_REMOTE_ITEM_SEC` (120 s) and starts at the
position the load asks for, which is the position the server saved. An item the account resumes past
2 minutes is past its end at the first tick: the list ends, the screen closes as at the end of
playback, a second after it opened. A tier 1 flow plays an item its account has never started.

The load fails only for an item whose id is exactly `fake-fail` (`FAKE_REMOTE_FAIL_ID`), which no
server item has: the failure and Play here are proven by the native tests, not by a flow.

## Symptom pattern

On a tier 1 build, Play shows the remote player for a second and the item page comes back, with no
error in the logs (an item resumed past 2 minutes). Or a flow waits for "Remote" in the output sheet
while the fake TV plays, and the sheet shows only Disconnect.
