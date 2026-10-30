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

The receiver writes `DirectStream` for a static stream and `Transcode` otherwise, never
`DirectPlay`, and the server turns a `Transcode` without a transcoding job into `DirectPlay`.
So a case is judged on the one axis both can express, direct against transcoded: the
receiver's `playMethod` on its side, the server's transcoding job (the `transcodage` column)
on the other, and the row keeps the raw values. A case whose delivery differs from the
expectation for that target kind is reported `ko`, with both values; the expectation is a
hypothesis to correct with evidence, not a filter. A case is also `ko` when its position
advanced for less than half the time it was watched, and `incomplete` when it played but
the server had no session for the receiver to confirm it. Only the item asked for, under a
play session the receiver did not have before the send, counts as the case.

The run exits with 1 when a case is `ko` or `incomplete`, and with 3 when no case played at
all, on a server without the lab's tags for instance. The Markdown table lands in
`e2e/reports/<date>/` and, with `--keep`, in the evidence folder of the configuration; the
rows measured so far are saved whatever ends the run, Ctrl-C included.

The receiver is restarted before the first case, since it keeps the name and the bitrate cap
of the first sender that reached it, and it stops after every case, whatever happened, so the
TV never keeps playing a case the run has already measured.

## Flows (tier 1)

Maestro flows for simulators and emulators live in `flows/`. They need a build that embeds
the JS bundle (the release APK on Android); see `e2e/README.md`. On a fresh emulator the
build only assembles it: `bun run build:android:local`, then
`adb install -r android/app/build/outputs/apk/release/app-release.apk`, then
`bun run e2e:smoke` (or `make e2e`, which checks that a device is running first).
