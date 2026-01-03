# Subtitle Support

KSPlayer provides comprehensive subtitle support including embedded subtitles, external subtitle files, and online subtitle search.

## SubtitleModel

`SubtitleModel` manages subtitle sources, selection, and rendering.

### Properties

```swift
open class SubtitleModel: ObservableObject {
    // Available subtitle sources
    @Published public private(set) var subtitleInfos: [any SubtitleInfo]
    
    // Current subtitle parts being displayed
    @Published public private(set) var parts: [SubtitlePart]
    
    // Global subtitle delay (seconds)
    public var subtitleDelay: Double = 0.0
    
    // Current media URL
    public var url: URL?
    
    // Selected subtitle
    @Published public var selectedSubtitleInfo: (any SubtitleInfo)?
}
```

### Static Styling Properties

```swift
SubtitleModel.textColor: Color = .white
SubtitleModel.textBackgroundColor: Color = .clear
SubtitleModel.textFontSize: CGFloat = SubtitleModel.Size.standard.rawValue
SubtitleModel.textBold: Bool = false
SubtitleModel.textItalic: Bool = false
SubtitleModel.textPosition: TextPosition = TextPosition()
```

### Font Sizes

```swift
public enum Size {
    case smaller   // 12pt (iPhone), 20pt (iPad/Mac), 48pt (TV)
    case standard  // 16pt (iPhone), 26pt (iPad/Mac), 58pt (TV)
    case large     // 20pt (iPhone), 32pt (iPad/Mac), 68pt (TV)
}
```

### Methods

```swift
// Add subtitle source
public func addSubtitle(info: any SubtitleInfo)

// Add subtitle data source
public func addSubtitle(dataSouce: SubtitleDataSouce)

// Search for subtitles online
public func searchSubtitle(query: String?, languages: [String])

// Get subtitle for current time (called internally)
public func subtitle(currentTime: TimeInterval) -> Bool
```

## SubtitleInfo Protocol

Protocol for subtitle track information:

```swift
public protocol SubtitleInfo: KSSubtitleProtocol, AnyObject, Hashable, Identifiable {
    var subtitleID: String { get }
    var name: String { get }
    var delay: TimeInterval { get set }
    var isEnabled: Bool { get set }
}
```

### KSSubtitleProtocol

```swift
public protocol KSSubtitleProtocol {
    func search(for time: TimeInterval) -> [SubtitlePart]
}
```

## URLSubtitleInfo

Subtitle from a URL:

```swift
public class URLSubtitleInfo: KSSubtitle, SubtitleInfo {
    public private(set) var downloadURL: URL
    public var delay: TimeInterval = 0
    public private(set) var name: String
    public let subtitleID: String
    public var comment: String?
    public var isEnabled: Bool
    
    // Simple initializer
    public convenience init(url: URL)
    
    // Full initializer
    public init(
        subtitleID: String,
        name: String,
        url: URL,
        userAgent: String? = nil
    )
}
```

### Example: Loading External Subtitle

```swift
let subtitleURL = URL(string: "https://example.com/subtitle.srt")!
let subtitleInfo = URLSubtitleInfo(url: subtitleURL)

// Add to subtitle model
subtitleModel.addSubtitle(info: subtitleInfo)

// Or select directly
subtitleModel.selectedSubtitleInfo = subtitleInfo
```

## SubtitlePart

A single subtitle cue:

```swift
public class SubtitlePart: CustomStringConvertible, Identifiable {
    public var start: TimeInterval
    public var end: TimeInterval
    public var origin: CGPoint = .zero
    public let text: NSAttributedString?
    public var image: UIImage?          // For image-based subtitles (e.g., SUP)
    public var textPosition: TextPosition?
    
    public convenience init(_ start: TimeInterval, _ end: TimeInterval, _ string: String)
    public init(_ start: TimeInterval, _ end: TimeInterval, attributedString: NSAttributedString?)
}
```

## SubtitleDataSouce Protocol

Protocol for subtitle sources:

```swift
public protocol SubtitleDataSouce: AnyObject {
    var infos: [any SubtitleInfo] { get }
}
```

### FileURLSubtitleDataSouce

For file-based subtitle sources:

```swift
public protocol FileURLSubtitleDataSouce: SubtitleDataSouce {
    func searchSubtitle(fileURL: URL?) async throws
}
```

### SearchSubtitleDataSouce

For online subtitle search:

```swift
public protocol SearchSubtitleDataSouce: SubtitleDataSouce {
    func searchSubtitle(query: String?, languages: [String]) async throws
}
```

### CacheSubtitleDataSouce

For cached subtitles:

```swift
public protocol CacheSubtitleDataSouce: FileURLSubtitleDataSouce {
    func addCache(fileURL: URL, downloadURL: URL)
}
```

## Built-in Data Sources

### URLSubtitleDataSouce

Simple URL-based subtitle source:

```swift
public class URLSubtitleDataSouce: SubtitleDataSouce {
    public var infos: [any SubtitleInfo]
    
    public init(urls: [URL])
}

// Example
let subtitleSource = URLSubtitleDataSouce(urls: [
    URL(string: "https://example.com/english.srt")!,
    URL(string: "https://example.com/spanish.srt")!
])
```

### DirectorySubtitleDataSouce

Searches for subtitles in the same directory as the video:

```swift
public class DirectorySubtitleDataSouce: FileURLSubtitleDataSouce {
    public var infos: [any SubtitleInfo]
    
    public init()
    public func searchSubtitle(fileURL: URL?) async throws
}
```

### PlistCacheSubtitleDataSouce

Caches downloaded subtitle locations:

```swift
public class PlistCacheSubtitleDataSouce: CacheSubtitleDataSouce {
    public static let singleton: PlistCacheSubtitleDataSouce
    public var infos: [any SubtitleInfo]
    
    public func searchSubtitle(fileURL: URL?) async throws
    public func addCache(fileURL: URL, downloadURL: URL)
}
```

## Online Subtitle Providers

### ShooterSubtitleDataSouce

Shooter.cn subtitle search (for local files):

```swift
public class ShooterSubtitleDataSouce: FileURLSubtitleDataSouce {
    public var infos: [any SubtitleInfo]
    
    public init()
    public func searchSubtitle(fileURL: URL?) async throws
}
```

### AssrtSubtitleDataSouce

Assrt.net subtitle search:

```swift
public class AssrtSubtitleDataSouce: SearchSubtitleDataSouce {
    public var infos: [any SubtitleInfo]
    
    public init(token: String)
    public func searchSubtitle(query: String?, languages: [String]) async throws
}

// Example
let assrtSource = AssrtSubtitleDataSouce(token: "your-api-token")
```

### OpenSubtitleDataSouce

OpenSubtitles.com API:

```swift
public class OpenSubtitleDataSouce: SearchSubtitleDataSouce {
    public var infos: [any SubtitleInfo]
    
    public init(apiKey: String, username: String? = nil, password: String? = nil)
    
    // Search by query
    public func searchSubtitle(query: String?, languages: [String]) async throws
    
    // Search by IDs
    public func searchSubtitle(
        query: String?,
        imdbID: Int,
        tmdbID: Int,
        languages: [String]
    ) async throws
    
    // Search with custom parameters
    public func searchSubtitle(queryItems: [String: String]) async throws
}

// Example
let openSubSource = OpenSubtitleDataSouce(apiKey: "your-api-key")
```

## Configuring Default Data Sources

```swift
// Set default subtitle data sources
KSOptions.subtitleDataSouces = [
    DirectorySubtitleDataSouce(),
    PlistCacheSubtitleDataSouce.singleton
]

// Add online search
KSOptions.subtitleDataSouces.append(
    OpenSubtitleDataSouce(apiKey: "your-key")
)
```

## UIKit Integration

### With VideoPlayerView

```swift
class VideoViewController: UIViewController {
    let playerView = IOSVideoPlayerView()
    
    func loadSubtitle(url: URL) {
        let subtitleInfo = URLSubtitleInfo(url: url)
        playerView.srtControl.addSubtitle(info: subtitleInfo)
        playerView.srtControl.selectedSubtitleInfo = subtitleInfo
    }
    
    func selectSubtitle(at index: Int) {
        let subtitles = playerView.srtControl.subtitleInfos
        if index < subtitles.count {
            playerView.srtControl.selectedSubtitleInfo = subtitles[index]
        }
    }
    
    func disableSubtitles() {
        playerView.srtControl.selectedSubtitleInfo = nil
    }
}
```

### Subtitle Styling

```swift
// Configure before creating player
SubtitleModel.textFontSize = 20
SubtitleModel.textColor = .yellow
SubtitleModel.textBackgroundColor = Color.black.opacity(0.5)
SubtitleModel.textBold = true

// Update during playback (VideoPlayerView only)
playerView.updateSrt()
```

## SwiftUI Integration

### With KSVideoPlayer.Coordinator

```swift
struct PlayerView: View {
    @StateObject var coordinator = KSVideoPlayer.Coordinator()
    
    var body: some View {
        VStack {
            KSVideoPlayer(coordinator: coordinator, url: url, options: KSOptions())
            
            // Subtitle picker
            Picker("Subtitle", selection: $coordinator.subtitleModel.selectedSubtitleInfo) {
                Text("Off").tag(nil as (any SubtitleInfo)?)
                ForEach(coordinator.subtitleModel.subtitleInfos, id: \.subtitleID) { info in
                    Text(info.name).tag(info as (any SubtitleInfo)?)
                }
            }
        }
    }
}
```

### Adding External Subtitles

```swift
func addSubtitle(url: URL) {
    let info = URLSubtitleInfo(url: url)
    coordinator.subtitleModel.addSubtitle(info: info)
}
```

### Searching Online Subtitles

```swift
func searchSubtitles(title: String) {
    coordinator.subtitleModel.searchSubtitle(
        query: title,
        languages: ["en", "es"]
    )
}
```

## TextPosition

Subtitle text positioning:

```swift
public struct TextPosition {
    public var verticalAlign: VerticalAlignment = .bottom
    public var horizontalAlign: HorizontalAlignment = .center
    public var leftMargin: CGFloat = 0
    public var rightMargin: CGFloat = 0
    public var verticalMargin: CGFloat = 10
}

// Configure position
SubtitleModel.textPosition = TextPosition(
    verticalAlign: .bottom,
    horizontalAlign: .center,
    verticalMargin: 50
)
```

## Supported Subtitle Formats

KSPlayer supports various subtitle formats through FFmpeg and built-in parsers:

- **Text Formats**: SRT, ASS/SSA, VTT, TTML
- **Image Formats**: SUP/PGS, VobSub (IDX/SUB)
- **Embedded Subtitles**: From MKV, MP4, etc.

## Parsing Subtitles Manually

```swift
let subtitle = KSSubtitle()

// Parse from URL
Task {
    try await subtitle.parse(url: subtitleURL)
    print("Loaded \(subtitle.parts.count) subtitle cues")
}

// Parse from data
try subtitle.parse(data: subtitleData, encoding: .utf8)

// Search for subtitle at time
let parts = subtitle.search(for: currentTime)
```

## Complete Example

```swift
class SubtitlePlayerController: UIViewController, KSPlayerLayerDelegate {
    private var playerLayer: KSPlayerLayer!
    private var subtitleModel = SubtitleModel()
    private var subtitleLabel = UILabel()
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupSubtitleLabel()
        
        // Configure subtitle sources
        let subtitleSource = URLSubtitleDataSouce(urls: [
            URL(string: "https://example.com/english.srt")!
        ])
        subtitleModel.addSubtitle(dataSouce: subtitleSource)
        
        // Create player
        let url = URL(string: "https://example.com/video.mp4")!
        playerLayer = KSPlayerLayer(url: url, options: KSOptions(), delegate: self)
        subtitleModel.url = url
    }
    
    func player(layer: KSPlayerLayer, state: KSPlayerState) {
        if state == .readyToPlay {
            // Add embedded subtitles
            if let subtitleDataSource = layer.player.subtitleDataSouce {
                subtitleModel.addSubtitle(dataSouce: subtitleDataSource)
            }
            
            // Auto-select first subtitle
            subtitleModel.selectedSubtitleInfo = subtitleModel.subtitleInfos.first
        }
    }
    
    func player(layer: KSPlayerLayer, currentTime: TimeInterval, totalTime: TimeInterval) {
        if subtitleModel.subtitle(currentTime: currentTime) {
            updateSubtitleDisplay()
        }
    }
    
    private func updateSubtitleDisplay() {
        if let part = subtitleModel.parts.first {
            subtitleLabel.attributedText = part.text
            subtitleLabel.isHidden = false
        } else {
            subtitleLabel.isHidden = true
        }
    }
}
```

