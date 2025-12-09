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
    func player(_ player: SfPlayerWrapper, didChangePictureInPicture isActive: Bool)
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
    private var pipController: AVPictureInPictureController?
    
    /// Scale factor for image-based subtitles (PGS, VOBSUB)
    /// Default 0.5 scales 1080p subtitle images to fit mobile screens
    private var subtitleScale: CGFloat = 0.5
    
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
        
        // Hide ALL KSPlayer UI elements - we use our own JS controls
        player.toolBar.isHidden = true
        player.navigationBar.isHidden = true
        player.topMaskView.isHidden = true
        player.bottomMaskView.isHidden = true
        player.loadingIndector.isHidden = false
        player.seekToView.isHidden = true
        player.replayButton.isHidden = true
        player.lockButton.isHidden = true
        player.controllerView.isHidden = true
        player.titleLabel.isHidden = true
        
        // Ensure subtitle views are visible for rendering
        player.subtitleBackView.isHidden = false
        player.subtitleLabel.isHidden = false
        
        // Disable all gestures - handled in JS
        player.tapGesture.isEnabled = false
        player.doubleTapGesture.isEnabled = false
        player.panGesture.isEnabled = false
        
        // Disable interaction on hidden elements
        player.controllerView.isUserInteractionEnabled = false
        
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
            player.translatesAutoresizingMaskIntoConstraints = false
            container.addSubview(player)
            
            // Pin player to all edges of container
            NSLayoutConstraint.activate([
                player.topAnchor.constraint(equalTo: container.topAnchor),
                player.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                player.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                player.bottomAnchor.constraint(equalTo: container.bottomAnchor)
            ])
            
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
    
    private func setupPictureInPicture() {
        guard AVPictureInPictureController.isPictureInPictureSupported() else { return }
        
        // Get the PiP controller from KSPlayer
        guard let pip = playerView?.playerLayer?.player.pipController else { return }
        
        pipController = pip
        pip.delegate = self
        
        // Enable automatic PiP when app goes to background (swipe up to home)
        if #available(iOS 14.2, *) {
            pip.canStartPictureInPictureAutomaticallyFromInline = true
        }
    }
    
    func startPictureInPicture() {
        pipController?.startPictureInPicture()
    }
    
    func stopPictureInPicture() {
        pipController?.stopPictureInPicture()
    }
    
    func isPictureInPictureSupported() -> Bool {
        return AVPictureInPictureController.isPictureInPictureSupported()
    }
    
    func isPictureInPictureActive() -> Bool {
        return pipController?.isPictureInPictureActive ?? false
    }
    
    func setAutoPipEnabled(_ enabled: Bool) {
        if #available(iOS 14.2, *) {
            pipController?.canStartPictureInPictureAutomaticallyFromInline = enabled
        }
    }
    
    // MARK: - Subtitle Controls
    
    func getSubtitleTracks() -> [[String: Any]] {
        var tracks: [[String: Any]] = []
        
        // srtControl.subtitleInfos should contain ALL subtitles KSPlayer knows about
        // (both embedded that were auto-detected and external that were added)
        if let srtControl = playerView?.srtControl {
            let allSubtitles = srtControl.subtitleInfos
            let selectedInfo = srtControl.selectedSubtitleInfo
            
            print("[SfPlayer] getSubtitleTracks - srtControl has \(allSubtitles.count) subtitles")
            
            for (index, info) in allSubtitles.enumerated() {
                let isSelected = selectedInfo?.subtitleID == info.subtitleID
                let trackInfo: [String: Any] = [
                    "id": index + 1,  // 1-based ID
                    "selected": isSelected,
                    "title": info.name,
                    "lang": "",
                    "source": "srtControl"
                ]
                tracks.append(trackInfo)
                print("[SfPlayer]   [\(index + 1)]: \(info.name) (selected: \(isSelected))")
            }
        }
        
        // Also log embedded tracks from player for debugging
        if let player = playerView?.playerLayer?.player {
            let embeddedTracks = player.tracks(mediaType: .subtitle)
            print("[SfPlayer] getSubtitleTracks - player.tracks has \(embeddedTracks.count) embedded tracks")
            for (i, track) in embeddedTracks.enumerated() {
                print("[SfPlayer]   embedded[\(i)]: \(track.name) (enabled: \(track.isEnabled))")
            }
        }
        
        return tracks
    }
    
    func setSubtitleTrack(_ trackId: Int) {
        print("[SfPlayer] setSubtitleTrack called with trackId: \(trackId)")
        
        // Handle disable case
        if trackId < 0 {
            print("[SfPlayer] Disabling subtitles (trackId < 0)")
            disableSubtitles()
            return
        }
        
        guard let player = playerView?.playerLayer?.player,
              let srtControl = playerView?.srtControl else {
            print("[SfPlayer] setSubtitleTrack - player or srtControl not available")
            return
        }
        
        let embeddedTracks = player.tracks(mediaType: .subtitle)
        let index = trackId - 1  // Convert to 0-based
        
        print("[SfPlayer] setSubtitleTrack - embedded tracks: \(embeddedTracks.count), srtControl.subtitleInfos: \(srtControl.subtitleInfos.count), index: \(index)")
        
        // Log all available subtitles for debugging
        print("[SfPlayer] Available in srtControl:")
        for (i, info) in srtControl.subtitleInfos.enumerated() {
            print("[SfPlayer]   [\(i)]: \(info.name)")
        }
        
        // KSPlayer's srtControl might contain all subtitles (embedded + external)
        // Try to find and select the subtitle at the given index in srtControl
        let allSubtitles = srtControl.subtitleInfos
        if index >= 0 && index < allSubtitles.count {
            let subtitleInfo = allSubtitles[index]
            srtControl.selectedSubtitleInfo = subtitleInfo
            playerView?.updateSrt()
            print("[SfPlayer] Selected subtitle from srtControl: \(subtitleInfo.name)")
            return
        }
        
        // Fallback: try selecting embedded track directly via player.select()
        // This handles cases where srtControl doesn't have all embedded tracks
        if index >= 0 && index < embeddedTracks.count {
            let track = embeddedTracks[index]
            player.select(track: track)
            print("[SfPlayer] Fallback: Selected embedded track via player.select(): \(track.name)")
            return
        }
        
        print("[SfPlayer] WARNING: index \(index) out of range")
    }
    
    func disableSubtitles() {
        print("[SfPlayer] disableSubtitles called")
        
        // Clear srtControl selection (handles both embedded and external via srtControl)
        playerView?.srtControl.selectedSubtitleInfo = nil
        playerView?.updateSrt()
        
        // Also disable any embedded tracks selected via player.select()
        if let player = playerView?.playerLayer?.player {
            let subtitleTracks = player.tracks(mediaType: .subtitle)
            for track in subtitleTracks {
                if track.isEnabled {
                    // KSPlayer doesn't have a direct "disable" - selecting a different track would disable this one
                    print("[SfPlayer] Note: embedded track '\(track.name)' is still enabled at decoder level")
                }
            }
        }
    }
    
    func getCurrentSubtitleTrack() -> Int {
        guard let srtControl = playerView?.srtControl,
              let selectedInfo = srtControl.selectedSubtitleInfo else {
            return 0  // No subtitle selected
        }
        
        // Find the selected subtitle in srtControl.subtitleInfos
        let allSubtitles = srtControl.subtitleInfos
        for (index, info) in allSubtitles.enumerated() {
            if info.subtitleID == selectedInfo.subtitleID {
                return index + 1  // 1-based ID
            }
        }
        
        return 0
    }
    
    func addSubtitleFile(url: String, select: Bool) {
        print("[SfPlayer] addSubtitleFile called with url: \(url), select: \(select)")
        guard let subUrl = URL(string: url) else {
            print("[SfPlayer] Failed to create URL from string")
            return
        }
        
        // If player is ready, add directly via srtControl
        if let srtControl = playerView?.srtControl {
            let subtitleInfo = URLSubtitleInfo(url: subUrl)
            srtControl.addSubtitle(info: subtitleInfo)
            print("[SfPlayer] Added subtitle via srtControl: \(subtitleInfo.name)")
            if select {
                srtControl.selectedSubtitleInfo = subtitleInfo
                playerView?.updateSrt()
                print("[SfPlayer] Selected subtitle: \(subtitleInfo.name)")
            }
        } else {
            // Player not ready yet, queue for later
            print("[SfPlayer] Player not ready, queuing subtitle")
            pendingExternalSubtitles.append(url)
        }
    }
    
    // MARK: - Subtitle Positioning
    
    func setSubtitlePosition(_ position: Int) {
        // KSPlayer subtitle positioning through options
    }
    
    func setSubtitleScale(_ scale: Double) {
        subtitleScale = CGFloat(scale)
        applySubtitleScale()
    }
    
    private func applySubtitleScale() {
        guard let subtitleBackView = playerView?.subtitleBackView else { return }
        
        // Apply scale transform to subtitle view
        // This scales both text and image-based subtitles (PGS, VOBSUB)
        subtitleBackView.transform = CGAffineTransform(scaleX: subtitleScale, y: subtitleScale)
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
    
    // MARK: - Video Zoom
    
    func setVideoZoomToFill(_ enabled: Bool) {
        // Toggle between fit (black bars) and fill (crop to fill screen)
        let contentMode: UIView.ContentMode = enabled ? .scaleAspectFill : .scaleAspectFit
        playerView?.playerLayer?.player.view?.contentMode = contentMode
    }
    
    func getVideoZoomToFill() -> Bool {
        return playerView?.playerLayer?.player.view?.contentMode == .scaleAspectFill
    }
    
    // MARK: - Layout
    
    func updateLayout(bounds: CGRect) {
        containerView?.layoutIfNeeded()
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
            
            // Center video content - KSAVPlayerView maps contentMode to videoGravity
            playerView?.playerLayer?.player.view?.contentMode = .scaleAspectFit
            
            // Apply subtitle scale for image-based subtitles (PGS, VOBSUB)
            applySubtitleScale()
            
            // Setup PiP controller with delegate
            setupPictureInPicture()
            
            // Add embedded subtitles from player to srtControl
            // This makes them available for selection and rendering via srtControl
            if let player = playerView?.playerLayer?.player,
               let subtitleDataSource = player.subtitleDataSouce {
                print("[SfPlayer] Adding embedded subtitles from player.subtitleDataSouce")
                playerView?.srtControl.addSubtitle(dataSouce: subtitleDataSource)
            }
            
            // Load pending external subtitles via srtControl
            print("[SfPlayer] readyToPlay - Loading \(pendingExternalSubtitles.count) external subtitles")
            for subUrlString in pendingExternalSubtitles {
                print("[SfPlayer] Adding external subtitle: \(subUrlString)")
                if let subUrl = URL(string: subUrlString) {
                    let subtitleInfo = URLSubtitleInfo(url: subUrl)
                    playerView?.srtControl.addSubtitle(info: subtitleInfo)
                    print("[SfPlayer] Added subtitle info: \(subtitleInfo.name)")
                } else {
                    print("[SfPlayer] Failed to create URL from: \(subUrlString)")
                }
            }
            pendingExternalSubtitles.removeAll()
            
            // Log all available subtitles in srtControl
            let allSubtitles = playerView?.srtControl.subtitleInfos ?? []
            print("[SfPlayer] srtControl now has \(allSubtitles.count) subtitles:")
            for (i, info) in allSubtitles.enumerated() {
                print("[SfPlayer]   [\(i)]: \(info.name)")
            }
            
            // Also log embedded tracks from player for reference
            let embeddedTracks = playerView?.playerLayer?.player.tracks(mediaType: .subtitle) ?? []
            print("[SfPlayer] player.tracks has \(embeddedTracks.count) embedded tracks")
            
            // Apply initial track selection
            print("[SfPlayer] Applying initial track selections - subId: \(String(describing: initialSubtitleId)), audioId: \(String(describing: initialAudioId))")
            if let subId = initialSubtitleId {
                if subId < 0 {
                    print("[SfPlayer] Disabling subtitles (subId < 0)")
                    disableSubtitles()
                } else {
                    print("[SfPlayer] Setting subtitle track to: \(subId)")
                    setSubtitleTrack(subId)
                }
            }
            if let audioId = initialAudioId {
                print("[SfPlayer] Setting audio track to: \(audioId)")
                setAudioTrack(audioId)
            }
            
            // Debug: Check selected subtitle after applying
            if let selectedSub = playerView?.srtControl.selectedSubtitleInfo {
                print("[SfPlayer] Currently selected subtitle: \(selectedSub.name)")
            } else {
                print("[SfPlayer] No subtitle currently selected in srtControl")
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

// MARK: - AVPictureInPictureControllerDelegate

extension SfPlayerWrapper: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        delegate?.player(self, didChangePictureInPicture: true)
    }
    
    func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        delegate?.player(self, didChangePictureInPicture: false)
    }
    
    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
        delegate?.player(self, didEncounterError: "PiP failed: \(error.localizedDescription)")
    }
    
    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
        // Called when user taps to restore from PiP - return true to allow restoration
        completionHandler(true)
    }
}
