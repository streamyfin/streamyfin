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

The receiver is restarted before the first case, since it keeps the device name of the first
sender that reached it, and it stops after every case, whatever happened, so the TV never
keeps playing a case the run has already measured. Every message carries a bitrate cap, the
uncapped 120 Mb/s the app sends when no cap is picked, so the receiver runs no bandwidth
measurement of its own: a case that depends on the link, E10 say, plays under that cap.

## Flows (tier 1)

Maestro flows for simulators and emulators live in `flows/`. They need a build that embeds
the JS bundle (the release APK on Android); see `e2e/README.md`. On a fresh emulator the
build only assembles it: `bun run build:android:local`, then
`adb install -r android/app/build/outputs/apk/release/app-release.apk`, then
`bun run e2e:smoke` (or `make e2e`). Both run on the one emulator or simulator running, never
on a phone, since the flow clears the app's data: `make e2e DEVICE=<adb serial>`, or
`--device` for `e2e/bench/maestro.py`, names another device.

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

## Cast engine probe

Debug builds carry a probe that drives a real receiver through the native Cast engine, so
what the engine does on a TV is read from the device log rather than inferred. It binds an
engine to the session of the first PlayNow the app sends, then, once that item plays, runs a
fixed script through the engine's transport.

It needs a Chromecast or a Google TV on the phone's network with the default Jellyfin
receiver, and a debug build signed in to a test server, Metro running.

**Android.** Clear the log, arm the probe, read the log, then cast an item from its page
with the header Cast button, which is the app's own path. The last command keeps reading, so
the cast goes from the app while it runs:

```sh
adb logcat -c
adb shell am broadcast -n com.fredrikburmester.streamyfin/expo.modules.mpvplayer.cast.engine.CastEngineProbeReceiver -a expo.modules.mpvplayer.CAST_ENGINE_PROBE
adb logcat -v time -s CastEngine:I CastEngineProbe:I ReceiverChannelHub:I StreamyfinCast:W
```

The broadcast needs the `DUMP` permission, which `adb shell` has. The log then reads:

- `CastEngineProbe: armed`, then `engine bound, waiting for the item to play` and
  `item playing, running the script`.
- `ReceiverChannelHub: attached session=<id>` and `registered urn:x-cast:com.connectsdk
  session=<id> subscribers=<n>`: the app's JS and the engine share one channel.
- `CastEngine: bound to session <id> launched=<bool>`, then a line per state change,
  `status <state> playSession=<id> playMethod=<DirectStream|Transcode> canClientSeek=<bool>`.
- `CastEngineProbe: position <s>/<duration>` every second, the receiver's messages as
  `bus type=<type> PlayMethod=… PositionTicks=… AudioStreamIndex=… SubtitleStreamIndex=…`
  (the `PlayState` fields only), and `bus sent <command>` for what the app's JS sent.
- One `step <name>` per step, timed from the first playing status: `pause` (5 s), `play`
  (8 s), `seek+30` (12 s), `volume-0.1` (20 s), `volume-back` (23 s), `audio-reload` (26 s),
  `subtitles-off` (40 s), `next` (45 s, to the next item when JS cast a queue),
  `capped-reload` (55 s, the item played again where it is under a 192 kb/s cap, as a quality
  change does through `reloadCurrentItem`; the probe's engine never loaded, so the receiver
  keeps that item alone, hence `next` first), `seek+30` (65 s), `detach` (80 s). The TV pauses
  and plays on, shows its volume banner twice, and keeps playing after `detach`. In the log: `seek <s> path=media` on
  a stream the receiver seeks in and `path=bus` on one it cannot, a transcode after the capped
  reload; `reload settled loaded`; `send SetSubtitleStreamIndex`; `send NextTrack`; `send PlayNow` and
  `reload settled loaded` for the capped reload;
  `detached from session <id>` and `disarmed`.
- `idle finished, waiting for the next item` at the end of a track with more to come.

What the server recorded for the receiver is read with `sessions.py`, during V03 for a
direct stream, and after `capped-reload` on MUSIC-FLAC for a transcode:

```sh
e2e/.venv/bin/python e2e/bench/sessions.py --server beta13 --device "Living room" --expect-play-method DirectStream --expect-paused false --expect-active 1
```

Stopping the cast from the Cast dialog logs `binding lost session=<id> error=null`,
`detached from session <id>` and `disarmed`. After a cast the SDK's expanded controls are
open: their toolbar Cast button, read as `Cast. Connected`, opens that dialog; the app's
header button reads `Cast button, Connected`.

Cutting the phone's network ended the session on the emulator, within a second of the cut,
after a suspend of about 16 s, or once right after a resume over its mobile link. The
engine logs `binding lost session=<id> error=<code>`, status 2155 when the SDK gives one,
then `detached from session <id>`. A phone that gets its Wi-Fi back within the SDK's window
should log `session <id> suspended`, then `session <id> resumed` with the same id and bus
messages again within 5 s: that check is left for a phone on the receiver's Wi-Fi.

**iOS.** Pass the launch argument `-CastEngineProbe YES`, from the Xcode scheme or with
`xcrun devicectl device process launch --console --terminate-existing --device <iPhone>
<bundle identifier> -CastEngineProbe YES`, and read the same lines on the console. For the
resume, put the app in the background for 10 s.

Receiver 1.3.2 starts a transcode it cannot seek in at twice the position asked
(jellyfin/jellyfin-chromecast#971): the second `seek+30` on MUSIC-FLAC shows it. Keep the
evidence with `sessions.py --keep <subject>` and quote only that redacted copy: a raw log
holds addresses.

## Remote target probe

Debug builds carry a second probe, for the target state the module publishes to JS
(`getRemoteTarget`, `onRemoteTargetChanged`): it connects to a receiver by name through the
same hub as `connectToDevice`, without the SDK's dialog, and logs every state it goes
through. No server and no media are involved, so any receiver on the phone's network will do.

**Android.** Name the receiver, or a part of its name. A whole name connects at once and wins
over a part of another (`Salon` against `Salon - Chromecast`); a part of a name waits 3 s for
the whole one to show up, since iOS lists receivers one at a time:

```sh
adb logcat -c
adb shell am broadcast -n com.fredrikburmester.streamyfin/expo.modules.mpvplayer.cast.target.CastTargetProbeReceiver -a expo.modules.mpvplayer.CAST_TARGET_PROBE --es device "<name>"
adb logcat -v time -s CastTargetProbe:I StreamyfinCast:W
```

The log reads `armed for "<name>" state=none …`, `found <device>`, then one line per state,
`state=<none|connecting|connected|ending> target=<device> reconnecting=<bool> error=<…>`:
connecting, connected, then, after 5 s, `disconnecting`, ending, none, and `done`. The TV
shows the Jellyfin receiver, then its home screen. A `failed: <reason>` line ends a run that
did not get there: no such device within 15 s, a connection the SDK refused (with its
error), none within 30 s, or no end within 20 s.

**A switch, a lost receiver.** Armed while another receiver is connected, the probe switches
to the one it names: the old session ends (`none` without an error is that end, not a
failure), then the new one connects. `--el hold <ms>` holds the session that long before the
disconnection, which leaves time to cut the phone's network or the receiver's power: the log
then reads `reconnecting=true`, then `none` with the error the SDK gave, and `done`.

**A switch asked back.** Armed while another receiver is connected, `--ez back true` makes
the probe ask for the receiver it names, then at once for the connected one again, before the
switch has ended its session: the last request wins. The log reads `found <device>`,
`asking <connected device> again`, then ending, connecting and connected on that receiver,
with no `none` in between, and the receiver the probe named never connects.

**A session running at launch.** Add `--ez keep true` and the probe stops at connected,
leaving the session up. Kill the app (`adb shell am force-stop com.fredrikburmester.streamyfin`),
open it again, and send the same broadcast with `keep`: the first line reads
`armed for "<name>" state=connected target=<device>`, then `already connected to <device>`,
because the SDK resumed the session before anything asked. A last broadcast without `keep`
ends it.

**iOS.** Pass `-CastTargetProbe "<name>"`, `-CastTargetProbeKeep YES` to leave the session
up and `-CastTargetProbeHold <ms>` to hold it, as launch arguments; the same lines come out
under `[CastTargetProbe]`, in `tmp/logs.txt` of the app's container. Every launch meets the
SDK resuming the session it had, so a switch inside a live session needs one process:
`-CastTargetProbeThen "<other name>"` asks for the second receiver once the first is connected,
the first session kept up with or without `-CastTargetProbeKeep`.
`-CastTargetProbeBack YES` is `back` for the probe that switches: with a chain, the second one.
