# Receiver protocol vectors

Shared test vectors for the messages exchanged with the Jellyfin Chromecast receiver
(`F007D354`, namespace `urn:x-cast:com.connectsdk`), as receiver 1.3.2 handles them. One
file per concern, one format:

```json
{ "version": 1, "cases": [{ "name": "...", "input": {}, "expected": {} }] }
```

Every implementation of the protocol replays the same files, so the TypeScript sender,
the Python bench sender and the native engines cannot drift apart:

| File | What it pins | Readers |
| --- | --- | --- |
| `play-now.json` | The message envelope (`command`, `serverAddress`, `accessToken`, `userId`, optional `receiverName`, `maxBitrate` on every message, `options`), the item slimming, the program-to-channel translation, Seek in whole seconds, and the refusal of a container | Jest (`utils/cast/receiverProtocolVectors.test.ts`) for everything; Python (`e2e/bench/tests/test_sender.py`) for the envelope, the options of a plain command and the refusal, it sends PlayNow options as given |
| `receiver-name.json` | The name handed to the receiver and the receiver's own cleanup of it, whitespace being what JavaScript's `\s` matches | Jest, Python |
| `queue-window.json` | Which part of a long queue goes into one PlayNow | Jest |
| `bus-messages.json` | How raw channel messages are parsed: a status message carries `data` as a nested object, the position under `data.PlayState.PositionTicks`; an error carries a `message` | Jest, Python |
| `media-status-custom-data.json` | The fields read off the receiver's media `customData`, the same 11 keys on every load | Jest |
| `media-position.json` | The position in the item, from the media status `currentTime` and the `customData` | Jest |
| `load-outcomes.json` | How a sequence of receiver events settles a load: `loaded`, `failed`, `timed_out`, `superseded`. The top-level `request` is sent unless a case has its own; a container is refused whatever the receiver reports, never loaded through one of its children | Jest |

A container is an item whose `Type` is `Playlist`, `MusicArtist` or `MusicGenre`, or any
item with `IsFolder` true. Handed one first, the receiver plays children it picks itself
and drops the other items, so no item id tells that load from the media the TV already
plays; one further down the queue goes to its PlaybackInfo as it is, and fails there. A
sender refuses a request holding a container anywhere, with an error of its own, before
anything is sent: a case that expects `{ "refused": "container" }` checks that refusal,
and that nothing reached the receiver.

In `bus-messages.json`, an object `input` is the message as the receiver builds it, and a
reader serializes it the way the wire and the native bridges deliver it; a string `input`
is a payload as received. Status messages show the keys a sender reads: the receiver puts
more of the item in `NowPlayingItem`.

The native readers replay every case of every file: JUnit
(`modules/mpv-player/android/src/test/java/expo/modules/mpvplayer/cast/receiver/ReceiverProtocolVectorsTest.kt`,
on Kotlin's `ReceiverProtocol`) and the Swift check (`scripts/ios/test-receiver-protocol.sh`,
on `modules/mpv-player/ios/Cast/ReceiverProtocol.swift`).

Add a case here first, then make every reader pass it. A reader that cannot express a
case skips it by name and says so in its own test.
