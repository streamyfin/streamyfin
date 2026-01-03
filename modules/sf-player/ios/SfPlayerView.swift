import AVFoundation
import ExpoModulesCore
import UIKit

class SfPlayerView: ExpoView {
    private var player: SfPlayerWrapper?
    private var videoContainer: UIView!
    
    let onLoad = EventDispatcher()
    let onPlaybackStateChange = EventDispatcher()
    let onProgress = EventDispatcher()
    let onError = EventDispatcher()
    let onTracksReady = EventDispatcher()
    let onPictureInPictureChange = EventDispatcher()
    
    private var currentURL: URL?
    private var cachedPosition: Double = 0
    private var cachedDuration: Double = 0
    private var intendedPlayState: Bool = false
    
    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        setupView()
    }
    
    private func setupView() {
        clipsToBounds = true
        backgroundColor = .black
        
        videoContainer = UIView()
        videoContainer.translatesAutoresizingMaskIntoConstraints = false
        videoContainer.backgroundColor = .black
        videoContainer.clipsToBounds = true
        addSubview(videoContainer)
        
        NSLayoutConstraint.activate([
            videoContainer.topAnchor.constraint(equalTo: topAnchor),
            videoContainer.leadingAnchor.constraint(equalTo: leadingAnchor),
            videoContainer.trailingAnchor.constraint(equalTo: trailingAnchor),
            videoContainer.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
        
        // Initialize player
        player = SfPlayerWrapper()
        player?.delegate = self
        
        // Configure Audio Session for PiP and background playback
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)
        
        // Add player view to container
        if let playerView = player?.view {
            playerView.translatesAutoresizingMaskIntoConstraints = false
            videoContainer.addSubview(playerView)
            NSLayoutConstraint.activate([
                playerView.topAnchor.constraint(equalTo: videoContainer.topAnchor),
                playerView.leadingAnchor.constraint(equalTo: videoContainer.leadingAnchor),
                playerView.trailingAnchor.constraint(equalTo: videoContainer.trailingAnchor),
                playerView.bottomAnchor.constraint(equalTo: videoContainer.bottomAnchor)
            ])
        }
    }
    
    override func layoutSubviews() {
        super.layoutSubviews()
        player?.updateLayout(bounds: videoContainer.bounds)
    }
    
    // MARK: - Video Loading
    
    func loadVideo(config: VideoLoadConfig) {
        // Skip reload if same URL is already playing
        if currentURL == config.url {
            return
        }
        currentURL = config.url
        
        player?.load(config: config)
        
        if config.autoplay {
            play()
        }
        
        onLoad(["url": config.url.absoluteString])
    }
    
    func loadVideo(url: URL, headers: [String: String]? = nil) {
        loadVideo(config: VideoLoadConfig(url: url, headers: headers))
    }
    
    // MARK: - Playback Controls
    
    func play() {
        intendedPlayState = true
        player?.play()
    }
    
    func pause() {
        intendedPlayState = false
        player?.pause()
    }
    
    func seekTo(position: Double) {
        player?.seek(to: position)
    }
    
    func seekBy(offset: Double) {
        player?.seek(by: offset)
    }
    
    func setSpeed(speed: Double) {
        player?.setSpeed(speed)
    }
    
    func getSpeed() -> Double {
        return player?.getSpeed() ?? 1.0
    }
    
    func isPaused() -> Bool {
        return player?.getIsPaused() ?? true
    }
    
    func getCurrentPosition() -> Double {
        return cachedPosition
    }
    
    func getDuration() -> Double {
        return cachedDuration
    }
    
    // MARK: - Picture in Picture
    
    func startPictureInPicture() {
        player?.startPictureInPicture()
    }
    
    func stopPictureInPicture() {
        player?.stopPictureInPicture()
    }
    
    func isPictureInPictureSupported() -> Bool {
        return player?.isPictureInPictureSupported() ?? false
    }
    
    func isPictureInPictureActive() -> Bool {
        return player?.isPictureInPictureActive() ?? false
    }
    
    func setAutoPipEnabled(_ enabled: Bool) {
        player?.setAutoPipEnabled(enabled)
    }
    
    // MARK: - Subtitle Controls
    
    func getSubtitleTracks() -> [[String: Any]] {
        return player?.getSubtitleTracks() ?? []
    }
    
    func setSubtitleTrack(_ trackId: Int) {
        player?.setSubtitleTrack(trackId)
    }
    
    func disableSubtitles() {
        player?.disableSubtitles()
    }
    
    func getCurrentSubtitleTrack() -> Int {
        return player?.getCurrentSubtitleTrack() ?? 0
    }
    
    func addSubtitleFile(url: String, select: Bool = true) {
        player?.addSubtitleFile(url: url, select: select)
    }
    
    // MARK: - Subtitle Positioning
    
    func setSubtitlePosition(_ position: Int) {
        player?.setSubtitlePosition(position)
    }
    
    func setSubtitleScale(_ scale: Double) {
        player?.setSubtitleScale(scale)
    }
    
    func setSubtitleMarginY(_ margin: Int) {
        player?.setSubtitleMarginY(margin)
    }
    
    func setSubtitleAlignX(_ alignment: String) {
        player?.setSubtitleAlignX(alignment)
    }
    
    func setSubtitleAlignY(_ alignment: String) {
        player?.setSubtitleAlignY(alignment)
    }
    
    func setSubtitleFontSize(_ size: Int) {
        player?.setSubtitleFontSize(size)
    }
    
    func setSubtitleColor(_ hexColor: String) {
        player?.setSubtitleColor(hexColor)
    }
    
    func setSubtitleBackgroundColor(_ hexColor: String) {
        player?.setSubtitleBackgroundColor(hexColor)
    }

    func setSubtitleFontName(_ fontName: String) {
        player?.setSubtitleFontName(fontName)
    }
    
    // MARK: - Hardware Decode (static, affects all players)
    
    static func setHardwareDecode(_ enabled: Bool) {
        SfPlayerWrapper.setHardwareDecode(enabled)
    }
    
    static func getHardwareDecode() -> Bool {
        return SfPlayerWrapper.getHardwareDecode()
    }
    
    // MARK: - Audio Track Controls
    
    func getAudioTracks() -> [[String: Any]] {
        return player?.getAudioTracks() ?? []
    }
    
    func setAudioTrack(_ trackId: Int) {
        player?.setAudioTrack(trackId)
    }
    
    func getCurrentAudioTrack() -> Int {
        return player?.getCurrentAudioTrack() ?? 0
    }
    
    // MARK: - Video Zoom
    
    func setVideoZoomToFill(_ enabled: Bool) {
        player?.setVideoZoomToFill(enabled)
    }
    
    func getVideoZoomToFill() -> Bool {
        return player?.getVideoZoomToFill() ?? false
    }
    
    deinit {
        player?.stopPictureInPicture()
    }
}

// MARK: - SfPlayerWrapperDelegate

extension SfPlayerView: SfPlayerWrapperDelegate {
    func player(_ player: SfPlayerWrapper, didUpdatePosition position: Double, duration: Double) {
        cachedPosition = position
        cachedDuration = duration
        
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.onProgress([
                "position": position,
                "duration": duration,
                "progress": duration > 0 ? position / duration : 0,
            ])
        }
    }
    
    func player(_ player: SfPlayerWrapper, didChangePause isPaused: Bool) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.onPlaybackStateChange([
                "isPaused": isPaused,
                "isPlaying": !isPaused,
            ])
        }
    }
    
    func player(_ player: SfPlayerWrapper, didChangeLoading isLoading: Bool) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.onPlaybackStateChange([
                "isLoading": isLoading,
            ])
        }
    }
    
    func player(_ player: SfPlayerWrapper, didBecomeReadyToSeek: Bool) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.onPlaybackStateChange([
                "isReadyToSeek": didBecomeReadyToSeek,
            ])
        }
    }
    
    func player(_ player: SfPlayerWrapper, didBecomeTracksReady: Bool) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.onTracksReady([:])
        }
    }
    
    func player(_ player: SfPlayerWrapper, didEncounterError error: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.onError(["error": error])
        }
    }
    
    func player(_ player: SfPlayerWrapper, didChangePictureInPicture isActive: Bool) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.onPictureInPictureChange(["isActive": isActive])
        }
    }
}
