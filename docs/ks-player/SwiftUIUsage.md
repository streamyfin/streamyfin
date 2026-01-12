# SwiftUI Usage

KSPlayer provides full SwiftUI support with `KSVideoPlayer` (a UIViewRepresentable) and `KSVideoPlayerView` (a complete player view with controls).

**Minimum Requirements:** iOS 16.0, macOS 13.0, tvOS 16.0

## KSVideoPlayerView

`KSVideoPlayerView` is a complete video player with built-in controls, subtitle display, and settings.

### Basic Usage

```swift
import KSPlayer
import SwiftUI

struct VideoScreen: View {
    let url = URL(string: "https://example.com/video.mp4")!
    
    var body: some View {
        KSVideoPlayerView(url: url, options: KSOptions())
    }
}
```

### With Custom Title

```swift
KSVideoPlayerView(
    url: url,
    options: KSOptions(),
    title: "My Video Title"
)
```

### With Coordinator and Subtitle Data Source

```swift
struct VideoScreen: View {
    @StateObject private var coordinator = KSVideoPlayer.Coordinator()
    let url: URL
    let subtitleDataSource: SubtitleDataSouce?
    
    var body: some View {
        KSVideoPlayerView(
            coordinator: coordinator,
            url: url,
            options: KSOptions(),
            title: "Video Title",
            subtitleDataSouce: subtitleDataSource
        )
    }
}
```

## KSVideoPlayer

`KSVideoPlayer` is the lower-level UIViewRepresentable that provides the video rendering surface. Use this when you want full control over the UI.

### Basic Usage

```swift
import KSPlayer
import SwiftUI

struct CustomPlayerView: View {
    @StateObject private var coordinator = KSVideoPlayer.Coordinator()
    let url: URL
    let options: KSOptions
    
    var body: some View {
        KSVideoPlayer(coordinator: coordinator, url: url, options: options)
            .onStateChanged { layer, state in
                print("State changed: \(state)")
            }
            .onPlay { currentTime, totalTime in
                print("Playing: \(currentTime)/\(totalTime)")
            }
            .onFinish { layer, error in
                if let error = error {
                    print("Error: \(error)")
                }
            }
    }
}
```

### Initializer

```swift
public struct KSVideoPlayer {
    public init(
        coordinator: Coordinator,
        url: URL,
        options: KSOptions
    )
}
```

## KSVideoPlayer.Coordinator

The Coordinator manages player state and provides bindings for SwiftUI views.

### Creating a Coordinator

```swift
@StateObject private var coordinator = KSVideoPlayer.Coordinator()
```

### Published Properties

```swift
@MainActor
public final class Coordinator: ObservableObject {
    // Playback state (read-only computed property)
    public var state: KSPlayerState { get }
    
    // Mute control
    @Published public var isMuted: Bool = false
    
    // Volume (0.0 to 1.0)
    @Published public var playbackVolume: Float = 1.0
    
    // Content mode toggle
    @Published public var isScaleAspectFill: Bool = false
    
    // Playback rate (1.0 = normal)
    @Published public var playbackRate: Float = 1.0
    
    // Controls visibility
    @Published public var isMaskShow: Bool = true
    
    // Subtitle model
    public var subtitleModel: SubtitleModel
    
    // Time model for progress display
    public var timemodel: ControllerTimeModel
    
    // The underlying player layer
    public var playerLayer: KSPlayerLayer?
}
```

### Coordinator Methods

```swift
// Skip forward/backward by seconds
public func skip(interval: Int)

// Seek to specific time
public func seek(time: TimeInterval)

// Show/hide controls with optional auto-hide
public func mask(show: Bool, autoHide: Bool = true)

// Reset player state (called automatically on view dismissal)
public func resetPlayer()
```

### Using Coordinator for Playback Control

```swift
struct PlayerView: View {
    @StateObject private var coordinator = KSVideoPlayer.Coordinator()
    let url: URL
    
    var body: some View {
        VStack {
            KSVideoPlayer(coordinator: coordinator, url: url, options: KSOptions())
            
            HStack {
                Button("Play") {
                    coordinator.playerLayer?.play()
                }
                
                Button("Pause") {
                    coordinator.playerLayer?.pause()
                }
                
                Button("-15s") {
                    coordinator.skip(interval: -15)
                }
                
                Button("+15s") {
                    coordinator.skip(interval: 15)
                }
            }
            
            Slider(value: $coordinator.playbackVolume, in: 0...1)
            
            Toggle("Mute", isOn: $coordinator.isMuted)
        }
    }
}
```

## View Modifiers

### onStateChanged

Called when playback state changes:

```swift
KSVideoPlayer(coordinator: coordinator, url: url, options: options)
    .onStateChanged { layer, state in
        switch state {
        case .initialized: break
        case .preparing: break
        case .readyToPlay:
            // Access metadata
            if let title = layer.player.dynamicInfo?.metadata["title"] {
                print("Title: \(title)")
            }
        case .buffering: break
        case .bufferFinished: break
        case .paused: break
        case .playedToTheEnd: break
        case .error: break
        }
    }
```

### onPlay

Called periodically during playback with current and total time:

```swift
.onPlay { currentTime, totalTime in
    let progress = currentTime / totalTime
    print("Progress: \(Int(progress * 100))%")
}
```

### onFinish

Called when playback ends (naturally or with error):

```swift
.onFinish { layer, error in
    if let error = error {
        print("Playback failed: \(error.localizedDescription)")
    } else {
        print("Playback completed")
    }
}
```

### onBufferChanged

Called when buffering status changes:

```swift
.onBufferChanged { bufferedCount, consumeTime in
    // bufferedCount: 0 = initial loading
    print("Buffer count: \(bufferedCount), time: \(consumeTime)")
}
```

### onSwipe (iOS only)

Called on swipe gestures:

```swift
#if canImport(UIKit)
.onSwipe { direction in
    switch direction {
    case .up: print("Swipe up")
    case .down: print("Swipe down")
    case .left: print("Swipe left")
    case .right: print("Swipe right")
    default: break
    }
}
#endif
```

## ControllerTimeModel

Used for displaying playback time:

```swift
public class ControllerTimeModel: ObservableObject {
    @Published public var currentTime: Int = 0
    @Published public var totalTime: Int = 1
}
```

Usage:

```swift
struct TimeDisplay: View {
    @ObservedObject var timeModel: ControllerTimeModel
    
    var body: some View {
        Text("\(timeModel.currentTime) / \(timeModel.totalTime)")
    }
}

// In your player view:
TimeDisplay(timeModel: coordinator.timemodel)
```

## Subtitle Integration

Access subtitles through the coordinator:

```swift
struct SubtitlePicker: View {
    @ObservedObject var subtitleModel: SubtitleModel
    
    var body: some View {
        Picker("Subtitle", selection: $subtitleModel.selectedSubtitleInfo) {
            Text("Off").tag(nil as (any SubtitleInfo)?)
            ForEach(subtitleModel.subtitleInfos, id: \.subtitleID) { info in
                Text(info.name).tag(info as (any SubtitleInfo)?)
            }
        }
    }
}

// Usage:
SubtitlePicker(subtitleModel: coordinator.subtitleModel)
```

## Complete Example

```swift
import KSPlayer
import SwiftUI

@available(iOS 16.0, *)
struct FullPlayerView: View {
    @StateObject private var coordinator = KSVideoPlayer.Coordinator()
    @State private var url: URL
    @State private var title: String
    @Environment(\.dismiss) private var dismiss
    
    init(url: URL, title: String) {
        _url = State(initialValue: url)
        _title = State(initialValue: title)
    }
    
    var body: some View {
        ZStack {
            KSVideoPlayer(coordinator: coordinator, url: url, options: KSOptions())
                .onStateChanged { layer, state in
                    if state == .readyToPlay {
                        if let movieTitle = layer.player.dynamicInfo?.metadata["title"] {
                            title = movieTitle
                        }
                    }
                }
                .onFinish { _, error in
                    if error != nil {
                        dismiss()
                    }
                }
                .ignoresSafeArea()
                .onTapGesture {
                    coordinator.isMaskShow.toggle()
                }
            
            // Custom controls overlay
            if coordinator.isMaskShow {
                VStack {
                    HStack {
                        Button("Back") { dismiss() }
                        Spacer()
                        Text(title)
                    }
                    .padding()
                    
                    Spacer()
                    
                    HStack(spacing: 40) {
                        Button(action: { coordinator.skip(interval: -15) }) {
                            Image(systemName: "gobackward.15")
                        }
                        
                        Button(action: {
                            if coordinator.state.isPlaying {
                                coordinator.playerLayer?.pause()
                            } else {
                                coordinator.playerLayer?.play()
                            }
                        }) {
                            Image(systemName: coordinator.state.isPlaying ? "pause.fill" : "play.fill")
                        }
                        
                        Button(action: { coordinator.skip(interval: 15) }) {
                            Image(systemName: "goforward.15")
                        }
                    }
                    .font(.largeTitle)
                    
                    Spacer()
                }
                .foregroundColor(.white)
            }
        }
        .preferredColorScheme(.dark)
    }
}
```

## URL Change Handling

The player automatically detects URL changes:

```swift
struct DynamicPlayerView: View {
    @StateObject private var coordinator = KSVideoPlayer.Coordinator()
    @State private var currentURL: URL
    
    var body: some View {
        VStack {
            KSVideoPlayer(coordinator: coordinator, url: currentURL, options: KSOptions())
            
            Button("Load Next Video") {
                currentURL = URL(string: "https://example.com/next-video.mp4")!
            }
        }
    }
}
```

