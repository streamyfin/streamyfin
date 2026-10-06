# Jellyfin SyncPlay

Group playback over Jellyfin's own SyncPlay: the REST endpoints plus the
`SyncPlayGroupUpdate` and `SyncPlayCommand` websocket messages. No plugin and no extra
server, so a group is shared with Jellyfin Web and any other SyncPlay client. Checked
against the Jellyfin 10.11 server and web sources, and run against 10.11.11.

## Scope

- Online video at normal speed. Downloads, Live TV and music stay out of a group.
- A group's queue is filled from the app's own pages. A group started from a page takes
  what that page shows as its queue (a video, or the episodes of a show) and plays
  nothing yet. In a group, item pages and season rows offer "add to queue", and every
  Play button carries the SyncPlay icon: it starts the video where it sits in the queue,
  or replaces the queue with it, as playing does in Jellyfin. The queue can be reordered
  in the panel and in the player.
- The presented native player only (SwiftUI on iOS and tvOS, Compose on Android and
  Android TV). A group always plays there, whatever the solo player setting says. Where
  that player cannot run (tvOS below 26) `isSyncPlayAvailable()` is false, the provider
  creates no controller and every entry point hides. The JS player does not follow a
  group.

## Who owns what

| Piece | Owns |
| --- | --- |
| Server | Membership, the queue, playback commands and their timing |
| `SyncPlayController` (`controller.ts`) | The protocol state machine. No React, no native code |
| `transport.ts` | The 22 SyncPlay endpoints and TimeSync, through the SDK |
| `SyncPlayProvider` | One controller per signed in api, fed from the websocket |
| `SyncPlayPlaybackBridge` | Presents the native player when the group starts an item |
| `SyncPlayPanel` | Everything outside the player. Not in a group: "New group" and the groups to join. In one: the group, what it plays (`SyncPlayPlayback`), its queue, its modes (`SyncPlayOptions`), stop, switch and leave. The sheet of phones and tablets (`useSyncPlaySheet`) |
| `TVSyncPlaySheet` | The same on TV, as rows of cards in a sheet that is a route (`app/(auth)/tv-syncplay-modal.tsx`), opened by `TVSyncPlayButton` in the action row of an item. No queue: the player has it. Both sheets act through `useSyncPlayPanel` |
| `SyncPlayButton` | The header entry, on Home, item and series pages. It opens the panel, with what the page shows as the queue of a group started there |
| `SyncPlayQueue` | The queue in the panel, on the music player's `DraggableQueueList`: posters, drag to reorder, remove, tap to play |
| `SyncPlayQueueButton` | "Play next" and "add to queue" for what a page shows. Only there in a group |
| Play buttons | In a group they carry the SyncPlay icon and play for everyone, through `usePlayMedia` |
| Queue in the player | Native, fed by `buildNativeSyncPlayState`: `SyncPlayQueueView.swift` (a sheet, iOS), `TVSyncPlayPanel.swift` (a focus panel on its own layer, tvOS), `SyncPlayQueuePhoneSheet.kt` (a sheet laid out as the iOS one, Android) and the dialog of buttons in `SyncPlayQueueSheet.kt` (Android TV) |
| `NativePlayerProvider` | The player adapter: decoder state in, group commands out |
| Swift and Kotlin `SyncPlayCommandScheduler` | Runs a command at its deadline, on the decoder |

Tuning lives in `constants/SyncPlay.ts`, with the reason for each value.

## Rules the controller keeps

**User input is a request, never a local action.** Pause, play, seek, stop, next and
every queue edit go to the server and come back as a command for the whole group. A
command from the server only ever reaches the decoder, so it cannot echo back as a new
request. Queue and mode changes are never applied optimistically.

**Clock.** Each TimeSync sample excludes the server's processing time, and the sample
with the lowest delay wins. Commands run at the server's time translated to this clock.
An Unpause that runs late starts at the position the group has reached by then.

**Readiness.** Ready and Buffering are sent one at a time, in the order they happened,
so a late Buffering response cannot overtake Ready. Ready after a seek waits until the
decoder is actually within tolerance of the target. A member that cannot load, or stays
unready past the timeout, leaves so the others are not held.

**Requests.** User requests are sent one at a time in the order they were made, and each
has a timeout: the SDK client has none, and one request that never settles would hold
everything behind it.

**Stale input.** Only the current group and playlist are obeyed. Commands older than the
join or the current queue, repeated commands, and queue updates older than the one held
are dropped. Work queued for a group that was left is discarded.

**Queue identity.** Select, move and remove use the server's playlist entry ids, which
tell two copies of the same video apart. `clearPlaylist(false)` keeps the playing entry,
`clearPlaylist(true)` removes it too. Appending, reordering and changing modes keep the
decoder and any scheduled command. Replacing or removing the playing entry cancels
pending playback.

**An idle queue.** Items queued while nothing plays leave the group without a current
entry, and the server waits forever on an Unpause for such a group. Play starts it by
selecting the first entry instead.

**End of an item.** With something to play next, repeat included, the client asks for
the next item. At the last item with repeat off it asks the group to stop, because the
server's next is a no-op there. The report carries the playlist entry that ended, and is
ignored unless that entry is still current and was ready.

**Leaving.** A leave stays owed until the server has confirmed it, and is repeated when
the socket returns or the group list is refreshed. A join the server completed after the
client gave up on it is left again. Otherwise the server keeps counting a member that
never reports Ready, and the group waits on it at every seek.

**Losing the socket.** A member pauses, drops its scheduled work and leaves. Outside a
group a socket drop touches nothing: the adapter is registered for solo playback too, and
the socket closes on every backgrounding.

**Going away and coming back.** Only the user's own Leave is final. An app in the
background is suspended as soon as it stops playing, and could not answer the group's
next seek, so it leaves when it is backgrounded without Picture in Picture, when the PiP
window is closed, and when the socket is lost. The native players report the first two
as `suspend`, not `leave`. The group is remembered and joined again once the app is in
front and connected, landing wherever the group is by then. One attempt per return, and
not after `SYNCPLAY_RESUME_WINDOW_MS`. A failure to play is never walked back into.

**Closing the player** is not leaving either. The member stays, the server is told not to
wait for it, and the group's playback no longer loads anything here: `watching` is false
in the snapshot. Watching again sends a join for the group the client is already in,
which makes the server send the whole state once more, and it loads like any late join.
Playing something for the group is also a way back. A choice of ignore wait made while
away is kept for the return, since the server's own flag is busy meaning "not watching".

**Drift.** While playing, a position more than the threshold from the group's timeline
is corrected with a local seek, never a group seek. Not after this client buffered:
the server re-times the group around a stalled member and sends the new Unpause to
everyone else, so this client's command describes a timeline the group has left.

**Ignore wait** belongs to this session, is acknowledged over HTTP only, and resets with
membership. It takes the session out of the readiness barrier, but the server still
pauses the group when an ignored member reports Buffering.

## Using it from a player

`registerLauncher` opens the group's item paused. After any asynchronous preparation,
check the request's `isCurrent()` before presenting: the user may have left or the queue
moved on. `registerPlayer` supplies the local decoder operations and synchronous state
getters. Update that state before calling `notifyReady`, `notifyBuffering` or
`notifyProgress`.

## Tests

- `utils/syncplay/controller.test.ts`: the state machine against a fake transport and
  decoder, on fake timers.
- `modules/mpv-player/tests/native-syncplay-scheduler.swift`: the Swift scheduler,
  compiled together with `SyncPlayCommandScheduler.swift` and run as a plain executable.
- `modules/mpv-player/android/src/test`: the Kotlin scheduler and its policies.
- `e2e/syncplay/`: the controller against a real server in Docker, and the fixture for
  testing the native players by hand. Not run in CI.

## Known gaps

- A group whose clock has run past the end of its item (every real member gone, a
  crashed client still counted) tells the next client to join to seek past the end. That
  client can never report Ready and leaves at the readiness timeout. Reaching the end
  during such a seek should count as the item ending.
- Repeat one: every member reports the end, and each report restarts the item.
- TV: nothing has been tried with a remote yet. That covers the sheet (focus moving to
  the first card when its rows change, the delay before the player opens) and the
  player's controls keeping focus when they become unavailable. Removing the focused
  queue row in the player still drops focus.
- Android TV still shows the queue as a dialog of buttons. It has not been run, and it
  is the one queue that was not redesigned.
- Android rejoining after a lock or a closed picture in picture window makes the group
  wait twice within two seconds: the player reports buffering again while it rebuilds
  its video output.
- TV has no way to add to a group's queue, and its sheet does not show the queue. Play
  on an item replaces what the group plays.
- Seek latency is not compensated. A decoder whose seeks take longer than the drift
  threshold can keep correcting.
- Swift still decides that a seek landed by proximity to the target. Android uses the
  decoder's completion event.
