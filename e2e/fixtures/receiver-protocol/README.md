# Receiver protocol vectors

Shared test vectors for the messages exchanged with the Jellyfin Chromecast receiver
(`F007D354`, namespace `urn:x-cast:com.connectsdk`). One file per concern, one format:

```json
{ "version": 1, "cases": [{ "name": "...", "input": {}, "expected": {} }] }
```

Every implementation of the protocol replays the same files, so the TypeScript sender,
the Python bench sender and the native engines cannot drift apart:

| File | What it pins | Readers |
| --- | --- | --- |
| `play-now.json` | The message envelope (`command`, `serverAddress`, `accessToken`, `userId`, optional `receiverName` and `maxBitrate`, `options`), the item slimming and the program-to-channel translation | Jest (`utils/cast/receiverProtocolVectors.test.ts`), Python (`e2e/bench/tests/test_sender.py`) |
| `receiver-name.json` | The name handed to the receiver and the receiver's own cleanup of it | Jest, Python |
| `queue-window.json` | Which part of a long queue goes into one PlayNow | Jest |
| `bus-messages.json` | How raw channel messages are parsed | Jest, Python |
| `media-status-custom-data.json` | The fields read off the receiver's media `customData` | Jest |
| `load-outcomes.json` | How a sequence of receiver events settles a load: `loaded`, `failed`, `timed_out`, `superseded` | Jest |

Add a case here first, then make every reader pass it. A reader that cannot express a
case skips it by name and says so in its own test.
