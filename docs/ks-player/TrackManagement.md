# Track Management

KSPlayer provides APIs for managing audio, video, and subtitle tracks within media files.

## Overview

Tracks represent individual streams within a media container (video tracks, audio tracks, subtitle tracks). You can:
- Query available tracks
- Get track metadata
- Select/enable specific tracks

## Getting Tracks

### From MediaPlayerProtocol

```swift
// Get audio tracks
let audioTracks = player.tracks(mediaType: .audio)

// Get video tracks  
let videoTracks = player.tracks(mediaType: .video)

// Get subtitle tracks
let subtitleTracks = player.tracks(mediaType: .subtitle)
```

### From KSPlayerLayer

```swift
if let player = playerLayer.player {
    let audioTracks = player.tracks(mediaType: .audio)
    // ...
}
```

### From VideoPlayerView

```swift
if let player = playerView.playerLayer?.player {
    let tracks = player.tracks(mediaType: .audio)
    // ...
}
```

### From SwiftUI Coordinator

```swift
let audioTracks = coordinator.playerLayer?.player.tracks(mediaType: .audio) ?? []
```

## MediaPlayerTrack Protocol

All tracks conform to `MediaPlayerTrack`:

```swift
public protocol MediaPlayerTrack: AnyObject, CustomStringConvertible {
    var trackID: Int32 { get }
    var name: String { get }
    var languageCode: String? { get }
    var mediaType: AVFoundation.AVMediaType { get }
    var nominalFrameRate: Float { get set }
    var bitRate: Int64 { get }
    var bitDepth: Int32 { get }
    var isEnabled: Bool { get set }
    var isImageSubtitle: Bool { get }
    var rotation: Int16 { get }
    var dovi: DOVIDecoderConfigurationRecord? { get }
    var fieldOrder: FFmpegFieldOrder { get }
    var formatDescription: CMFormatDescription? { get }
}
```

## Track Properties

### Basic Properties

| Property | Type | Description |
|----------|------|-------------|
| `trackID` | `Int32` | Unique track identifier |
| `name` | `String` | Track name (often empty) |
| `languageCode` | `String?` | ISO 639-1/639-2 language code |
| `mediaType` | `AVMediaType` | `.audio`, `.video`, or `.subtitle` |
| `isEnabled` | `Bool` | Whether track is currently active |

### Audio Properties

| Property | Type | Description |
|----------|------|-------------|
| `bitRate` | `Int64` | Audio bitrate in bps |
| `audioStreamBasicDescription` | `AudioStreamBasicDescription?` | Core Audio format info |

### Video Properties

| Property | Type | Description |
|----------|------|-------------|
| `naturalSize` | `CGSize` | Video dimensions |
| `nominalFrameRate` | `Float` | Frame rate |
| `bitRate` | `Int64` | Video bitrate in bps |
| `bitDepth` | `Int32` | Color depth (8, 10, 12) |
| `rotation` | `Int16` | Rotation in degrees |
| `fieldOrder` | `FFmpegFieldOrder` | Interlacing type |
| `dynamicRange` | `DynamicRange?` | SDR/HDR/Dolby Vision |
| `dovi` | `DOVIDecoderConfigurationRecord?` | Dolby Vision config |

### Color Properties

| Property | Type | Description |
|----------|------|-------------|
| `colorPrimaries` | `String?` | Color primaries (e.g., "ITU_R_709_2") |
| `transferFunction` | `String?` | Transfer function |
| `yCbCrMatrix` | `String?` | YCbCr matrix |
| `colorSpace` | `CGColorSpace?` | Computed color space |

### Subtitle Properties

| Property | Type | Description |
|----------|------|-------------|
| `isImageSubtitle` | `Bool` | True for bitmap subtitles (SUP, VobSub) |

### Computed Properties

```swift
extension MediaPlayerTrack {
    // Localized language name
    var language: String? {
        languageCode.flatMap { Locale.current.localizedString(forLanguageCode: $0) }
    }
    
    // FourCC codec type
    var codecType: FourCharCode
    
    // Video format subtype
    var mediaSubType: CMFormatDescription.MediaSubType
}
```

## Selecting Tracks

### Select a Track

```swift
// Find English audio track
if let englishTrack = audioTracks.first(where: { $0.languageCode == "en" }) {
    player.select(track: englishTrack)
}
```

### Select Track by Index

```swift
let audioTracks = player.tracks(mediaType: .audio)
if audioTracks.count > 1 {
    player.select(track: audioTracks[1])
}
```

### Check Currently Selected Track

```swift
let currentAudio = audioTracks.first(where: { $0.isEnabled })
print("Current audio: \(currentAudio?.name ?? "none")")
```

## Track Selection Examples

### Audio Track Selection

```swift
func selectAudioTrack(languageCode: String) {
    let audioTracks = player.tracks(mediaType: .audio)
    
    if let track = audioTracks.first(where: { $0.languageCode == languageCode }) {
        player.select(track: track)
        print("Selected: \(track.language ?? track.name)")
    }
}

// Usage
selectAudioTrack(languageCode: "en")  // English
selectAudioTrack(languageCode: "es")  // Spanish
selectAudioTrack(languageCode: "ja")  // Japanese
```

### Video Track Selection (Multi-angle/quality)

```swift
func selectVideoTrack(preferredBitrate: Int64) {
    let videoTracks = player.tracks(mediaType: .video)
    
    // Find closest bitrate
    let sorted = videoTracks.sorted { 
        abs($0.bitRate - preferredBitrate) < abs($1.bitRate - preferredBitrate) 
    }
    
    if let track = sorted.first {
        player.select(track: track)
        print("Selected video: \(track.naturalSize.width)x\(track.naturalSize.height)")
    }
}
```

### HDR Track Selection

```swift
func selectHDRTrack() {
    let videoTracks = player.tracks(mediaType: .video)
    
    // Prefer Dolby Vision, then HDR10, then SDR
    let preferredOrder: [DynamicRange] = [.dolbyVision, .hdr10, .hlg, .sdr]
    
    for range in preferredOrder {
        if let track = videoTracks.first(where: { $0.dynamicRange == range }) {
            player.select(track: track)
            print("Selected: \(range)")
            return
        }
    }
}
```

## UIKit Track Selection UI

### Using UIAlertController

```swift
func showAudioTrackPicker() {
    guard let player = playerLayer?.player else { return }
    
    let audioTracks = player.tracks(mediaType: .audio)
    guard !audioTracks.isEmpty else { return }
    
    let alert = UIAlertController(
        title: "Select Audio Track",
        message: nil,
        preferredStyle: .actionSheet
    )
    
    for track in audioTracks {
        let title = track.language ?? track.name
        let action = UIAlertAction(title: title, style: .default) { _ in
            player.select(track: track)
        }
        
        if track.isEnabled {
            action.setValue(true, forKey: "checked")
        }
        
        alert.addAction(action)
    }
    
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    present(alert, animated: true)
}
```

### Track Info Display

```swift
func displayTrackInfo() {
    guard let player = playerLayer?.player else { return }
    
    // Video info
    if let videoTrack = player.tracks(mediaType: .video).first(where: { $0.isEnabled }) {
        print("Video: \(videoTrack.naturalSize.width)x\(videoTrack.naturalSize.height)")
        print("FPS: \(videoTrack.nominalFrameRate)")
        print("Bitrate: \(videoTrack.bitRate / 1000) kbps")
        print("HDR: \(videoTrack.dynamicRange?.description ?? "SDR")")
    }
    
    // Audio info
    if let audioTrack = player.tracks(mediaType: .audio).first(where: { $0.isEnabled }) {
        print("Audio: \(audioTrack.language ?? "Unknown")")
        print("Bitrate: \(audioTrack.bitRate / 1000) kbps")
    }
}
```

## SwiftUI Track Selection

### Audio Track Picker

```swift
struct AudioTrackPicker: View {
    let player: MediaPlayerProtocol?
    
    var audioTracks: [MediaPlayerTrack] {
        player?.tracks(mediaType: .audio) ?? []
    }
    
    var body: some View {
        Menu {
            ForEach(audioTracks, id: \.trackID) { track in
                Button {
                    player?.select(track: track)
                } label: {
                    HStack {
                        Text(track.language ?? track.name)
                        if track.isEnabled {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Image(systemName: "waveform.circle.fill")
        }
    }
}
```

### Video Track Picker

```swift
struct VideoTrackPicker: View {
    let player: MediaPlayerProtocol?
    
    var videoTracks: [MediaPlayerTrack] {
        player?.tracks(mediaType: .video) ?? []
    }
    
    var body: some View {
        Picker("Video", selection: Binding(
            get: { videoTracks.first(where: { $0.isEnabled })?.trackID },
            set: { newValue in
                if let track = videoTracks.first(where: { $0.trackID == newValue }) {
                    player?.select(track: track)
                }
            }
        )) {
            ForEach(videoTracks, id: \.trackID) { track in
                Text("\(Int(track.naturalSize.width))x\(Int(track.naturalSize.height))")
                    .tag(track.trackID as Int32?)
            }
        }
    }
}
```

## Automatic Track Selection

Configure `KSOptions` for automatic track selection:

```swift
class CustomOptions: KSOptions {
    // Prefer English audio
    override func wantedAudio(tracks: [MediaPlayerTrack]) -> Int? {
        if let index = tracks.firstIndex(where: { $0.languageCode == "en" }) {
            return index
        }
        return nil  // Use default selection
    }
    
    // Prefer highest quality video
    override func wantedVideo(tracks: [MediaPlayerTrack]) -> Int? {
        if let index = tracks.enumerated().max(by: { $0.element.bitRate < $1.element.bitRate })?.offset {
            return index
        }
        return nil
    }
}
```

## Track Events

### Detecting Track Changes

```swift
func player(layer: KSPlayerLayer, state: KSPlayerState) {
    if state == .readyToPlay {
        let player = layer.player
        
        // Log available tracks
        print("Audio tracks: \(player.tracks(mediaType: .audio).count)")
        print("Video tracks: \(player.tracks(mediaType: .video).count)")
        print("Subtitle tracks: \(player.tracks(mediaType: .subtitle).count)")
        
        // Get current selections
        let currentAudio = player.tracks(mediaType: .audio).first(where: { $0.isEnabled })
        let currentVideo = player.tracks(mediaType: .video).first(where: { $0.isEnabled })
        
        print("Current audio: \(currentAudio?.language ?? "unknown")")
        print("Current video: \(currentVideo?.naturalSize ?? .zero)")
    }
}
```

## Complete Example

```swift
class TrackSelectionController: UIViewController, KSPlayerLayerDelegate {
    private var playerLayer: KSPlayerLayer!
    private var audioButton: UIButton!
    private var videoInfoLabel: UILabel!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        
        let url = URL(string: "https://example.com/multi-track-video.mkv")!
        playerLayer = KSPlayerLayer(url: url, options: KSOptions(), delegate: self)
    }
    
    func player(layer: KSPlayerLayer, state: KSPlayerState) {
        if state == .readyToPlay {
            updateTrackUI()
        }
    }
    
    private func updateTrackUI() {
        guard let player = playerLayer?.player else { return }
        
        // Update video info
        if let video = player.tracks(mediaType: .video).first(where: { $0.isEnabled }) {
            videoInfoLabel.text = """
                \(Int(video.naturalSize.width))x\(Int(video.naturalSize.height)) @ \(Int(video.nominalFrameRate))fps
                \(video.dynamicRange?.description ?? "SDR")
                """
        }
        
        // Update audio button
        let audioCount = player.tracks(mediaType: .audio).count
        audioButton.isHidden = audioCount < 2
        
        if let audio = player.tracks(mediaType: .audio).first(where: { $0.isEnabled }) {
            audioButton.setTitle(audio.language ?? "Audio", for: .normal)
        }
    }
    
    @objc private func audioButtonTapped() {
        guard let player = playerLayer?.player else { return }
        
        let tracks = player.tracks(mediaType: .audio)
        let alert = UIAlertController(title: "Audio Track", message: nil, preferredStyle: .actionSheet)
        
        for track in tracks {
            let title = [track.language, track.name]
                .compactMap { $0 }
                .joined(separator: " - ")
            
            let action = UIAlertAction(title: title.isEmpty ? "Track \(track.trackID)" : title, style: .default) { [weak self] _ in
                player.select(track: track)
                self?.updateTrackUI()
            }
            
            if track.isEnabled {
                action.setValue(true, forKey: "checked")
                alert.preferredAction = action
            }
            
            alert.addAction(action)
        }
        
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        present(alert, animated: true)
    }
    
    private func setupUI() {
        audioButton = UIButton(type: .system)
        audioButton.addTarget(self, action: #selector(audioButtonTapped), for: .touchUpInside)
        view.addSubview(audioButton)
        
        videoInfoLabel = UILabel()
        videoInfoLabel.numberOfLines = 0
        view.addSubview(videoInfoLabel)
    }
    
    // Delegate methods...
    func player(layer: KSPlayerLayer, currentTime: TimeInterval, totalTime: TimeInterval) {}
    func player(layer: KSPlayerLayer, finish error: Error?) {}
    func player(layer: KSPlayerLayer, bufferedCount: Int, consumeTime: TimeInterval) {}
}
```

