# Types and Protocols

This reference documents all core types, protocols, and enums in KSPlayer.

## Protocols

### MediaPlayerProtocol

The main protocol that player implementations (`KSAVPlayer`, `KSMEPlayer`) must conform to.

```swift
public protocol MediaPlayerProtocol: MediaPlayback {
    var delegate: MediaPlayerDelegate? { get set }
    var view: UIView? { get }
    var playableTime: TimeInterval { get }
    var isReadyToPlay: Bool { get }
    var playbackState: MediaPlaybackState { get }
    var loadState: MediaLoadState { get }
    var isPlaying: Bool { get }
    var seekable: Bool { get }
    var isMuted: Bool { get set }
    var allowsExternalPlayback: Bool { get set }
    var usesExternalPlaybackWhileExternalScreenIsActive: Bool { get set }
    var isExternalPlaybackActive: Bool { get }
    var playbackRate: Float { get set }
    var playbackVolume: Float { get set }
    var contentMode: UIViewContentMode { get set }
    var subtitleDataSouce: SubtitleDataSouce? { get }
    var dynamicInfo: DynamicInfo? { get }
    
    @available(macOS 12.0, iOS 15.0, tvOS 15.0, *)
    var playbackCoordinator: AVPlaybackCoordinator { get }
    
    @available(tvOS 14.0, *)
    var pipController: KSPictureInPictureController? { get }
    
    init(url: URL, options: KSOptions)
    func replace(url: URL, options: KSOptions)
    func play()
    func pause()
    func enterBackground()
    func enterForeground()
    func thumbnailImageAtCurrentTime() async -> CGImage?
    func tracks(mediaType: AVFoundation.AVMediaType) -> [MediaPlayerTrack]
    func select(track: some MediaPlayerTrack)
}
```

### MediaPlayback

Base protocol for playback functionality:

```swift
public protocol MediaPlayback: AnyObject {
    var duration: TimeInterval { get }
    var fileSize: Double { get }
    var naturalSize: CGSize { get }
    var chapters: [Chapter] { get }
    var currentPlaybackTime: TimeInterval { get }
    
    func prepareToPlay()
    func shutdown()
    func seek(time: TimeInterval, completion: @escaping ((Bool) -> Void))
}
```

### MediaPlayerDelegate

Delegate for receiving player events:

```swift
@MainActor
public protocol MediaPlayerDelegate: AnyObject {
    func readyToPlay(player: some MediaPlayerProtocol)
    func changeLoadState(player: some MediaPlayerProtocol)
    func changeBuffering(player: some MediaPlayerProtocol, progress: Int)
    func playBack(player: some MediaPlayerProtocol, loopCount: Int)
    func finish(player: some MediaPlayerProtocol, error: Error?)
}
```

### MediaPlayerTrack

Protocol for audio/video/subtitle track information:

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

#### Extension Properties

```swift
extension MediaPlayerTrack {
    var language: String?        // Localized language name
    var codecType: FourCharCode
    var dynamicRange: DynamicRange?
    var colorSpace: CGColorSpace?
    var mediaSubType: CMFormatDescription.MediaSubType
    var audioStreamBasicDescription: AudioStreamBasicDescription?
    var naturalSize: CGSize
    var colorPrimaries: String?
    var transferFunction: String?
    var yCbCrMatrix: String?
}
```

### KSPlayerLayerDelegate

Delegate for `KSPlayerLayer` events:

```swift
@MainActor
public protocol KSPlayerLayerDelegate: AnyObject {
    func player(layer: KSPlayerLayer, state: KSPlayerState)
    func player(layer: KSPlayerLayer, currentTime: TimeInterval, totalTime: TimeInterval)
    func player(layer: KSPlayerLayer, finish error: Error?)
    func player(layer: KSPlayerLayer, bufferedCount: Int, consumeTime: TimeInterval)
}
```

### PlayerControllerDelegate

Delegate for `PlayerView` events:

```swift
public protocol PlayerControllerDelegate: AnyObject {
    func playerController(state: KSPlayerState)
    func playerController(currentTime: TimeInterval, totalTime: TimeInterval)
    func playerController(finish error: Error?)
    func playerController(maskShow: Bool)
    func playerController(action: PlayerButtonType)
    func playerController(bufferedCount: Int, consumeTime: TimeInterval)
    func playerController(seek: TimeInterval)
}
```

### CapacityProtocol

Buffer capacity information:

```swift
public protocol CapacityProtocol {
    var fps: Float { get }
    var packetCount: Int { get }
    var frameCount: Int { get }
    var frameMaxCount: Int { get }
    var isEndOfFile: Bool { get }
    var mediaType: AVFoundation.AVMediaType { get }
}
```

## Enums

### KSPlayerState

Player state enumeration:

```swift
public enum KSPlayerState: CustomStringConvertible {
    case initialized      // Player created
    case preparing        // Loading media
    case readyToPlay      // Ready to start playback
    case buffering        // Buffering data
    case bufferFinished   // Buffer sufficient, playing
    case paused           // Playback paused
    case playedToTheEnd   // Reached end of media
    case error            // Error occurred
    
    public var isPlaying: Bool  // true for .buffering or .bufferFinished
}
```

### MediaPlaybackState

Low-level playback state:

```swift
public enum MediaPlaybackState: Int {
    case idle
    case playing
    case paused
    case seeking
    case finished
    case stopped
}
```

### MediaLoadState

Loading state:

```swift
public enum MediaLoadState: Int {
    case idle
    case loading
    case playable
}
```

### DynamicRange

HDR/SDR content range:

```swift
public enum DynamicRange: Int32 {
    case sdr = 0
    case hdr10 = 2
    case hlg = 3
    case dolbyVision = 5
    
    static var availableHDRModes: [DynamicRange]  // Device-supported modes
}
```

### DisplayEnum

Video display mode:

```swift
@MainActor
public enum DisplayEnum {
    case plane    // Normal 2D display
    case vr       // VR mode (spherical)
    case vrBox    // VR Box mode (side-by-side)
}
```

### FFmpegFieldOrder

Video interlacing:

```swift
public enum FFmpegFieldOrder: UInt8 {
    case unknown = 0
    case progressive
    case tt    // Top coded first, top displayed first
    case bb    // Bottom coded first, bottom displayed first
    case tb    // Top coded first, bottom displayed first
    case bt    // Bottom coded first, top displayed first
}
```

### VideoInterlacingType

Detected interlacing type:

```swift
public enum VideoInterlacingType: String {
    case tff          // Top field first
    case bff          // Bottom field first
    case progressive  // Progressive scan
    case undetermined
}
```

### ClockProcessType

Internal clock synchronization:

```swift
public enum ClockProcessType {
    case remain
    case next
    case dropNextFrame
    case dropNextPacket
    case dropGOPPacket
    case flush
    case seek
}
```

### PlayerButtonType

UI button types:

```swift
public enum PlayerButtonType: Int {
    case play = 101
    case pause
    case back
    case srt              // Subtitles
    case landscape        // Fullscreen
    case replay
    case lock
    case rate             // Playback speed
    case definition       // Quality
    case pictureInPicture
    case audioSwitch
    case videoSwitch
}
```

### KSPlayerTopBarShowCase

Top bar visibility:

```swift
public enum KSPlayerTopBarShowCase {
    case always         // Always show
    case horizantalOnly // Only in landscape
    case none           // Never show
}
```

### KSPanDirection

Gesture direction:

```swift
public enum KSPanDirection {
    case horizontal
    case vertical
}
```

### TimeType

Time formatting:

```swift
public enum TimeType {
    case min           // MM:SS
    case hour          // H:MM:SS
    case minOrHour     // MM:SS or H:MM:SS based on duration
    case millisecond   // HH:MM:SS.ms
}
```

### LogLevel

Logging levels:

```swift
public enum LogLevel: Int32 {
    case panic = 0
    case fatal = 8
    case error = 16
    case warning = 24
    case info = 32
    case verbose = 40
    case debug = 48
    case trace = 56
}
```

## Structs

### Chapter

Video chapter information:

```swift
public struct Chapter {
    public let start: TimeInterval
    public let end: TimeInterval
    public let title: String
}
```

### LoadingState

Buffer loading state:

```swift
public struct LoadingState {
    public let loadedTime: TimeInterval
    public let progress: TimeInterval
    public let packetCount: Int
    public let frameCount: Int
    public let isEndOfFile: Bool
    public let isPlayable: Bool
    public let isFirst: Bool
    public let isSeek: Bool
}
```

### VideoAdaptationState

Adaptive bitrate state:

```swift
public struct VideoAdaptationState {
    public struct BitRateState {
        let bitRate: Int64
        let time: TimeInterval
    }
    
    public let bitRates: [Int64]
    public let duration: TimeInterval
    public internal(set) var fps: Float
    public internal(set) var bitRateStates: [BitRateState]
    public internal(set) var currentPlaybackTime: TimeInterval
    public internal(set) var isPlayable: Bool
    public internal(set) var loadedCount: Int
}
```

### DOVIDecoderConfigurationRecord

Dolby Vision configuration:

```swift
public struct DOVIDecoderConfigurationRecord {
    public let dv_version_major: UInt8
    public let dv_version_minor: UInt8
    public let dv_profile: UInt8
    public let dv_level: UInt8
    public let rpu_present_flag: UInt8
    public let el_present_flag: UInt8
    public let bl_present_flag: UInt8
    public let dv_bl_signal_compatibility_id: UInt8
}
```

### KSClock

Internal clock for A/V sync:

```swift
public struct KSClock {
    public private(set) var lastMediaTime: CFTimeInterval
    public internal(set) var position: Int64
    public internal(set) var time: CMTime
    
    func getTime() -> TimeInterval
}
```

### TextPosition

Subtitle text positioning:

```swift
public struct TextPosition {
    public var verticalAlign: VerticalAlignment = .bottom
    public var horizontalAlign: HorizontalAlignment = .center
    public var leftMargin: CGFloat = 0
    public var rightMargin: CGFloat = 0
    public var verticalMargin: CGFloat = 10
    public var edgeInsets: EdgeInsets { get }
}
```

## Classes

### DynamicInfo

Runtime playback information:

```swift
public class DynamicInfo: ObservableObject {
    public var metadata: [String: String]       // Media metadata
    public var bytesRead: Int64                 // Bytes transferred
    public var audioBitrate: Int                // Current audio bitrate
    public var videoBitrate: Int                // Current video bitrate
    
    @Published
    public var displayFPS: Double = 0.0         // Current display FPS
    public var audioVideoSyncDiff: Double = 0.0 // A/V sync difference
    public var droppedVideoFrameCount: UInt32   // Dropped frames
    public var droppedVideoPacketCount: UInt32  // Dropped packets
}
```

## Error Handling

### KSPlayerErrorCode

```swift
public enum KSPlayerErrorCode: Int {
    case unknown
    case formatCreate
    case formatOpenInput
    case formatOutputCreate
    case formatWriteHeader
    case formatFindStreamInfo
    case readFrame
    case codecContextCreate
    case codecContextSetParam
    case codecContextFindDecoder
    case codesContextOpen
    case codecVideoSendPacket
    case codecAudioSendPacket
    case codecVideoReceiveFrame
    case codecAudioReceiveFrame
    case auidoSwrInit
    case codecSubtitleSendPacket
    case videoTracksUnplayable
    case subtitleUnEncoding
    case subtitleUnParse
    case subtitleFormatUnSupport
    case subtitleParamsEmpty
}
```

### Error Domain

```swift
public let KSPlayerErrorDomain = "KSPlayerErrorDomain"
```

## Extensions

### TimeInterval Formatting

```swift
extension TimeInterval {
    func toString(for type: TimeType) -> String
}

// Example:
let time: TimeInterval = 3661  // 1 hour, 1 minute, 1 second
time.toString(for: .min)       // "61:01"
time.toString(for: .hour)      // "1:01:01"
time.toString(for: .minOrHour) // "1:01:01"
```

### Int Formatting

```swift
extension Int {
    func toString(for type: TimeType) -> String
}

extension FixedWidthInteger {
    var kmFormatted: String  // "1.5K", "2.3M", etc.
}
```

