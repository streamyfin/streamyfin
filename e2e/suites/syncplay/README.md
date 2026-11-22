# SyncPlay suite

Exercises SyncPlay against the real protocol: the production `SyncPlayController` and
transport over REST and websocket traffic, with simulated decoder states, plus manual rounds
on the native players observed through the server.

## Server

Two ways to run it:

- **Bench server (default for development).** Set `E2E_BENCH_CONFIG` to the bench
  configuration (see `e2e/README.md`); the harness takes the server named by
  `E2E_BENCH_SERVER` (`beta1011` by default) and its `syncplay-host` / `syncplay-guest`
  accounts, and resolves the media by lab code (`E2E_SYNCPLAY_ITEMS`, three distinct codes,
  default `V01,V03,V06`). Each run uses its own device sessions, a temporary group and a
  restricted account with a random password; at the end, Ctrl-C included, it signs every
  client out and deletes that account, and reports as a failure whatever it could not clean
  up. `syncplay-host` must be an administrator: creating and deleting that restricted account
  needs it, and the harness checks the permission before any step runs.
- **Throwaway server (CI and destructive rounds).** `bun run e2e:setup`
  starts the official `jellyfin/jellyfin:10.11.11` image on the host loopback only, finishes
  onboarding, creates two SyncPlay enabled users and scans three generated two minute clips.
  Users `syncplay-host` and `syncplay-guest`, password `SyncPlay-local-2026`; tokens and
  media ids in `.state/credentials.json`; generated media, config and cache in `.state/`.
  Without `E2E_BENCH_CONFIG` the harness refuses any host but `127.0.0.1`.

Prerequisites for the throwaway server: Docker Desktop, Python 3.10+, FFmpeg with H.264 and AAC
encoders, Bun.

## Opt-in catalog

Run the throwaway server setup, then seed the same server with deterministic media:

```sh
bun run e2e:setup
bun run e2e:seed
```

The seed adds 20 movies, four series with 12 episodes, and 15 tracks in five
albums by five artists, plus a placeholder `Movie`, a `Show` with two episodes, and an
`Album` with two tracks that it always creates.
Each new movie and episode is a generated 10-second black/silent video; each new track is
10 seconds of silence. Titles, years, provider IDs, episode numbers and audio
tags come from the committed inventory, not from copied media. The three original
SyncPlay clips stay in `SyncPlay Fixtures`. The seed does not fetch original films, audio,
posters or descriptions, or contact metadata providers.
Its generated files live in `e2e/suites/syncplay/.state/catalog/` and are mounted
read-only. First-time generation and scanning can take a few minutes. The command
waits for Jellyfin to expose the expected items, then prints its URL and library
names. Rerunning it does not rewrite media or rescan unless an expected item is
missing. This is opt-in and does not change the CI smoke flow.

Use `syncplay-host` or `syncplay-guest` with password `SyncPlay-local-2026` in
Maestro. The default port is 18096.

### Several checkouts side by side

`setup.py` records this checkout's compose project, container name and port in
`e2e/suites/syncplay/.env` (ignored). Every later command, `seed`, `enrich`, `e2e:down`
and `docker compose`, reads it, so the variables are typed once. `setup.py` refuses to
start when a container with that name was started by another checkout. In a second
worktree, give it its own names the first time:

```sh
SYNCPLAY_PROJECT=streamyfin-maestro-local SYNCPLAY_CONTAINER=streamyfin-maestro-local-jellyfin SYNCPLAY_PORT=18117 bun run e2e:setup
bun run e2e:seed
```

A variable that disagrees with `.env` is refused. Rerun `setup.py` if credentials become
stale: it refreshes distinct host and guest sessions, and seeding reuses the stored host
token without logging either one out.

### Running a Maestro flow against it

```sh
python3 e2e/bench/maestro.py --flow <flow> --syncplay
```

`--syncplay` passes these variables to the flow, read from `.state/credentials.json`, so
a flow never hardcodes the port: `SERVER_URL` (`http://127.0.0.1:<port>`),
`ANDROID_SERVER_URL` (`http://10.0.2.2:<port>`), `USERNAME` (`syncplay-host`),
`GUEST_USERNAME` and `PASSWORD`. An iOS simulator uses `SERVER_URL`. An Android emulator
uses `ANDROID_SERVER_URL`, or `SERVER_URL` after `adb reverse tcp:<port> tcp:<port>`.
An `--env KEY=VALUE` on the same command overrides any of them.

### Optional artwork and Streamyfin plugin

The offline seed never downloads media or artwork. To opt in to online metadata
and posters for the local catalog, run:

```sh
bun run e2e:enrich --limit 10
bun run e2e:enrich
```

The first invocation is a small trial batch; omit `--limit` to request missing
artwork and descriptions for the whole catalog. This step installs the pinned
Streamyfin Jellyfin plugin on this worktree's container if missing, restarts
only that container, enables available image and metadata fetchers on the
three catalog libraries, and refreshes incomplete items without replacing
existing images or metadata. The SyncPlay Fixtures library remains offline.
The command blocks until Jellyfin has fetched what it queued, polling every few
seconds, then prints a summary with `stillMissing` listing any item that did not get
artwork or an overview. It exits 1 when `stillMissing` is not empty, for example
because a provider has no image or `--timeout` (300 seconds by default) passed. Pass
`--async` to queue the requests and return at once. Rerunning the command retries
items that still lack artwork or a movie/series overview.
Fetched posters may have copyright separate from the underlying film; keep
Jellyfin's downloaded artwork in ignored `.state/`, not in the repository.
This command requires internet access; `setup.py` and `e2e:seed` do not.

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
one group. An Android emulator reaches a throwaway server at
`http://10.0.2.2:<port>`, or through `adb reverse tcp:<port> tcp:<port>`.

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
client ending the item first. The minimum of active sessions only backs the item, pause, play
method and skew assertions, so the `joined` round passes before anything plays.

Jellyfin 10.11 pauses a playing group when a member reports buffering. Turning on ignore
wait for that member releases the others, turning it off restores the barrier. See the
server's
[playing](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Controller/SyncPlay/GroupStates/PlayingGroupState.cs)
and
[waiting](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Controller/SyncPlay/GroupStates/WaitingGroupState.cs)
state handlers.

## Teardown of the throwaway server

```sh
bun run e2e:down
```

Stops and removes this checkout's container and network, then deletes `.state/`,
`artifacts/` and `.env`, so the next `setup.py` starts from onboarding. It refuses a
container that another checkout started. On Linux, Docker may have written root-owned
files into `.state/config`; remove those with `sudo` if the command reports a permission error.
