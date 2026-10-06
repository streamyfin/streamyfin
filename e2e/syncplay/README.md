# Local SyncPlay testing

A disposable Jellyfin server for exercising SyncPlay against the real protocol. Nothing
here runs in CI: it needs Docker, and the UI rounds need a second client in the group.

Prerequisites: Docker Desktop, Python 3, FFmpeg with H.264 and AAC encoders, Bun.

```sh
python3 e2e/syncplay/setup.py
```

The script starts the official `jellyfin/jellyfin:10.11.11` image, finishes onboarding,
creates two SyncPlay enabled users and scans three generated two minute H.264/AAC clips.
It binds to the host loopback interface only, touches no other container or media, and is
safe to rerun.

- Server and Jellyfin Web: <http://127.0.0.1:18096> (`SYNCPLAY_PORT` changes the port)
- Users: `syncplay-host` and `syncplay-guest`, password `SyncPlay-local-2026`
- Tokens and media ids: `.state/credentials.json`
- Generated media, config and cache: `.state/`
- Logs and observations: `artifacts/`

`.state/` and `artifacts/` are gitignored. The credentials belong to this throwaway
server and nothing else.

## Controller against a live server

```sh
bun e2e/syncplay/controller-integration.ts
```

Drives the production `SyncPlayController` and transport over real REST and websocket
traffic, with simulated decoder states. It covers all 22 SyncPlay endpoints: duplicate
playlist entries, queue edits, repeat and boundary navigation, shuffle, ignore wait,
stop followed by play, permissions, reconnect and stale commands. Each run uses its own
device sessions, a temporary group and a restricted account it deletes afterwards. The
result lands in `artifacts/controller-integration.json`, without tokens.

## Native players

Simulated decoders say nothing about the native players. For those, sign in to the app
as `syncplay-guest` and to Jellyfin Web on the same server as `syncplay-host`, and put
both in one group. An Android emulator reaches the server through
`adb reverse tcp:18096 tcp:18096`.

SyncPlay always presents the native Swift or Compose player, whatever the solo player
preference is. After a change under `modules/`, rebuild the app: a Metro reload cannot
add native exports.

`observe.py` records what the server reports for both sessions after a UI action, and
can assert on it:

```sh
python3 e2e/syncplay/observe.py --label joined --expect-members 2
python3 e2e/syncplay/observe.py --label paused --expect-paused true --max-skew 2
python3 e2e/syncplay/observe.py --label playing --expect-paused false
```

Jellyfin extrapolates the position of a playing session once a second, so skew is only
trustworthy while paused. Compare playing positions on the actual frames. `--device`
limits the assertions to named devices, `--expect-item` checks the media id, and
`--expect-active 1` suits a single decoder, for example when testing a natural end of
file without a second client ending the item first.

Jellyfin 10.11 pauses a playing group when a member reports buffering. Turning on
ignore wait for that member releases the others, turning it off restores the barrier.
See the server's
[playing](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Controller/SyncPlay/GroupStates/PlayingGroupState.cs)
and
[waiting](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Controller/SyncPlay/GroupStates/WaitingGroupState.cs)
state handlers.

## Teardown

```sh
docker compose -f e2e/syncplay/compose.yml down
```

Delete `e2e/syncplay/.state/` to reset onboarding and media.
