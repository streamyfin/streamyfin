import AVFoundation
import AVKit
import KSPlayer
import UIKit

protocol SfPlayerWrapperDelegate: AnyObject {
    func player(_ player: SfPlayerWrapper, didUpdatePosition position: Double, duration: Double)
    func player(_ player: SfPlayerWrapper, didChangePause isPaused: Bool)
    func player(_ player: SfPlayerWrapper, didChangeLoading isLoading: Bool)
    func player(_ player: SfPlayerWrapper, didBecomeReadyToSeek: Bool)
    func player(_ player: SfPlayerWrapper, didBecomeTracksReady: Bool)
    func player(_ player: SfPlayerWrapper, didEncounterError error: String)
}

/// Configuration for loading a video
struct VideoLoadConfig {
    let url: URL
    var headers: [String: String]?
    var externalSubtitles: [String]?
    var startPosition: Double?
    var autoplay: Bool
    var initialSubtitleId: Int?
    var initialAudioId: Int?
    
    init(
        url: URL,
        headers: [String: String]? = nil,
        externalSubtitles: [String]? = nil,
        startPosition: Double? = nil,
        autoplay: Bool = true,
        initialSubtitleId: Int? = nil,
        initialAudioId: Int? = nil
    ) {
        self.url = url
        self.headers = headers
        self.externalSubtitles = externalSubtitles
        self.startPosition = startPosition
        self.autoplay = autoplay
        self.initialSubtitleId = initialSubtitleId
        self.initialAudioId = initialAudioId
    }
}

final class SfPlayerWrapper: NSObject {
    
    // MARK: - Properties
    
    private var playerView: IOSVideoPlayerView?
    private var containerView: UIView?
    
    private var cachedPosition: Double = 0
    private var cachedDuration: Double = 0
    private var isPaused: Bool = true
    private var isLoading: Bool = false
    private var currentURL: URL?
    private var pendingExternalSubtitles: [String] = []
    private var initialSubtitleId: Int?
    private var initialAudioId: Int?
    
    private var progressTimer: Timer?
    
    weak var delegate: SfPlayerWrapperDelegate?
    
    var view: UIView? { containerView }
    
    // MARK: - Initialization
    
    override init() {
        super.init()
        setupPlayer()
    }
    
    deinit {
        stopProgressTimer()
        playerView?.pause()
        playerView = nil
    }
    
    // MARK: - Setup
    
    private func setupPlayer() {
        // Configure KSPlayer options for hardware acceleration
        KSOptions.canBackgroundPlay = true
        KSOptions.isAutoPlay = false
        KSOptions.isSecondOpen = true
        KSOptions.isAccurateSeek = true
        KSOptions.hardwareDecode = true
        
        // Create container view
        let container = UIView()
        container.backgroundColor = .black
        container.clipsToBounds = true
        containerView = container
    }
    
    private func createPlayerView(frame: CGRect) -> IOSVideoPlayerView {
        let player = IOSVideoPlayerView()
        player.frame = frame
        player.delegate = self
        
        // Hide default controls - we use our own
        player.toolBar.isHidden = true
        player.navigationBar.isHidden = true
        
        return player
    }
    
    // MARK: - Progress Timer
    
    private func startProgressTimer() {
        stopProgressTimer()
        progressTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.updateProgress()
        }
    }
    
    private func stopProgressTimer() {
        progressTimer?.invalidate()
        progressTimer = nil
    }
    
    private func updateProgress() {
        guard let player = playerView?.playerLayer?.player else { return }
        
        let position = player.currentPlaybackTime
        let duration = player.duration
        
        if position != cachedPosition || duration != cachedDuration {
            cachedPosition = position
            cachedDuration = duration
            delegate?.player(self, didUpdatePosition: position, duration: duration)
        }
    }
    
    // MARK: - Public API
    
    func load(config: VideoLoadConfig) {
        guard config.url != currentURL else { return }
        
        currentURL = config.url
        pendingExternalSubtitles = config.externalSubtitles ?? []
        initialSubtitleId = config.initialSubtitleId
        initialAudioId = config.initialAudioId
        
        isLoading = true
        delegate?.player(self, didChangeLoading: true)
        
        // Create or reset player view
        if playerView == nil, let container = containerView {
            let player = createPlayerView(frame: container.bounds)
            player.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            container.addSubview(player)
            playerView = player
        }
        
        // Configure options for this media
        let options = KSOptions()
        
        // Set HTTP headers if provided
        if let headers = config.headers, !headers.isEmpty {
            for (key, value) in headers {
                options.appendHeader(["key": key, "value": value])
            }
        }
        
        // Set start position
        if let startPos = config.startPosition, startPos > 0 {
            options.startPlayTime = startPos
        }
        
        // Set the URL with options
        playerView?.set(url: config.url, options: options)
        
        if config.autoplay {
            play()
        }
    }
    
    func play() {
        isPaused = false
        playerView?.play()
        startProgressTimer()
        delegate?.player(self, didChangePause: false)
    }
    
    func pause() {
        isPaused = true
        playerView?.pause()
        delegate?.player(self, didChangePause: true)
    }
    
    func seek(to seconds: Double) {
        let time = max(0, seconds)
        cachedPosition = time
        playerView?.seek(time: time) { [weak self] finished in
            guard let self, finished else { return }
            self.updateProgress()
        }
    }
    
    func seek(by seconds: Double) {
        let newPosition = max(0, cachedPosition + seconds)
        seek(to: newPosition)
    }
    
    func setSpeed(_ speed: Double) {
        playerView?.playerLayer?.player.playbackRate = Float(speed)
    }
    
    func getSpeed() -> Double {
        return Double(playerView?.playerLayer?.player.playbackRate ?? 1.0)
    }
    
    func getCurrentPosition() -> Double {
        return cachedPosition
    }
    
    func getDuration() -> Double {
        return cachedDuration
    }
    
    func getIsPaused() -> Bool {
        return isPaused
    }
    
    // MARK: - Picture in Picture
    
    func startPictureInPicture() {
        playerView?.playerLayer?.player.pipController?.startPictureInPicture()
    }
    
    func stopPictureInPicture() {
        playerView?.playerLayer?.player.pipController?.stopPictureInPicture()
    }
    
    func isPictureInPictureSupported() -> Bool {
        return AVPictureInPictureController.isPictureInPictureSupported()
    }
    
    func isPictureInPictureActive() -> Bool {
        return playerView?.playerLayer?.player.pipController?.isPictureInPictureActive ?? false
    }
    
    // MARK: - Subtitle Controls
    
    func getSubtitleTracks() -> [[String: Any]] {
        guard let player = playerView?.playerLayer?.player else { return [] }
        
        var tracks: [[String: Any]] = []
        let subtitleTracks = player.tracks(mediaType: .subtitle)
        
        for (index, track) in subtitleTracks.enumerated() {
            let trackInfo: [String: Any] = [
                "id": index + 1,
                "selected": track.isEnabled,
                "title": track.name,
                "lang": track.language ?? ""
            ]
            tracks.append(trackInfo)
        }
        
        return tracks
    }
    
    func setSubtitleTrack(_ trackId: Int) {
        guard let player = playerView?.playerLayer?.player else { return }
        
        let subtitleTracks = player.tracks(mediaType: .subtitle)
        let index = trackId - 1
        
        if index >= 0 && index < subtitleTracks.count {
            let track = subtitleTracks[index]
            player.select(track: track)
        }
    }
    
    func disableSubtitles() {
        guard let player = playerView?.playerLayer?.player else { return }
        
        let subtitleTracks = player.tracks(mediaType: .subtitle)
        for track in subtitleTracks {
            if track.isEnabled {
                player.select(track: track)
            }
        }
    }
    
    func getCurrentSubtitleTrack() -> Int {
        guard let player = playerView?.playerLayer?.player else { return 0 }
        
        let subtitleTracks = player.tracks(mediaType: .subtitle)
        for (index, track) in subtitleTracks.enumerated() {
            if track.isEnabled {
                return index + 1
            }
        }
        return 0
    }
    
    func addSubtitleFile(url: String, select: Bool) {
        pendingExternalSubtitles.append(url)
    }
    
    // MARK: - Subtitle Positioning
    
    func setSubtitlePosition(_ position: Int) {
        // KSPlayer subtitle positioning through options
    }
    
    func setSubtitleScale(_ scale: Double) {
        // Adjust subtitle font scale
    }
    
    func setSubtitleMarginY(_ margin: Int) {
        // Adjust vertical margin
    }
    
    func setSubtitleAlignX(_ alignment: String) {
        // Horizontal alignment
    }
    
    func setSubtitleAlignY(_ alignment: String) {
        // Vertical alignment
    }
    
    func setSubtitleFontSize(_ size: Int) {
        // Font size adjustment
    }
    
    // MARK: - Audio Controls
    
    func getAudioTracks() -> [[String: Any]] {
        guard let player = playerView?.playerLayer?.player else { return [] }
        
        var tracks: [[String: Any]] = []
        let audioTracks = player.tracks(mediaType: .audio)
        
        for (index, track) in audioTracks.enumerated() {
            let trackInfo: [String: Any] = [
                "id": index + 1,
                "selected": track.isEnabled,
                "title": track.name,
                "lang": track.language ?? ""
            ]
            tracks.append(trackInfo)
        }
        
        return tracks
    }
    
    func setAudioTrack(_ trackId: Int) {
        guard let player = playerView?.playerLayer?.player else { return }
        
        let audioTracks = player.tracks(mediaType: .audio)
        let index = trackId - 1
        
        if index >= 0 && index < audioTracks.count {
            let track = audioTracks[index]
            player.select(track: track)
        }
    }
    
    func getCurrentAudioTrack() -> Int {
        guard let player = playerView?.playerLayer?.player else { return 0 }
        
        let audioTracks = player.tracks(mediaType: .audio)
        for (index, track) in audioTracks.enumerated() {
            if track.isEnabled {
                return index + 1
            }
        }
        return 0
    }
    
    // MARK: - Layout
    
    func updateLayout(bounds: CGRect) {
        playerView?.frame = bounds
    }
}

// MARK: - PlayerControllerDelegate

extension SfPlayerWrapper: PlayerControllerDelegate {
    func playerController(state: KSPlayerState) {
        switch state {
        case .initialized:
            break
            
        case .preparing:
            isLoading = true
            delegate?.player(self, didChangeLoading: true)
            
        case .readyToPlay:
            isLoading = false
            delegate?.player(self, didChangeLoading: false)
            delegate?.player(self, didBecomeReadyToSeek: true)
            delegate?.player(self, didBecomeTracksReady: true)
            
            // Apply initial track selections
            if let subId = initialSubtitleId {
                if subId < 0 {
                    disableSubtitles()
                } else {
                    setSubtitleTrack(subId)
                }
            }
            if let audioId = initialAudioId {
                setAudioTrack(audioId)
            }
            
        case .buffering:
            isLoading = true
            delegate?.player(self, didChangeLoading: true)
            
        case .bufferFinished:
            isLoading = false
            delegate?.player(self, didChangeLoading: false)
            
        case .paused:
            isPaused = true
            delegate?.player(self, didChangePause: true)
            
        case .playedToTheEnd:
            isPaused = true
            delegate?.player(self, didChangePause: true)
            stopProgressTimer()
            
        case .error:
            delegate?.player(self, didEncounterError: "Playback error occurred")
            
        @unknown default:
            break
        }
    }
    
    func playerController(currentTime: TimeInterval, totalTime: TimeInterval) {
        cachedPosition = currentTime
        cachedDuration = totalTime
        delegate?.player(self, didUpdatePosition: currentTime, duration: totalTime)
    }
    
    func playerController(finish error: Error?) {
        if let error = error {
            delegate?.player(self, didEncounterError: error.localizedDescription)
        }
        stopProgressTimer()
    }
    
    func playerController(maskShow: Bool) {
        // UI mask visibility changed
    }
    
    func playerController(action: PlayerButtonType) {
        // Button action handled
    }
    
    func playerController(bufferedCount: Int, consumeTime: TimeInterval) {
        // Buffering progress
    }
    
    func playerController(seek: TimeInterval) {
        // Seek completed
    }
}
