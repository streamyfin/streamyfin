# KSOptions

`KSOptions` is the configuration class for KSPlayer. It contains both instance properties (per-player settings) and static properties (global defaults).

## Creating Options

```swift
let options = KSOptions()

// Configure instance properties
options.isLoopPlay = true
options.startPlayTime = 30.0  // Start at 30 seconds

// Use with player
playerView.set(url: url, options: options)
```

## Instance Properties

### Buffering

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `preferredForwardBufferDuration` | `TimeInterval` | `3.0` | Minimum buffer duration before playback starts |
| `maxBufferDuration` | `TimeInterval` | `30.0` | Maximum buffer duration |
| `isSecondOpen` | `Bool` | `false` | Enable fast open (instant playback) |

### Seeking

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `isAccurateSeek` | `Bool` | `false` | Enable frame-accurate seeking |
| `seekFlags` | `Int32` | `1` | FFmpeg seek flags (AVSEEK_FLAG_BACKWARD) |
| `isSeekedAutoPlay` | `Bool` | `true` | Auto-play after seeking |

### Playback

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `isLoopPlay` | `Bool` | `false` | Loop playback (for short videos) |
| `startPlayTime` | `TimeInterval` | `0` | Initial playback position (seconds) |
| `startPlayRate` | `Float` | `1.0` | Initial playback rate |
| `registerRemoteControll` | `Bool` | `true` | Enable system remote control |

### Video

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `display` | `DisplayEnum` | `.plane` | Display mode (`.plane`, `.vr`, `.vrBox`) |
| `videoDelay` | `Double` | `0.0` | Video delay in seconds |
| `autoDeInterlace` | `Bool` | `false` | Auto-detect interlacing |
| `autoRotate` | `Bool` | `true` | Auto-rotate based on metadata |
| `destinationDynamicRange` | `DynamicRange?` | `nil` | Target HDR mode |
| `videoAdaptable` | `Bool` | `true` | Enable adaptive bitrate |
| `videoFilters` | `[String]` | `[]` | FFmpeg video filters |
| `syncDecodeVideo` | `Bool` | `false` | Synchronous video decoding |
| `hardwareDecode` | `Bool` | `true` | Use hardware decoding |
| `asynchronousDecompression` | `Bool` | `false` | Async hardware decompression |
| `videoDisable` | `Bool` | `false` | Disable video track |

### Audio

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `audioFilters` | `[String]` | `[]` | FFmpeg audio filters |
| `syncDecodeAudio` | `Bool` | `false` | Synchronous audio decoding |

### Subtitles

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `autoSelectEmbedSubtitle` | `Bool` | `true` | Auto-select embedded subtitles |
| `isSeekImageSubtitle` | `Bool` | `false` | Seek for image subtitles |

### Picture-in-Picture

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `canStartPictureInPictureAutomaticallyFromInline` | `Bool` | `true` | Auto-start PiP when app backgrounds |

### Window (macOS)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `automaticWindowResize` | `Bool` | `true` | Auto-resize window to video aspect ratio |

### Network/HTTP

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `referer` | `String?` | `nil` | HTTP referer header |
| `userAgent` | `String?` | `"KSPlayer"` | HTTP user agent |
| `cache` | `Bool` | `false` | Enable FFmpeg HTTP caching |
| `outputURL` | `URL?` | `nil` | URL to record/save stream |

### FFmpeg Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `avOptions` | `[String: Any]` | `[:]` | AVURLAsset options |
| `formatContextOptions` | `[String: Any]` | See below | FFmpeg format context options |
| `decoderOptions` | `[String: Any]` | See below | FFmpeg decoder options |
| `probesize` | `Int64?` | `nil` | FFmpeg probe size |
| `maxAnalyzeDuration` | `Int64?` | `nil` | Max analyze duration |
| `lowres` | `UInt8` | `0` | Low resolution decoding |
| `nobuffer` | `Bool` | `false` | Disable buffering |
| `codecLowDelay` | `Bool` | `false` | Low delay codec mode |

#### Default formatContextOptions

```swift
[
    "user_agent": "KSPlayer",
    "scan_all_pmts": 1,
    "reconnect": 1,
    "reconnect_streamed": 1
]
```

#### Default decoderOptions

```swift
[
    "threads": "auto",
    "refcounted_frames": "1"
]
```

### Read-Only Timing Properties

| Property | Type | Description |
|----------|------|-------------|
| `formatName` | `String` | Detected format name |
| `prepareTime` | `Double` | Time when prepare started |
| `dnsStartTime` | `Double` | DNS lookup start time |
| `tcpStartTime` | `Double` | TCP connection start time |
| `tcpConnectedTime` | `Double` | TCP connected time |
| `openTime` | `Double` | File open time |
| `findTime` | `Double` | Stream find time |
| `readyTime` | `Double` | Ready to play time |
| `readAudioTime` | `Double` | First audio read time |
| `readVideoTime` | `Double` | First video read time |
| `decodeAudioTime` | `Double` | First audio decode time |
| `decodeVideoTime` | `Double` | First video decode time |

## Static Properties (Global Defaults)

### Player Types

```swift
// Primary player type (default: AVPlayer)
KSOptions.firstPlayerType: MediaPlayerProtocol.Type = KSAVPlayer.self

// Fallback player type (default: FFmpeg)
KSOptions.secondPlayerType: MediaPlayerProtocol.Type? = KSMEPlayer.self
```

### Buffering Defaults

```swift
KSOptions.preferredForwardBufferDuration: TimeInterval = 3.0
KSOptions.maxBufferDuration: TimeInterval = 30.0
KSOptions.isSecondOpen: Bool = false
```

### Playback Defaults

```swift
KSOptions.isAccurateSeek: Bool = false
KSOptions.isLoopPlay: Bool = false
KSOptions.isAutoPlay: Bool = true
KSOptions.isSeekedAutoPlay: Bool = true
```

### Decoding

```swift
KSOptions.hardwareDecode: Bool = true
KSOptions.asynchronousDecompression: Bool = false
KSOptions.canStartPictureInPictureAutomaticallyFromInline: Bool = true
```

### UI Options

```swift
// Top bar visibility: .always, .horizantalOnly, .none
KSOptions.topBarShowInCase: KSPlayerTopBarShowCase = .always

// Auto-hide controls delay
KSOptions.animateDelayTimeInterval: TimeInterval = 5.0

// Gesture controls
KSOptions.enableBrightnessGestures: Bool = true
KSOptions.enableVolumeGestures: Bool = true
KSOptions.enablePlaytimeGestures: Bool = true

// Background playback
KSOptions.canBackgroundPlay: Bool = false
```

### PiP

```swift
KSOptions.isPipPopViewController: Bool = false
```

### Logging

```swift
// Log levels: .panic, .fatal, .error, .warning, .info, .verbose, .debug, .trace
KSOptions.logLevel: LogLevel = .warning
KSOptions.logger: LogHandler = OSLog(lable: "KSPlayer")
```

### System

```swift
KSOptions.useSystemHTTPProxy: Bool = true
KSOptions.preferredFrame: Bool = true
```

### Subtitle Data Sources

```swift
KSOptions.subtitleDataSouces: [SubtitleDataSouce] = [DirectorySubtitleDataSouce()]
```

## Methods

### HTTP Headers

```swift
let options = KSOptions()
options.appendHeader(["Referer": "https://example.com"])
options.appendHeader(["Authorization": "Bearer token123"])
```

### Cookies

```swift
let cookies = [HTTPCookie(properties: [
    .name: "session",
    .value: "abc123",
    .domain: "example.com",
    .path: "/"
])!]
options.setCookie(cookies)
```

## Overridable Methods

Subclass `KSOptions` to customize behavior:

### Buffering Algorithm

```swift
class CustomOptions: KSOptions {
    override func playable(capacitys: [CapacityProtocol], isFirst: Bool, isSeek: Bool) -> LoadingState {
        // Custom buffering logic
        super.playable(capacitys: capacitys, isFirst: isFirst, isSeek: isSeek)
    }
}
```

### Adaptive Bitrate

```swift
override func adaptable(state: VideoAdaptationState?) -> (Int64, Int64)? {
    // Return (currentBitrate, targetBitrate) or nil
    super.adaptable(state: state)
}
```

### Track Selection

```swift
// Select preferred video track
override func wantedVideo(tracks: [MediaPlayerTrack]) -> Int? {
    // Return index of preferred track or nil for auto
    return tracks.firstIndex { $0.bitRate > 5_000_000 }
}

// Select preferred audio track  
override func wantedAudio(tracks: [MediaPlayerTrack]) -> Int? {
    // Return index of preferred track or nil for auto
    return tracks.firstIndex { $0.languageCode == "en" }
}
```

### Display Layer

```swift
override func isUseDisplayLayer() -> Bool {
    // Return true to use AVSampleBufferDisplayLayer (supports HDR10+)
    // Return false for other display modes
    display == .plane
}
```

### Track Processing

```swift
override func process(assetTrack: some MediaPlayerTrack) {
    super.process(assetTrack: assetTrack)
    // Custom processing before decoder creation
}
```

### Live Playback Rate

```swift
override func liveAdaptivePlaybackRate(loadingState: LoadingState) -> Float? {
    // Return adjusted playback rate for live streams
    // Return nil to keep current rate
    if loadingState.loadedTime > preferredForwardBufferDuration + 5 {
        return 1.2  // Speed up if too far behind
    }
    return nil
}
```

## Example: Custom Options

```swift
class StreamingOptions: KSOptions {
    override init() {
        super.init()
        
        // Low latency settings
        preferredForwardBufferDuration = 1.0
        isSecondOpen = true
        nobuffer = true
        codecLowDelay = true
        
        // Custom headers
        appendHeader(["X-Custom-Header": "value"])
    }
    
    override func wantedAudio(tracks: [MediaPlayerTrack]) -> Int? {
        // Prefer English audio
        return tracks.firstIndex { $0.languageCode == "en" }
    }
}

// Usage
let options = StreamingOptions()
playerView.set(url: streamURL, options: options)
```

