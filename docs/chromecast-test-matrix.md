# Chromecast Cast Test Matrix

Manual verification for the device-profile work. Run each row by casting the
matching media from the app to a physical Chromecast and recording the result.

**Test device:** ___________________  (model name as reported by the app)
**App build / commit:** ___________________
**Date:** ___________________

## How to run

1. Pick a library item matching the row's codec / audio / container.
2. Cast it. Note whether it direct-plays or transcodes (server logs show
   `Video is being transcoded` vs `Video is being direct played`).
3. Record the load result: OK / 2100 / infinite-loading / other.

## Matrix

| # | Video codec | Audio | Container | Approx bitrate | Direct/Transcode | Result | Notes |
|---|---|---|---|---|---|---|---|
| 1 | H.264 1080p | AAC stereo | MP4 | ~4 Mb/s | | | |
| 2 | H.264 1080p | AAC stereo | MKV | ~8 Mb/s | | | |
| 3 | H.264 1080p | AAC 5.1 | MKV | ~8 Mb/s | | | |
| 4 | H.264 1080p | AC3 5.1 | MKV | ~10 Mb/s | | | |
| 5 | H.264 1080p | DTS 5.1 | MKV | ~12 Mb/s | | | |
| 6 | H.264 1080p | TrueHD 7.1 | MKV | ~20 Mb/s | | | |
| 7 | H.264 1080p | AAC stereo | MP4 | ~16 Mb/s | | | |
| 8 | H.264 1080p | AAC stereo | MP4 | source-max | | | |
| 9 | HEVC 8-bit | AAC stereo | MKV | ~10 Mb/s | | | |
| 10 | HEVC 10-bit | AAC stereo | MKV | ~15 Mb/s | | | |

## Outcome

- Highest video bitrate that loads reliably on the test device: ___________
  -> update `CONSERVATIVE_CAPABILITIES.maxVideoBitrate` in
  `utils/casting/capabilities.ts` accordingly.
- Confirmed cause of issue #1423 (<= 2 Mb/s): ___________
- Confirmed cause of the 5.1 crash (#1085): ___________
- Cases where downgrade-on-failure retry rescued playback: ___________
