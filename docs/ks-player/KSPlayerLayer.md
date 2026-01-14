# KSPlayerLayer

`KSPlayerLayer` is the core playback controller that manages the media player instance and provides a high-level API for playback control.

## Overview

`KSPlayerLayer` wraps `MediaPlayerProtocol` implementations (`KSAVPlayer` or `KSMEPlayer`) and handles:
- Player lifecycle management
- Playback state transitions
- Remote control integration
- Picture-in-Picture support
- Background/foreground handling

## Creating a KSPlayerLayer

### Basic Initialization

```swift
let url = URL(string: "https://example.com/video.mp4")!
let options = KSOptions()

let playerLayer = KSPlayerLayer(
    url: url,
    isAutoPlay: true,       // Default: KSOptions.isAutoPlay
    options: options,
    delegate: self
)
```

### Constructor Parameters

```swift
public init(
    url: URL,
    isAutoPlay: Bool = KSOptions.isAutoPlay,
    options: KSOptions,
    delegate: KSPlayerLayerDelegate? = nil
)
```

## Properties

### Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `url` | `URL` | Current media URL (read-only after init) |
| `options` | `KSOptions` | Player configuration (read-only) |
| `player` | `MediaPlayerProtocol` | Underlying player instance |
| `state` | `KSPlayerState` | Current playback state (read-only) |
| `delegate` | `KSPlayerLayerDelegate?` | Event delegate |

### Published Properties (for Combine/SwiftUI)

```swift
@Published public var bufferingProgress: Int = 0     // 0-100
@Published public var loopCount: Int = 0             // Loop iteration count
@Published public var isPipActive: Bool = false      // Picture-in-Picture state
```

## Playback Control Methods

### play()

Start or resume playback:

```swift
playerLayer.play()
```

### pause()

Pause playback:

```swift
playerLayer.pause()
```

### stop()

Stop playback and reset player state:

```swift
playerLayer.stop()
```

### seek(time:autoPlay:completion:)

Seek to a specific time:

```swift
playerLayer.seek(time: 30.0, autoPlay: true) { finished in
    if finished {
        print("Seek completed")
    }
}
```

Parameters:
- `time: TimeInterval` - Target time in seconds
- `autoPlay: Bool` - Whether to auto-play after seeking
- `completion: @escaping ((Bool) -> Void)` - Called when seek completes

### prepareToPlay()

Prepare the player (called automatically when `isAutoPlay` is true):

```swift
playerLayer.prepareToPlay()
```

## URL Management

### set(url:options:)

Change the video URL:

```swift
let newURL = URL(string: "https://example.com/another-video.mp4")!
playerLayer.set(url: newURL, options: KSOptions())
```

### set(urls:options:)

Set a playlist of URLs:

```swift
let urls = [
    URL(string: "https://example.com/video1.mp4")!,
    URL(string: "https://example.com/video2.mp4")!,
    URL(string: "https://example.com/video3.mp4")!
]
playerLayer.set(urls: urls, options: KSOptions())
```

The player automatically advances to the next URL when playback finishes.

## Accessing the Player

### Player Properties

Access underlying player properties through `playerLayer.player`:

```swift
// Duration
let duration = playerLayer.player.duration

// Current time
let currentTime = playerLayer.player.currentPlaybackTime

// Playing state
let isPlaying = playerLayer.player.isPlaying

// Seekable
let canSeek = playerLayer.player.seekable

// Natural size
let videoSize = playerLayer.player.naturalSize

// File size (estimated)
let fileSize = playerLayer.player.fileSize
```

### Player Control

```swift
// Volume (0.0 to 1.0)
playerLayer.player.playbackVolume = 0.5

// Mute
playerLayer.player.isMuted = true

// Playback rate
playerLayer.player.playbackRate = 1.5

// Content mode
playerLayer.player.contentMode = .scaleAspectFit
```

### Tracks

```swift
// Get audio tracks
let audioTracks = playerLayer.player.tracks(mediaType: .audio)

// Get video tracks
let videoTracks = playerLayer.player.tracks(mediaType: .video)

// Select a track
if let englishTrack = audioTracks.first(where: { $0.languageCode == "en" }) {
    playerLayer.player.select(track: englishTrack)
}
```

### External Playback (AirPlay)

```swift
// Enable AirPlay
playerLayer.player.allowsExternalPlayback = true

// Check if actively using AirPlay
let isAirPlaying = playerLayer.player.isExternalPlaybackActive

// Auto-switch to external when screen connected
playerLayer.player.usesExternalPlaybackWhileExternalScreenIsActive = true
```

### Picture-in-Picture

```swift
// Available on tvOS 14.0+, iOS 14.0+
if #available(tvOS 14.0, iOS 14.0, *) {
    // Toggle PiP
    playerLayer.isPipActive.toggle()
    
    // Or access controller directly
    playerLayer.player.pipController?.start(view: playerLayer)
    playerLayer.player.pipController?.stop(restoreUserInterface: true)
}
```

### Dynamic Info

```swift
if let dynamicInfo = playerLayer.player.dynamicInfo {
    print("FPS: \(dynamicInfo.displayFPS)")
    print("A/V Sync: \(dynamicInfo.audioVideoSyncDiff)")
    print("Dropped frames: \(dynamicInfo.droppedVideoFrameCount)")
    print("Audio bitrate: \(dynamicInfo.audioBitrate)")
    print("Video bitrate: \(dynamicInfo.videoBitrate)")
    
    // Metadata
    if let title = dynamicInfo.metadata["title"] {
        print("Title: \(title)")
    }
}
```

### Chapters

```swift
let chapters = playerLayer.player.chapters
for chapter in chapters {
    print("\(chapter.title): \(chapter.start) - \(chapter.end)")
}
```

### Thumbnails

```swift
Task {
    if let thumbnail = await playerLayer.player.thumbnailImageAtCurrentTime() {
        let image = UIImage(cgImage: thumbnail)
        // Use thumbnail
    }
}
```

## KSPlayerLayerDelegate

Implement the delegate to receive events:

```swift
extension MyViewController: KSPlayerLayerDelegate {
    func player(layer: KSPlayerLayer, state: KSPlayerState) {
        switch state {
        case .initialized:
            print("Player initialized")
        case .preparing:
            print("Preparing...")
        case .readyToPlay:
            print("Ready - Duration: \(layer.player.duration)")
        case .buffering:
            print("Buffering...")
        case .bufferFinished:
            print("Playing")
        case .paused:
            print("Paused")
        case .playedToTheEnd:
            print("Finished")
        case .error:
            print("Error occurred")
        }
    }
    
    func player(layer: KSPlayerLayer, currentTime: TimeInterval, totalTime: TimeInterval) {
        let progress = totalTime > 0 ? currentTime / totalTime : 0
        print("Progress: \(Int(progress * 100))%")
    }
    
    func player(layer: KSPlayerLayer, finish error: Error?) {
        if let error = error {
            print("Playback error: \(error.localizedDescription)")
        } else {
            print("Playback completed successfully")
        }
    }
    
    func player(layer: KSPlayerLayer, bufferedCount: Int, consumeTime: TimeInterval) {
        // bufferedCount: 0 = initial load
        // consumeTime: time spent buffering
        print("Buffer #\(bufferedCount), took \(consumeTime)s")
    }
}
```

## Player View Integration

The player's view can be added to your view hierarchy:

```swift
if let playerView = playerLayer.player.view {
    containerView.addSubview(playerView)
    playerView.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
        playerView.topAnchor.constraint(equalTo: containerView.topAnchor),
        playerView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor),
        playerView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor),
        playerView.bottomAnchor.constraint(equalTo: containerView.bottomAnchor),
    ])
}
```

## Remote Control

Remote control is automatically registered when `options.registerRemoteControll` is `true` (default).

### Supported Commands

- Play/Pause
- Stop
- Next/Previous track (for playlists)
- Skip forward/backward (15 seconds)
- Change playback position
- Change playback rate
- Change repeat mode
- Language/audio track selection

### Customizing Remote Control

```swift
// Disable auto-registration
options.registerRemoteControll = false

// Manually register later
playerLayer.registerRemoteControllEvent()
```

### Now Playing Info

```swift
import MediaPlayer

// Set custom Now Playing info
MPNowPlayingInfoCenter.default().nowPlayingInfo = [
    MPMediaItemPropertyTitle: "Video Title",
    MPMediaItemPropertyArtist: "Artist Name",
    MPMediaItemPropertyPlaybackDuration: playerLayer.player.duration
]
```

## Background/Foreground Handling

KSPlayerLayer automatically handles app lifecycle:

- **Background**: Pauses video (unless `KSOptions.canBackgroundPlay` is `true`)
- **Foreground**: Resumes display

```swift
// Enable background playback
KSOptions.canBackgroundPlay = true
```

## Player Type Switching

The player automatically switches from `firstPlayerType` to `secondPlayerType` on failure:

```swift
// Configure player types before creating KSPlayerLayer
KSOptions.firstPlayerType = KSAVPlayer.self
KSOptions.secondPlayerType = KSMEPlayer.self
```

## Complete Example

```swift
class VideoPlayerController: UIViewController, KSPlayerLayerDelegate {
    private var playerLayer: KSPlayerLayer!
    private var containerView: UIView!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        containerView = UIView()
        view.addSubview(containerView)
        containerView.frame = view.bounds
        
        let url = URL(string: "https://example.com/video.mp4")!
        let options = KSOptions()
        options.isLoopPlay = true
        
        playerLayer = KSPlayerLayer(
            url: url,
            options: options,
            delegate: self
        )
        
        if let playerView = playerLayer.player.view {
            containerView.addSubview(playerView)
            playerView.frame = containerView.bounds
            playerView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        }
    }
    
    // MARK: - KSPlayerLayerDelegate
    
    func player(layer: KSPlayerLayer, state: KSPlayerState) {
        print("State: \(state)")
    }
    
    func player(layer: KSPlayerLayer, currentTime: TimeInterval, totalTime: TimeInterval) {
        // Update progress UI
    }
    
    func player(layer: KSPlayerLayer, finish error: Error?) {
        if let error = error {
            showError(error)
        }
    }
    
    func player(layer: KSPlayerLayer, bufferedCount: Int, consumeTime: TimeInterval) {
        if bufferedCount == 0 {
            print("Initial load took \(consumeTime)s")
        }
    }
    
    deinit {
        playerLayer.stop()
    }
}
```

