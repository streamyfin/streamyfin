# End-to-end bench

Everything under `e2e/` runs against a real Jellyfin server and real playback targets.
Unit tests prove the code in isolation; this bench proves the system: the app, the
server log, the session the server records, the receiver on the TV.

## Layout

| Path | Holds |
| --- | --- |
| `bench/` | Shared tooling: configuration, Jellyfin client, sessions observer, device inventory, Cast sender, Maestro runner, reports |
| `fixtures/` | Shared test data: receiver protocol vectors (replayed by Jest, JUnit and XCTest), media cases for the playback matrix |
| `suites/<name>/` | One folder per feature under test (`syncplay`, `cast`), each with its own README |
| `reports/` | Local run output, ignored by git |

## Tiers

- **Tier 0, unit.** Jest (`bun run test:unit`), the bench's own tests
  (`python3 -m unittest discover -s e2e/bench/tests -t e2e`), and the native module
  tests. Always in CI.
- **Tier 1, simulators and emulators.** Maestro flows driving a debug build with fake
  engines, no real Chromecast needed. In CI only on pull requests that touch cast code.
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

It holds the test server addresses, one account per profile, and the cast targets by
address. `redact` lists the hosts that reports must mask. Keep real passwords only in
that file. Never paste its content into an issue, a pull request or a report.

## Python dependencies

Only the Cast sender and the device inventory need a package outside the standard
library:

```sh
python3 -m venv e2e/.venv
e2e/.venv/bin/pip install -r e2e/requirements.txt
```

## Where results go

Each run writes a JSON file and a redacted Markdown file under
`e2e/reports/<date>/`. A run worth keeping as evidence is copied to the `keep_dir`
of the configuration with `--keep <subject>`; the Markdown copy is the one that can
be quoted in an issue.
