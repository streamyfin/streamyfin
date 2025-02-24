import ExpoModulesCore
import UIKit
import VLCKit
import os


public class VLCPlayerView: UIView {
    func setupView(parent: UIView) {
        self.backgroundColor = .black
        self.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            self.leadingAnchor.constraint(equalTo: parent.leadingAnchor),
            self.trailingAnchor.constraint(equalTo: parent.trailingAnchor),
            self.topAnchor.constraint(equalTo: parent.topAnchor),
            self.bottomAnchor.constraint(equalTo: parent.bottomAnchor),
        ])
    }

    public override func layoutSubviews() {
        super.layoutSubviews()

        for subview in subviews {
            subview.frame = bounds
        }
    }
}

class VLCPlayerWrapper: NSObject {
    private var lastProgressCall = Date().timeIntervalSince1970
    public var player: VLCMediaPlayer = VLCMediaPlayer()
    private var updatePlayerState: (() -> Void)?
    private var updateVideoProgress: (() -> Void)?
    private var playerView: VLCPlayerView = VLCPlayerView()
    public weak var pipController: VLCPictureInPictureWindowControlling?

    override public init() {
        super.init()
        player.delegate = self
        player.drawable = self
        player.scaleFactor = 0
    }

    public func setup(
        parent: UIView,
        updatePlayerState: (() -> Void)?,
        updateVideoProgress: (() -> Void)?
    ) {
        self.updatePlayerState = updatePlayerState
        self.updateVideoProgress = updateVideoProgress

        player.delegate = self
        parent.addSubview(playerView)
        playerView.setupView(parent: parent)
    }

    public func getPlayerView() -> UIView {
        return playerView
    }
}

// MARK: - VLCPictureInPictureDrawable
extension VLCPlayerWrapper: VLCPictureInPictureDrawable {
    public func mediaController() -> (any VLCPictureInPictureMediaControlling)! {
        return self
    }

    public func pictureInPictureReady() -> (((any VLCPictureInPictureWindowControlling)?) -> Void)!
    {
        return { [weak self] controller in
            self?.pipController = controller
        }
    }
}

// MARK: - VLCPictureInPictureMediaControlling
extension VLCPlayerWrapper: VLCPictureInPictureMediaControlling {
    func mediaTime() -> Int64 {
        return player.time.value?.int64Value ?? 0
    }

    func mediaLength() -> Int64 {
        return player.media?.length.value?.int64Value ?? 0
    }

    func play() {
        player.play()
    }

    func pause() {
        player.pause()
    }

    func seek(by offset: Int64, completion: @escaping () -> Void) {
        player.jump(withOffset: Int32(offset), completion: completion)
    }

    func isMediaSeekable() -> Bool {
        return player.isSeekable
    }

    func isMediaPlaying() -> Bool {
        return player.isPlaying
    }
}

// MARK: - VLCDrawable
extension VLCPlayerWrapper: VLCDrawable {
    public func addSubview(_ view: UIView) {
        playerView.addSubview(view)
    }

    public func bounds() -> CGRect {
        return playerView.bounds
    }
}

// MARK: - VLCMediaPlayerDelegate
extension VLCPlayerWrapper: VLCMediaPlayerDelegate {
    func mediaPlayerTimeChanged(_ aNotification: Notification) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let timeNow = Date().timeIntervalSince1970
            if timeNow - self.lastProgressCall >= 1 {
                self.lastProgressCall = timeNow
                self.updateVideoProgress?()
            }
        }
    }

    func mediaPlayerStateChanged(_ state: VLCMediaPlayerState) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.updatePlayerState?()

            guard let pipController = self.pipController else { return }
            pipController.invalidatePlaybackState()
        }
    }
}

// MARK: - VLCMediaDelegate
extension VLCPlayerWrapper: VLCMediaDelegate {
    // Implement VLCMediaDelegate methods if needed
}

class VlcPlayerView: ExpoView {
    let logger = Logger(subsystem: Bundle.main.bundleIdentifier!, category: "VlcPlayerView")

    private var vlc: VLCPlayerWrapper = VLCPlayerWrapper()
    private var progressUpdateInterval: TimeInterval = 1.0  // Update interval set to 1 second
    private var isPaused: Bool = false
    private var customSubtitles: [(internalName: String, originalName: String)] = []
    private var startPosition: Int32 = 0
    private var externalTrack: [String: String]?
    private var isStopping: Bool = false  // Define isStopping here
    private var externalSubtitles: [[String: String]]?
    var hasSource = false

    // MARK: - Initialization
    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        setupVLC()
        setupNotifications()
        VLCManager.shared.listeners.append(self)
    }

    // MARK: - Setup
    private func setupVLC() {
        vlc.setup(
            parent: self,
            updatePlayerState: updatePlayerState,
            updateVideoProgress: updateVideoProgress
        )
    }

    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(applicationWillResignActive),
            name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    // MARK: - Public Methods
    func startPictureInPicture() {
        self.vlc.pipController?.stateChangeEventHandler = { (isStarted: Bool) in
            self.onPipStarted?(["pipStarted": isStarted])
        }
        self.vlc.pipController?.startPictureInPicture()
    }

    @objc func play() {
        self.vlc.player.play()
        self.isPaused = false
        logger.debug("Play")
    }

    @objc func pause() {
        self.vlc.player.pause()
        self.isPaused = true
    }

    @objc func seekTo(_ time: Int32) {
        let wasPlaying = vlc.player.isPlaying
        if wasPlaying {
            self.pause()
        }

        if let duration = vlc.player.media?.length.intValue {
            logger.debug("Seeking to time: \(time) Video Duration \(duration)")

            // If the specified time is greater than the duration, seek to the end
            let seekTime = time > duration ? duration - 1000 : time
            vlc.player.time = VLCTime(int: seekTime)
            self.updatePlayerState()

            // Let mediaPlayerStateChanged handle play state change
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                if wasPlaying {
                    self.play()
                }
            }
        } else {
            logger.error("Unable to retrieve video duration")
        }
    }

    @objc func setSource(_ source: [String: Any]) {
        logger.debug("Setting source...")
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.hasSource {
                return
            }

            var mediaOptions = source["mediaOptions"] as? [String: Any] ?? [:]
            self.externalTrack = source["externalTrack"] as? [String: String]
            let initOptions: [String] = source["initOptions"] as? [String] ?? []
            self.startPosition = source["startPosition"] as? Int32 ?? 0
            self.externalSubtitles = source["externalSubtitles"] as? [[String: String]]

            for item in initOptions {
                let option = item.components(separatedBy: "=")
                mediaOptions.updateValue(
                    option[1], forKey: option[0].replacingOccurrences(of: "--", with: ""))
            }

            guard let uri = source["uri"] as? String, !uri.isEmpty else {
                logger.error("Invalid or empty URI")
                self.onVideoError?(["error": "Invalid or empty URI"])
                return
            }

            let autoplay = source["autoplay"] as? Bool ?? false
            let isNetwork = source["isNetwork"] as? Bool ?? false

            self.onVideoLoadStart?(["target": self.reactTag ?? NSNull()])

            let media: VLCMedia!
            if isNetwork {
                logger.debug("Loading network file: \(uri)")
                media = VLCMedia(url: URL(string: uri)!)
            } else {
                logger.debug("Loading local file: \(uri)")
                if uri.starts(with: "file://"), let url = URL(string: uri) {
                    media = VLCMedia(url: url)
                } else {
                    media = VLCMedia(path: uri)
                }
            }

            logger.debug("Media options: \(mediaOptions)")
            media.addOptions(mediaOptions)

            self.vlc.player.media = media
            self.setInitialExternalSubtitles()
            self.hasSource = true
            if autoplay {
                logger.info("Playing...")
                self.play()
                self.vlc.player.time = VLCTime(number: NSNumber(value: self.startPosition * 1000))
            }
        }
    }

    @objc func setAudioTrack(_ trackIndex: Int) {
        print("Setting audio track: \(trackIndex)")
        let track = self.vlc.player.audioTracks[trackIndex]
        track.isSelectedExclusively = true
    }

    @objc func getAudioTracks() -> [[String: Any]]? {
        return vlc.player.audioTracks.enumerated().map {
            return ["name": $1.trackName, "index": $0]
        }
    }

    @objc func setSubtitleTrack(_ trackIndex: Int) {
        logger.debug("Attempting to set subtitle track to index: \(trackIndex)")
        if trackIndex == -1 {
            logger.debug("Disabling all subtitles")
            for track in self.vlc.player.textTracks {
                track.isSelected = false
            }
            return
        }
        let track = self.vlc.player.textTracks[trackIndex]
        track.isSelectedExclusively = true;
        logger.debug("Current subtitle track index after setting: \(track.trackName)")
    }

    @objc func setSubtitleURL(_ subtitleURL: String, name: String) {
        guard let url = URL(string: subtitleURL) else {
            logger.error("Invalid subtitle URL")
            return
        }
        let result = self.vlc.player.addPlaybackSlave(url, type: .subtitle, enforce: false)
        if result == 0 {
            let internalName = "Track \(self.customSubtitles.count)"
            self.customSubtitles.append((internalName: internalName, originalName: name))
            logger.debug("Subtitle added with result: \(result) \(internalName)")
        } else {
            logger.debug("Failed to add subtitle")
        }
    }

    @objc func getSubtitleTracks() -> [[String: Any]]? {
        if self.vlc.player.textTracks.count == 0 {
            return nil
        }

        logger.debug("Number of subtitle tracks: \(self.vlc.player.textTracks.count)")

        let tracks = self.vlc.player.textTracks.enumerated().map { (index, track) in
            if let customSubtitle = customSubtitles.first(where: {
                $0.internalName == track.trackName
            }) {
                return ["name": customSubtitle.originalName, "index": index]
            } else {
                return ["name": track.trackName, "index": index]
            }
        }

       logger.debug("Subtitle tracks: \(tracks)")
       return tracks
    }

    @objc func stop(completion: (() -> Void)? = nil) {
        logger.debug("Stopping media...")
        guard !isStopping else {
            completion?()
            return
        }
        isStopping = true

        // If we're not on the main thread, dispatch to main thread
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in
                self?.performStop(completion: completion)
            }
        } else {
            performStop(completion: completion)
        }
    }

    // MARK: - Private Methods

    @objc private func applicationWillResignActive() {

    }

    @objc private func applicationDidBecomeActive() {

    }

    private func setInitialExternalSubtitles() {
        if let externalSubtitles = self.externalSubtitles {
            for subtitle in externalSubtitles {
                if let subtitleName = subtitle["name"],
                    let subtitleURL = subtitle["DeliveryUrl"]
                {
                    print("Setting external subtitle: \(subtitleName) \(subtitleURL)")
                    self.setSubtitleURL(subtitleURL, name: subtitleName)
                }
            }
        }
    }

    private func performStop(completion: (() -> Void)? = nil) {
        // Stop the media player
        vlc.player.stop()

        // Remove observer
        NotificationCenter.default.removeObserver(self)

        // Clear the video view
        vlc.getPlayerView().removeFromSuperview()

        isStopping = false
        completion?()
    }

    private func updateVideoProgress() {
        guard self.vlc.player.media != nil else { return }

        let currentTimeMs = self.vlc.player.time.intValue
        let durationMs = self.vlc.player.media?.length.intValue ?? 0

        logger.debug("Current time: \(currentTimeMs)")
        self.onVideoProgress?([
            "currentTime": currentTimeMs,
            "duration": durationMs,
        ])
    }

    private func updatePlayerState() {
        let player = self.vlc.player
        self.onVideoStateChange?([
            "target": self.reactTag ?? NSNull(),
            "currentTime": player.time.intValue,
            "duration": player.media?.length.intValue ?? 0,
            "error": false,
            "isPlaying": player.isPlaying,
            "isBuffering": !player.isPlaying && player.state == VLCMediaPlayerState.buffering,
            "state": player.state.description,
        ])
    }

    // MARK: - Expo Events
    @objc var onPlaybackStateChanged: RCTDirectEventBlock?
    @objc var onVideoLoadStart: RCTDirectEventBlock?
    @objc var onVideoStateChange: RCTDirectEventBlock?
    @objc var onVideoProgress: RCTDirectEventBlock?
    @objc var onVideoLoadEnd: RCTDirectEventBlock?
    @objc var onVideoError: RCTDirectEventBlock?
    @objc var onPipStarted: RCTDirectEventBlock?

    // MARK: - Deinitialization

    deinit {
        logger.debug("Deinitialization")
        performStop()
        VLCManager.shared.listeners.removeAll()
    }
}

// MARK: - SimpleAppLifecycleListener
extension VlcPlayerView: SimpleAppLifecycleListener {
    func applicationDidEnterBackground() {
        logger.debug("Entering background")
    }

    func applicationDidEnterForeground() {
        logger.debug("Entering foreground, is player visible? \(self.vlc.getPlayerView().superview != nil)")
        if !self.vlc.getPlayerView().isDescendant(of: self) {
            logger.debug("Player view is missing. Adding back as subview")
            self.addSubview(self.vlc.getPlayerView())
        }

        // Current solution to fixing black screen when re-entering application
        if let videoTrack = self.vlc.player.videoTracks.first(where: { $0.isSelected == true }),
            !self.vlc.isMediaPlaying()
        {
            videoTrack.isSelected = false
            videoTrack.isSelectedExclusively = true
            self.vlc.player.play()
            self.vlc.player.pause()
        }
    }
}

extension VLCMediaPlayerState {
    var description: String {
        switch self {
        case .opening: return "Opening"
        case .buffering: return "Buffering"
        case .playing: return "Playing"
        case .paused: return "Paused"
        case .stopped: return "Stopped"
        case .error: return "Error"
        case .stopping: return "Stopping"
        @unknown default: return "Unknown"
        }
    }
}
