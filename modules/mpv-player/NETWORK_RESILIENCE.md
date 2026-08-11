# Network resilience for remote playback (mpv renderer)

## The bug

Reports (e.g. "playback stops after a while, only seeking or restarting the
stream helps") describe streams that just freeze mid-playback with no error,
recoverable only by seeking (which reopens the stream at a new byte offset)
or by fully stopping and restarting (a brand new session/connection).

## Root cause

Both `MPVLayerRenderer.swift` (iOS/tvOS) and `MPVLayerRenderer.kt` (Android)
initialized libmpv without ever setting `network-timeout` or
`stream-lavf-o`. mpv has no native HTTP client of its own (removed in mpv
0.29) — every remote source (DirectPlay, DirectStream, and each individual
HLS transcode segment) is read through FFmpeg's `http`/`https` protocol via
`avio_open2()`. FFmpeg's reconnect behavior for that protocol defaults to
**off** (`reconnect=0`, `reconnect_streamed=0`, confirmed via
`ffmpeg -h full | grep reconnect`, all "default false").

So when the underlying TCP connection dies mid-stream — an idle-timeout on a
reverse proxy in front of Jellyfin, a cellular handover, a Wi-Fi/cellular
switch, a brief server hiccup, the Jellyfin transcoder process being
recycled — the demuxer's read fails and mpv simply stops advancing. No
retry, no visible error (mpv's `keep-open=always` just leaves the last frame
on screen). A seek issues a fresh `avio_open2()` at a new offset, which
happens to open a new, working connection — hence "seeking fixes it". A full
stop/restart obviously gets a new connection too.

## The fix

Set two options once, in `start()`, so they apply to every load (direct
play, direct stream, and every transcode/HLS segment fetch):

```ini
network-timeout=10
stream-lavf-o=reconnect=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=5
```

These map 1:1 to FFmpeg's `http` protocol AVOptions of the same names
(`reconnect`, `reconnect_streamed`, `reconnect_on_network_error`,
`reconnect_delay_max`, `timeout`). `stream-lavf-o` is mpv's mechanism for
forwarding arbitrary AVOptions straight to the FFmpeg protocol layer it
uses under the hood.

`reconnect_at_eof` is **deliberately not set**. It was tested and rejected
— see below.

## How this was verified (not just reasoned about)

A minimal C harness was built against the same `libavformat`/`libavutil`
Streamyfin's mpv links against, calling `avio_open2()` directly with the
exact option dictionary mpv would build from the strings above — the same
layer mpv's `stream_lavf.c` uses, with none of the `ffmpeg` CLI's extra
format-probing noise.

A local HTTP server was written that serves a real muxed MPEG-TS test file,
and on the very first request sends roughly a third of the bytes and then
resets the TCP connection (`SO_LINGER` 0 → RST, not a clean FIN) — modeling
a dead proxy/NAT mapping, not a graceful close. Every request after that is
served correctly.

Results:

- **Without the fix** (no options set): `avio_read` returns an I/O error
  after 113,740 of 341,220 bytes. The read loop terminates there — this is
  the freeze users report.
- **With the fix**: FFmpeg logs `Will reconnect at 113740 in 0 second(s),
  error=Connection reset by peer.`, reopens with a `Range: bytes=113740-`
  request, and the read loop completes with the full 341,220 bytes.
- **Regression check**: against a normal, non-flaky server, both the
  unpatched and patched option sets read all 341,220 bytes identically —
  the fix does not change behavior for healthy connections.
- **Why `reconnect_at_eof` was rejected**: enabling it made the harness log
  `Will reconnect at 341220 in 0/1/3 second(s), error=End of file.` — i.e.
  FFmpeg treated a **correct, complete** end-of-stream as another
  disconnect worth retrying, backing off for several seconds before
  finally giving up. Jellyfin never serves an open-ended growing resource
  through this code path (DirectPlay/DirectStream is one file with a known
  `Content-Length`; each HLS segment is its own bounded request), so
  `reconnect_at_eof` only adds a multi-second delay/log-noise at the
  natural end of every single stream with no corresponding benefit. It is
  intended for genuinely live, unbounded sources.

`modules/mpv-player/networkResilience.test.ts` regression-tests that both
native renderers still carry this exact option set (present, sane bounds,
`reconnect_at_eof` absent) so it can't silently regress.
