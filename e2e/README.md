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
  (`./gradlew :mpv-player:testDebugUnitTest` in a prebuilt `android/`; in CI,
  `.github/workflows/native-tests.yml` on changes under `modules/`).
- **Tier 1, simulators and emulators.** Maestro flows against a build that embeds the JS
  bundle, which on Android is the release APK (`bun run build:android:local`); a debug build
  is an Expo dev client waiting for Metro. Run `bun run e2e:smoke`, or
  `python3 e2e/bench/maestro.py --flow <flow> --device <id>`. In CI only on pull requests
  that touch cast code (`.github/workflows/e2e-tier1-android.yml`).
- **Tier 2, real devices.** Driven from a developer machine against the test server:
  Chromecast, Google TV, Apple TV, phones and tablets. The Python sender talks to the
  Jellyfin receiver directly, so the receiver and the server can be tested without the
  app, and the sessions observer reads what the server recorded.

## Configuration

The bench reads one private JSON file, never committed:

```sh
cp e2e/bench/config.example.json e2e/bench/config.local.json
# or point E2E_BENCH_CONFIG at the file
```

It holds the test server addresses, one account per profile (the `syncplay-host` and
`syncplay-guest` profiles are what the SyncPlay suite signs in with), and the cast targets
by address. `redact` lists the hosts that reports must mask. Keep real passwords only in
that file. Never paste its content into an issue, a pull request or a report.

## Python dependencies

Only the Cast sender and the device inventory need a package outside the standard
library:

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
never log each other out and leave no device behind on the server.

## Where results go

Each run writes a JSON file and a redacted Markdown file under
`e2e/reports/<date>/`. A run worth keeping as evidence is copied to the `keep_dir`
of the configuration with `--keep <subject>`; the Markdown copy is the one that can
be quoted in an issue.
