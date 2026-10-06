# Jellyfin SyncPlay

`SyncPlayController` uses Jellyfin's existing SyncPlay HTTP endpoints and
`SyncPlayGroupUpdate` / `SyncPlayCommand` websocket messages. It shares groups
with Jellyfin Web; no plugin or additional server is required. The protocol was
checked against official Jellyfin server/web source and tested with Jellyfin
10.11.11 in the local Docker fixture.

The server owns group membership, playlist positions and playback commands.
User controls send pause, unpause, seek, stop or playlist requests. Decoder
callbacks report Ready/Buffering and correct local drift; they never echo a
server command as another user request. Ready/Buffering HTTP requests run in
transition order so a late Buffering response cannot overtake Ready. Pausing
avoids redundant seeks within 100 ms to prevent decoder buffering loops.
UTC clock samples exclude server processing time and select the lowest-delay
measurement. Commands execute at
the server's scheduled time; late unpause commands include elapsed playback.

The transport covers all 22 Jellyfin SyncPlay API endpoints: group list/detail,
create/join/leave; play a new queue, append or queue next, select/remove/move
playlist entries, clear the queue; pause/unpause/seek/stop/next/previous;
repeat/shuffle; session ignore-wait; Ready/Buffering/Ping. UTC sampling uses the
separate Jellyfin TimeSync API. Requests use HTTP; authoritative playback,
membership, queue and mode changes arrive through Jellyfin's existing
websocket messages. No custom server or protocol is involved.

`queueItems` accepts media IDs and `Queue`/`QueueNext`. Selection, movement and
removal use the server's **playlist entry IDs**, which distinguish repeated
copies of the same media. `clearPlaylist(false)` preserves the playing entry;
`clearPlaylist(true)` also removes it. Queue snapshots publish entries, playing
index/current entry, repeat and shuffle modes. Queue edits never optimistically
change these values. Appending, reordering and changing modes preserve the
current decoder and scheduled command; replacing/removing the playing entry
invalidates pending playback. An empty active queue closes the decoder and
retains membership even before a following Stop arrives.

Repeat modes follow Jellyfin's queue manager: `RepeatNone` has queue boundaries,
`RepeatAll` wraps both directions, and `RepeatOne` restarts the same entry for
both EOF and explicit next/previous. Shuffle order comes from the server;
restoring `Sorted` also follows its authoritative order. Explicit actions run
in request order, with stale queued actions discarded on leaving. Ignore-wait
is a setting for this session, acknowledged by HTTP (no websocket setting
event), and resets with membership. It excludes this session from the group's
readiness barrier; decoder readiness still reports normally. Jellyfin can
still pause on a Buffering report from an ignored member. Setting ignore-wait
while Waiting releases ready peers without requiring that member's Ready.

At final EOF with repeat disabled the client requests group Stop. Jellyfin's
explicit NextItem endpoint is a no-op at that boundary, so it cannot finish the
group on its own. Intermediate/repeating EOF requests NextItem. End reports
are deduplicated per entry and cannot advance a new movie if queued behind an
older pending action.
Native EOF carries the loaded playlist entry identity. Outgoing or unready
decoders cannot advance a newly selected entry, including duplicate movie IDs.

`getGroup` refreshes matching current group information without joining it.
Its response cannot overwrite membership or state updated by a newer websocket
event during the request.

`registerLauncher` opens the group item paused. Check a launch request's
`isCurrent()` after asynchronous preparation so leaving or a newer playlist
cannot present an obsolete item. `registerPlayer` supplies local decoder
operations and synchronous state getters. Publish updated state before calling
`notifyReady`, `notifyBuffering` or `notifyProgress`.

Only the current group and playlist receive playback commands. Older commands,
older queue updates and duplicate scheduled commands are ignored. Seek
readiness waits until the decoder reaches its requested position. Decoder
replacement reports buffering/readiness again. Loading failure or a readiness
timeout withdraws the member so others can continue.

Scope: online video at normal playback speed, using the presented native
SwiftUI/Compose players and Jellyfin Web. Downloads, Live TV and music playback
are outside this integration. Jellyfin HTTP/websocket networking stays in the
app coordinator; native controls emit group requests without optimistic local
playback. Swift/Kotlin own the corrected client deadline and local decoder
operations through the adapter's optional `scheduleCommand`. Native queue
controls expose shared queue edits, repeat/shuffle and this session's ignore-wait.
Leaving
allows solo continuation; websocket disconnect or account change cancels
scheduled work, pauses locally and attempts to leave. Reconnection stays solo
until the user joins again. This includes native background transitions that
close the existing websocket.

Tests:

- `bun run test:unit --runInBand --watchman=false utils/syncplay/controller.test.ts`
  checks scheduling, readiness, stale events, no echo loops and cleanup with
  deterministic decoder states.
- `swiftc -module-cache-path /tmp/streamyfin-syncplay-swiftcache
  modules/mpv-player/ios/NativePlayer/SyncPlayCommandScheduler.swift
  modules/mpv-player/tests/native-syncplay-scheduler.swift
  -o /tmp/streamyfin-native-syncplay-scheduler-test` followed by the executable
  checks the production Swift deadline executor, exact fractional positions,
  late Unpause catch-up and cancellation on replacement/queue change/leave.
- `bun e2e/syncplay/controller-integration.ts` uses production controller/SDK
  requests and real Docker-server websocket events with isolated test sessions.
  It checks both directions of pause/seek, playlist navigation, late join,
  buffering, stopping, missing groups, denied access and disconnect/reconnect,
  plus all queue edits, repeat/shuffle and session ignore-wait behavior.
  JSON results and websocket events are saved under ignored
  `e2e/syncplay/artifacts/controller-integration.json`.

The controller harness simulates decoder timing. Actual browser/native decoder
and interface verification is a separate requirement; see the local testing
instructions in `e2e/syncplay/README.md`.

Browser/Jellyfin Web queue-switch testing exposed two related races: seeking
an already-paused video to its current position triggered repeated buffering
events, and concurrent HTTP requests let Ready reach Jellyfin before its
preceding Buffering. The group could remain Waiting while one client resumed.
Pause now avoids seeks within 100 ms; readiness reports wait for each preceding
HTTP response. Group reset starts a fresh report queue, and queued reports from
an old group or playlist are discarded.

Regressions cover no-op Pause, both HTTP ordering directions, stale queued
reports, readiness timeout behind a hung request, and successful rejoin while
the old request remains pending. Queue regressions cover entry IDs for duplicate
media, server-confirmed modes, repeat boundaries, clearing/removing playback,
preserving scheduled Unpause across all six metadata edits, and stale explicit
actions after rejoining. Browser traces and server logs confirmed the request
race before the fix.

Native scheduled commands bypass user-intent interception. A superseded native
promise cannot leave the active group; decoder removal during Stop cannot leave
a readiness timer behind. Metadata-only queue updates preserve native deadlines.
Seek readiness waits for native dispatch completion and actual progress within
500 ms of its target, never a synthetic requested position.
