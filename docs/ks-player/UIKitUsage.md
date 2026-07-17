# UIKit Usage

This guide covers using KSPlayer with UIKit in iOS applications.

## IOSVideoPlayerView

`IOSVideoPlayerView` is the main UIKit video player view for iOS. It extends `VideoPlayerView` with iOS-specific features like fullscreen, gestures, and AirPlay.

### Basic Setup

```swift
import KSPlayer

class VideoViewController: UIViewController {
    private var playerView: IOSVideoPlayerView!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        playerView = IOSVideoPlayerView()
        view.addSubview(playerView)
        
        playerView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            playerView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            playerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            playerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            playerView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }
}
```

### Setting Video URL

#### Simple URL

```swift
let url = URL(string: "https://example.com/video.mp4")!
playerView.set(url: url, options: KSOptions())
```

#### With KSPlayerResource

```swift
let resource = KSPlayerResource(
    url: URL(string: "https://example.com/video.mp4")!,
    options: KSOptions(),
    name: "Video Title",
    cover: URL(string: "https://example.com/cover.jpg"),
    subtitleURLs: [URL(string: "https://example.com/subtitle.srt")!]
)
playerView.set(resource: resource)
```

#### Multiple Definitions (Quality Options)

```swift
let hdDefinition = KSPlayerResourceDefinition(
    url: URL(string: "https://example.com/video_hd.mp4")!,
    definition: "1080p",
    options: KSOptions()
)

let sdDefinition = KSPlayerResourceDefinition(
    url: URL(string: "https://example.com/video_sd.mp4")!,
    definition: "480p",
    options: KSOptions()
)

let resource = KSPlayerResource(
    name: "Video Title",
    definitions: [hdDefinition, sdDefinition],
    cover: URL(string: "https://example.com/cover.jpg")
)

playerView.set(resource: resource, definitionIndex: 0)
```

### KSPlayerResource

```swift
public class KSPlayerResource {
    public let name: String
    public let definitions: [KSPlayerResourceDefinition]
    public let cover: URL?
    public let subtitleDataSouce: SubtitleDataSouce?
    public var nowPlayingInfo: KSNowPlayableMetadata?
    
    // Convenience initializer for single URL
    public convenience init(
        url: URL,
        options: KSOptions = KSOptions(),
        name: String = "",
        cover: URL? = nil,
        subtitleURLs: [URL]? = nil
    )
    
    // Full initializer
    public init(
        name: String,
        definitions: [KSPlayerResourceDefinition],
        cover: URL? = nil,
        subtitleDataSouce: SubtitleDataSouce? = nil
    )
}
```

### KSPlayerResourceDefinition

```swift
public struct KSPlayerResourceDefinition {
    public let url: URL
    public let definition: String
    public let options: KSOptions
    
    public init(url: URL, definition: String, options: KSOptions = KSOptions())
}
```

### PlayerControllerDelegate

Implement `PlayerControllerDelegate` to receive playback events:

```swift
class VideoViewController: UIViewController, PlayerControllerDelegate {
    override func viewDidLoad() {
        super.viewDidLoad()
        playerView.delegate = self
    }
    
    func playerController(state: KSPlayerState) {
        switch state {
        case .initialized:
            print("Player initialized")
        case .preparing:
            print("Preparing to play")
        case .readyToPlay:
            print("Ready to play")
        case .buffering:
            print("Buffering...")
        case .bufferFinished:
            print("Buffer finished, playing")
        case .paused:
            print("Paused")
        case .playedToTheEnd:
            print("Playback completed")
        case .error:
            print("Error occurred")
        }
    }
    
    func playerController(currentTime: TimeInterval, totalTime: TimeInterval) {
        // Called periodically during playback
        print("Progress: \(currentTime)/\(totalTime)")
    }
    
    func playerController(finish error: Error?) {
        if let error = error {
            print("Playback error: \(error)")
        } else {
            print("Playback finished")
        }
    }
    
    func playerController(maskShow: Bool) {
        // Controls visibility changed
    }
    
    func playerController(action: PlayerButtonType) {
        // Button pressed
    }
    
    func playerController(bufferedCount: Int, consumeTime: TimeInterval) {
        // Buffer status update (bufferedCount: 0 = first load)
    }
    
    func playerController(seek: TimeInterval) {
        // Seek completed
    }
}
```

### Playback Control

```swift
// Play
playerView.play()

// Pause
playerView.pause()

// Seek to time
playerView.seek(time: 30.0) { finished in
    print("Seek completed: \(finished)")
}

// Reset player
playerView.resetPlayer()
```

### Time Callbacks

```swift
// Listen to time changes
playerView.playTimeDidChange = { currentTime, totalTime in
    print("Current: \(currentTime), Total: \(totalTime)")
}

// Back button handler
playerView.backBlock = { [weak self] in
    self?.navigationController?.popViewController(animated: true)
}
```

### Fullscreen Control

```swift
// Check if in fullscreen
let isFullscreen = playerView.landscapeButton.isSelected

// Toggle fullscreen
playerView.updateUI(isFullScreen: true)  // Enter fullscreen
playerView.updateUI(isFullScreen: false) // Exit fullscreen
```

### Customizing IOSVideoPlayerView

Subclass to customize behavior:

```swift
class CustomVideoPlayerView: IOSVideoPlayerView {
    override func customizeUIComponents() {
        super.customizeUIComponents()
        
        // Hide playback rate button
        toolBar.playbackRateButton.isHidden = true
    }
    
    override func onButtonPressed(type: PlayerButtonType, button: UIButton) {
        if type == .landscape {
            // Custom landscape button behavior
        } else {
            super.onButtonPressed(type: type, button: button)
        }
    }
    
    override func updateUI(isLandscape: Bool) {
        super.updateUI(isLandscape: isLandscape)
        // Additional UI updates for orientation
    }
}
```

## VideoPlayerView (Base Class)

`VideoPlayerView` is the base class with playback controls. `IOSVideoPlayerView` extends it for iOS.

### Key Properties

```swift
public var playerLayer: KSPlayerLayer?
public weak var delegate: PlayerControllerDelegate?
public let toolBar: PlayerToolBar
public let srtControl: SubtitleModel
public var playTimeDidChange: ((TimeInterval, TimeInterval) -> Void)?
public var backBlock: (() -> Void)?
```

### Accessing Player Layer

```swift
// Get the underlying player
if let player = playerView.playerLayer?.player {
    // Access player properties
    let duration = player.duration
    let currentTime = player.currentPlaybackTime
    let isPlaying = player.isPlaying
}
```

## IOSVideoPlayerView Properties

```swift
// UI Components
public var backButton: UIButton
public var maskImageView: UIImageView           // Cover image
public var airplayStatusView: UIView            // AirPlay status indicator
public var routeButton: AVRoutePickerView       // AirPlay route picker
public var landscapeButton: UIControl           // Fullscreen toggle
public var volumeViewSlider: UXSlider           // Volume control

// State
public var isMaskShow: Bool                     // Controls visibility
```

## PlayerButtonType

Button types for `onButtonPressed`:

```swift
public enum PlayerButtonType: Int {
    case play = 101
    case pause
    case back
    case srt             // Subtitle selection
    case landscape       // Fullscreen toggle
    case replay
    case lock            // Lock controls
    case rate            // Playback rate
    case definition      // Quality selection
    case pictureInPicture
    case audioSwitch     // Audio track
    case videoSwitch     // Video track
}
```

## Document Picker Integration

`IOSVideoPlayerView` supports opening files via document picker:

```swift
extension IOSVideoPlayerView: UIDocumentPickerDelegate {
    public func documentPicker(_ controller: UIDocumentPickerViewController, 
                               didPickDocumentsAt urls: [URL]) {
        if let url = urls.first {
            if url.isMovie || url.isAudio {
                set(url: url, options: KSOptions())
            } else {
                // Assume subtitle file
                srtControl.selectedSubtitleInfo = URLSubtitleInfo(url: url)
            }
        }
    }
}
```

