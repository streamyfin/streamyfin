# Exo chrome: a new load rebuilds the player, it never prepares on the old instance

**Date**: 2026-10-30
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/nativeplayer/engine/ExoPlayerEngine.kt`

## Symptom

Skip Credits → next episode swap on the Android TV chrome (ExoPlayer engine,
direct play): the next episode started, played ~2s, then sat loading for a
couple of minutes and came back playing from 0:00. No error surfaced — neither
the JS `onError` listener nor the chrome's error overlay fired.

## Root cause class

`ExoPlayerEngine.load()` used to `setMediaSource(mediaSource, startMs)` +
`prepare()` **on the same ExoPlayer instance that had just played the outgoing
episode to `STATE_ENDED`**. That in-place handover wedged on this box (Amlogic,
256 MB heap): minutes of BUFFERING, then the stream effectively restarting.
The JS-route view (`ExoPlayerView`) never sees this — direct-player remounts
the whole view per episode, so every episode plays on a fresh player.

Fix: `load()` calls `releasePlayer()` before `ensurePlayer()` — every accepted
load (item switch, quality re-negotiation, forced recovery) builds a fresh
ExoPlayer. That also drops state a source-replace silently keeps on one
instance: the previous item's `trackSelectionParameters` overrides and
text-disable, per-item loader/codec state. Cost is one player re-init per swap
(~200 ms) behind a spinner that was already up.

## Deliberate divergence: ExoPlayerView.kt does NOT rebuild per load

The twin keeps one instance across in-mount URL swaps on purpose:

- Episodes get a fresh mount on the JS route anyway (same protection, arrived
  at differently).
- Its `onTracksReady` is once-per-view by contract; the JS subtitle resolver
  matches side-loaded tracks by URL identity on that event. Rebuilding the
  player without changing that contract would strand the resolver.

The note lives in `ExoPlayerView.loadVideo`. Revisit both together if the JS
route ever shows the same stall.

## Diagnostics added (keep them when triaging swaps)

`ExoPlayerEngine` logs one `Log.i` per accepted load (`load: url=… startPosition=…
force=… priorState=…`) and a `Log.w` in `recoverVideoOutput` (the other path
that can restart a stream — resume recovery reloads at `cachedPositionSec`,
which reads as "started over from 0:00" when it fires early). The existing
`Rebuffer:` / `Load error` analytics lines complete the picture:

```
adb logcat -s ExoPlayerEngine ExoPlayerView NativePlayerSession
```

## Follow-up (2026-10-30, same day): the stall's real root cause was network-side

First log capture after the rebuild: after the swap, **every fetch to the
server wedged for ~50s** — the video stream delivered ~3s then went quiet
(`Rebuffer: pos=3s buffered=0.349s`), and the side-loaded SRT timed out six
times (`Load error (retrying) @ …/Subtitles/3/0/Stream.srt:
SocketTimeoutException`) on the user's remote hostname, before a restart at
0:00. So the in-place handover was not the (only) culprit: the post-swap
request pattern — a skip-seek aborting a mid-body download, session stop, new
session, new connections within ~2s — wedges something in the server/proxy
path. The player-side mitigate is a **stall watchdog** in the engine's 1s
progress loop: `STATE_BUFFERING` + playWhenReady + <0.5s buffered for 10s
after media once flowed → reload the same URL at `cachedPositionSec` with
fresh sockets (≤5 per load; the watchdog's own recovery reloads spend the
budget, and only a genuinely new load — `force == false` — earns a fresh
set; a `STATE_READY` does not re-arm it). Turns the
minutes-long spinner + 0:00 restart into a same-position hiccup. If the
watchdog fires on LAN too, the path is not the proxy — dig further; if
remote-only, the server's tunnel/reverse-proxy is where the wedge lives.
