# End-to-end bench

Everything under `e2e/` runs against a real Jellyfin server and real playback targets.
Unit tests prove the code in isolation; this bench proves the system: the app, the
server log, the session the server records, the receiver on the TV.

## Layout

| Path | Holds |
| --- | --- |
| `bench/` | Shared tooling: configuration, Jellyfin client, sessions observer, device inventory, Cast sender, Maestro runner, reports |
| `fixtures/` | Shared test data: receiver protocol vectors (replayed by Jest and the Python sender, later by JUnit and XCTest), media cases for the playback matrix |
| `suites/<name>/` | One folder per feature under test (`syncplay`, `cast`), each with its own README |
| `reports/` | Local run output, ignored by git |

## Tiers

- **Tier 0, unit.** Jest (`bun run test:unit`, which includes the shared protocol
  vectors), the bench's own tests (`bun run e2e:bench:test`, that is
  `python3 -m unittest discover -s e2e -t e2e`), and the native module tests
  (`./gradlew :<module>:testDebugUnitTest` in a prebuilt `android/`, for each module with
  tests under `android/src/test`; in CI, `.github/workflows/native-tests.yml` on changes
  under `modules/`).
- **Tier 1, simulators and emulators.** Maestro flows against a build that embeds the JS
  bundle, which on Android is the release APK: `bun run build:android:local` only assembles
  it, so install it with
  `adb install -r android/app/build/outputs/apk/release/app-release.apk`. A debug build is an
  Expo dev client waiting for Metro. Then run `bun run e2e:smoke`, or
  `python3 e2e/bench/maestro.py --flow <flow> --device <id>`. Without `--device`, a flow runs on
  the one emulator or simulator running and never on a phone: the smoke flow clears the app's
  data. In CI on pull requests that touch cast code, the bench (`e2e/**`) or a screen the
  flows find by test id, and on demand (`.github/workflows/e2e-tier1-android.yml`): the smoke
  flow, then the output sheet on the fake receivers, signed in to a throwaway server
  (`e2e/suites/cast/README.md`).
- **Tier 2, real devices.** Driven from a developer machine against the test server:
  Chromecast, Google TV, Apple TV, phones and tablets. The Python sender talks to the
  Jellyfin receiver directly, so the receiver and the server can be tested without the
  app, and the sessions observer reads what the server recorded.

## Fake Cast receivers

Tier 1 has no Chromecast, so a build can ask for two fake receivers in place of the Cast SDK's:
"Bench TV" and "Bench Speaker". They list on discovery, connect 600 ms after a request and end
300 ms after a disconnection (`RemoteTargetConstants`), and a switch ends one session before
the next starts. Only the target the module publishes (`getRemoteTarget`, `connectToDevice`,
`onRemoteTargetChanged`) and the output sheet, which reads it, go through them: no media
plays, so the sheet's end action reads Disconnect.

- **Android**: `./gradlew … -PstreamyfinFakeCastDevices=true`, or the variable as a prefix of
  one command, for example
  `ORG_GRADLE_PROJECT_streamyfinFakeCastDevices=true bun run build:android:local`. It sets
  `BuildConfig.FAKE_CAST_DEVICES` in the mpv-player module, in every variant. Do not export it.
- **iOS**: `STREAMYFIN_FAKE_CAST_DEVICES=1 pod install --project-directory=ios` from the
  repository root (the Podfile is the one `expo prebuild` writes in `ios/`), and the same prefix
  on `expo run:ios`, which may install the pods again, adds `FAKE_CAST_DEVICES` to the module's
  Swift conditions. Run `pod install --project-directory=ios` again without it before any other
  build.

A store profile refuses both: with `EAS_BUILD_PROFILE` starting with `production`, Gradle and
the podspec stop the build. On iOS the define stays in the Pods configuration until the next
`pod install`, so a tier 1 install also stops any archive, whatever its profile, on the build
phase `Refuse fake Cast receivers in an archive`: tier 1 runs on simulators, which never archive. A build that has them logs
`Fake Cast receivers in place of the Cast SDK's: this is a tier 1 build` when the module
starts. In a debug build, the remote target probe (`e2e/suites/cast/README.md`) shows which
receivers it has: `--es device "Bench TV"` connects in a fake build, and ends with
`failed: no device named "Bench TV"` in any other.

## Configuration

The bench reads one private JSON file, never committed:

```sh
cp e2e/bench/config.example.json e2e/bench/config.local.json
# or point E2E_BENCH_CONFIG at the file
```

`E2E_BENCH_CONFIG` may point outside the checkout, or at any `e2e/bench/<name>.local.json`,
which git ignores: the bench refuses a file of the checkout that the next `git add` would
commit.

It holds the test server addresses, one account per profile (the `syncplay-host` and
`syncplay-guest` profiles are what the SyncPlay suite signs in with), and the cast targets
by address. `redact` lists the hosts that reports must mask. Keep real passwords only in
that file. Never paste its content into an issue, a pull request or a report.

## Python dependencies

The bench needs Python 3.11 or later, which PyChromecast 14 requires. Only the Cast sender
and the device inventory need a package outside the standard library:

```sh
python3 -m venv e2e/.venv
e2e/.venv/bin/pip install -r e2e/requirements.txt
```

## Tools

```sh
e2e/.venv/bin/python e2e/bench/devices.py                     # what can be driven right now
python3 e2e/bench/sessions.py --server beta13 --device "Living room" --expect-paused false
e2e/.venv/bin/python e2e/bench/sender.py --server beta13 --target "Living room" play-now --item V01 --watch 20
e2e/.venv/bin/python e2e/suites/cast/matrix.py --server beta13 --target "Living room" --cases V01,V03 --keep projet-0
```

Each bench client signs in with its own device id and signs out when it is done, so runs
never log each other out and leave no device behind on the server. The one exception is the
token the sender hands a receiver: the receiver keeps using it for its progress reports and
its stream, so it is kept in `e2e/bench/receiver-tokens.local.json` (ignored by git and Biome)
per server, profile and target, reused by the next command to that receiver, and revoked by
`stop` or by a later run that finds the receiver idle. Idle means the receiver answered so: a
status request left unanswered keeps the token, and a `stop` the receiver does not obey within
10 s exits with 1. A token whose sign-out fails waits in the same file, as an orphan, for the
next run to retry it. One run at a time drives a receiver: a second one, the matrix
included, exits with 2 instead of handing it a token of its own. The bitrate cap of the
session is kept with the token: `play-now` sets it, uncapped without `--max-bitrate`, and every
later command states it again, since the receiver applies the cap of each message to the loads
after it. A later command given `--max-bitrate` changes it for the rest of the session. A
session whose cap is unknown, one the bench did not start or one kept with no cap on record,
needs `--max-bitrate` on every command but `stop` and `status`. Only `play-now` starts the
receiver; the other actions leave whatever the TV shows alone.

## Where results go

Each run writes a JSON file and a redacted Markdown file under `e2e/reports/<date>/`, named
after the tool, the time to the second and a short suffix, so two runs never share a file. A
run worth keeping as evidence is copied to the `keep_dir` of the configuration with
`--keep <subject>`, under a name that starts with its date; the Markdown copy is the one that
can be quoted in an issue. The sessions observer only puts in it the sessions of the bench's
own accounts, or of the devices named with `--device`, never the other users of the server.
