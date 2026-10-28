# Cast suite

Tier 2 tooling for the Jellyfin Chromecast receiver and the Cast targets of the bench.

## Playback matrix

Plays the cases of `e2e/fixtures/media.json` on one target with the Python sender, and
records for each case what the receiver's media status says (`playMethod` in its
`customData`), what the server recorded for the receiver's session (play method,
transcoding reasons), how long the start took, how far the position advanced during the
watch window, and the receiver's own error messages.

```sh
e2e/.venv/bin/python e2e/suites/cast/matrix.py --server beta13 --target "Living room" --cases V01,V03 --keep projet-0
```

A case whose observed play method differs from the expectation for that target kind is
reported `ko`, with both values; the expectation is a hypothesis to correct with evidence,
not a filter. The Markdown table lands in `e2e/reports/<date>/` and, with `--keep`, in the
evidence folder of the configuration.

The receiver stops after every case, whatever happened, so the TV never keeps playing a
case the run has already measured.

## Flows (tier 1)

Maestro flows for simulators and emulators live in `flows/`. They need a build that embeds
the JS bundle (the release APK on Android); see `e2e/README.md`. On a fresh emulator the
build only assembles it: `bun run build:android:local`, then
`adb install -r android/app/build/outputs/apk/release/app-release.apk`, then
`bun run e2e:smoke` (or `make e2e`, which checks that a device is running first).

`flows/cast-item-on-receiver.yml` goes further than the smoke flow: from a signed-in app on
the phone emulator it finds an item by name, connects to a receiver through the header Cast
button, plays the item on it, then stops casting from the SDK's expanded controls. It needs
the emulator (so the Mac) on the receiver's network, and two variables:

```sh
python3 e2e/bench/maestro.py --flow e2e/suites/cast/flows/cast-item-on-receiver.yml --device emulator-5554 \
  --env "ITEM_NAME=H.264 Baseline 480p" --env "CAST_NAME=Living room"
```

Its taps by position are laid out for the bench's 1080x2400 phone emulator. What the server
recorded for the receiver during the flow is read with `e2e/bench/sessions.py`, as for the
matrix.
