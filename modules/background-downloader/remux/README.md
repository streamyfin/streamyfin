# Native packet-copy remuxer

`DownloadRemuxer.remux(videoPath, audioPaths, audioTitles, audioLanguages,
outputPath, onProgress, isCancelled)` is synchronous on both platforms. Run it on
a native worker. Titles/languages contain primary audio first, then one entry per
extra input. Progress is monotonic `0...1`; `1` means the file has been finalized,
validated and closed. The lifecycle coordinator, not this primitive, atomically
publishes the result.

The output must be a **new** path distinct from all inputs. It is exclusively
created and removed on failure/cancellation; existing files are never replaced.
Apple errors use `NSError(domain: "StreamyfinRemux", code: 1)`, or code `2` for
cancellation. Android throws `IOException`/`IllegalArgumentException`, or
`CancellationException` for cancellation.

## Supported contract

- Every input is a completed progressive MP4 with exactly one H.264 Baseline
  video track and one AAC-LC, 1024-sample-frame, mono or stereo audio track. The first
  input supplies video and primary audio. Other video tracks are discarded.
- AVC packets and AAC packets are copied, not decoded or encoded. Apple uses
  compressed `AVAssetReaderTrackOutput`; Android uses `MediaExtractor`. Android
  Annex-B AVC output is normalized to Matroska's length-prefixed representation.
- All readers are merged in presentation order. One common timestamp shift
  accommodates negative AAC priming timestamps; offsets between tracks remain
  intact. Apple edit-list markers and batched AAC samples are handled explicitly.
- The output has one AVC track, every requested AAC track, per-track UTF-8 titles
  and language identifiers, the actual input channel count (one or two),
  primary-only audio `FlagDefault`, duration, SeekHead
  and video cues. It uses a microsecond timestamp scale. No subtitle/font muxing.
- Encrypted media, non-Baseline/reordered video, HE-AAC/surround audio, extra/missing
  tracks, changing Apple codec configurations, empty/truncated media and invalid
  timestamps fail rather than silently omitting a track.
- At most 32 audio tracks and 32 MiB per media packet/read buffer are accepted.
  Media is streamed, with one pending Apple buffer per track or one reusable
  Android copy buffer. libwebm retains its segment/cluster/cue index metadata,
  not the complete media payload. Normal index memory grows with recording
  duration, as it does for ordinary seekable container writers.

## Build

`libwebm.json` pins official
[`webmproject/libwebm`](https://github.com/webmproject/libwebm) to commit
`f2a982d748b80586ae53b89a2e6ebbc305848b8c` (1.0.0.32).
Only its muxer and the legacy parser used for final validation are built. No
codec library, FFmpeg binary or retired ffmpeg-kit dependency is introduced.

- Android: module `externalNativeBuild`, CMake 3.22.1, C++17; FetchContent downloads
  the pinned source on the first build. JNI symbols are kept for R8 and the shared
  object supports 16 KiB pages. Existing application NDK settings are inherited.
  CMake staging lives in `.expo/native-remux/android-cmake`, outside TypeScript's
  module source globs (CMake generates dependency files ending in `.ts`).
- Apple: `withDownloadRemuxer` adds a source pod declaration for
  `StreamyfinLibwebm.podspec`; `BackgroundDownloader` depends on it. CocoaPods
  downloads/builds the same pinned source for iOS/tvOS. Register the config plugin
  in the Expo app's plugin list before prebuilding.
- The small `default-track.patch` adds libwebm's missing `FlagDefault` setter and
  serialization. Both builds apply the same patch. It is not a custom container
  writer. Upstream BSD license/PATENTS files remain with the downloaded source;
  CocoaPods includes the license in application acknowledgements; Android bundles
  the upstream license and patent grant in `assets/licenses/libwebm.txt`.
- First builds require Git/network access. Generated dependency sources and
  binaries live under ignored build directories, not source control.

## Actual-media tests

```sh
STREAMYFIN_NATIVE_MEDIA_TESTS=1 bun test \
  modules/background-downloader/native-tests/media.test.ts
```

Requires `ffmpeg`, `ffprobe`, CMake (`CMAKE` can override its path) and a C++
compiler. Apple-reader tests also require macOS/Xcode. They are opt-in so ordinary
Bun/CI unit tests do not download native tools or require a platform SDK.
Fixtures, CMake dependencies and binaries use `.expo/native-remux/media-tests`,
an existing ignored cache location outside the TypeScript source globs.

Tests generate four-second Baseline/AAC inputs with distinct frequencies, a
delayed audio track, mixed mono/stereo tracks and mixed 48/44.1 kHz audio. They check all compressed packet
SHA-256 hashes, common-timeline offsets, duration, Unicode metadata, default
flags, cues, seeking and decodability. They exercise the portable C++ writer,
Android Annex-B normalization, and the actual Apple reader through its Swift
entry point. Cancellation, unsupported media, truncation, track ambiguity and
existing-output safety are covered.

The Android reader/JNI also needs device/emulator smoke testing; host media tests
cannot execute the framework `MediaExtractor`. App background scheduling and
atomic publication belong to the separate lifecycle tests.
