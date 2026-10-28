# SyncPlay suite

Exercises SyncPlay against the real protocol: the production `SyncPlayController` and
transport over REST and websocket traffic, with simulated decoder states, plus manual rounds
on the native players observed through the server.

## Server

Two ways to run it:

- **Bench server (default for development).** Set `E2E_BENCH_CONFIG` to the bench
  configuration (see `e2e/README.md`); the harness takes the server named by
  `E2E_BENCH_SERVER` (`beta1011` by default) and its `syncplay-host` / `syncplay-guest`
  accounts, and resolves the media by lab code (`E2E_SYNCPLAY_ITEMS`, default
  `V01,V03,V06`). Each run uses its own device sessions, a temporary group and a restricted
  account it deletes afterwards, so it leaves nothing behind.
- **Throwaway server (CI and destructive rounds).** `python3 e2e/suites/syncplay/setup.py`
  starts the official `jellyfin/jellyfin:10.11.11` image on the host loopback only, finishes
  onboarding, creates two SyncPlay enabled users and scans three generated two minute clips.
  Users `syncplay-host` and `syncplay-guest`, password `SyncPlay-local-2026`; tokens and
  media ids in `.state/credentials.json`; generated media, config and cache in `.state/`.
  Without `E2E_BENCH_CONFIG` the harness refuses any host but `127.0.0.1`.

Prerequisites for the throwaway server: Docker Desktop, Python 3, FFmpeg with H.264 and AAC
encoders, Bun.

## Controller against a live server

```sh
E2E_BENCH_CONFIG=e2e/bench/config.local.json bun e2e/suites/syncplay/controller-integration.ts
# or, after setup.py:
bun e2e/suites/syncplay/controller-integration.ts
```

It covers all 22 SyncPlay endpoints: duplicate playlist entries, queue edits, repeat and
boundary navigation, shuffle, ignore wait, stop followed by play, permissions, reconnect and
stale commands. The result lands in `artifacts/controller-integration.json`, without tokens.

## Native players

Simulated decoders say nothing about the native players. For those, sign in to the app as
`syncplay-guest` and to Jellyfin Web on the same server as `syncplay-host`, and put both in
one group. An Android emulator reaches a throwaway server through
`adb reverse tcp:18096 tcp:18096`.

SyncPlay always presents the native Swift or Compose player, whatever the solo player
preference is. After a change under `modules/`, rebuild the app: a Metro reload cannot add
native exports.

`observe.py` records what the throwaway server reports for both sessions after a UI action,
and can assert on it (`bench/sessions.py` does the same against a bench server):

```sh
python3 e2e/suites/syncplay/observe.py --label joined --expect-members 2
python3 e2e/suites/syncplay/observe.py --label paused --expect-paused true --max-skew 2
python3 e2e/suites/syncplay/observe.py --label playing --expect-paused false
```

Jellyfin extrapolates the position of a playing session once a second, so skew is only
trustworthy while paused. Compare playing positions on the actual frames. `--device` limits
the assertions to named devices, `--expect-item` checks the media id, and `--expect-active 1`
suits a single decoder, for example when testing a natural end of file without a second
client ending the item first.

Jellyfin 10.11 pauses a playing group when a member reports buffering. Turning on ignore
wait for that member releases the others, turning it off restores the barrier. See the
server's
[playing](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Controller/SyncPlay/GroupStates/PlayingGroupState.cs)
and
[waiting](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Controller/SyncPlay/GroupStates/WaitingGroupState.cs)
state handlers.

## Teardown of the throwaway server

```sh
docker compose -f e2e/suites/syncplay/compose.yml down
```

Delete `e2e/suites/syncplay/.state/` to reset onboarding and media.
