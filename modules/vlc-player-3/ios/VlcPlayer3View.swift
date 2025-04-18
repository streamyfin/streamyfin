import ExpoModulesCore
import UIKit

#if os(tvOS)
    import TVVLCKit
#else
    import MobileVLCKit
#endif

class VlcPlayer3View: ExpoView {
    private var mediaPlayer: VLCMediaPlayer?
    private var videoView: UIView?
    private var progressUpdateInterval: TimeInterval = 1.0  // Update interval set to 1 second
    private var isPaused: Bool = false
    private var currentGeometryCString: [CChar]?
    private var lastReportedState: VLCMediaPlayerState?
    private var lastReportedIsPlaying: Bool?
    private var customSubtitles: [(internalName: String, originalName: String)] = []
    private var startPosition: Int32 = 0
    private var externalSubtitles: [[String: String]]?
    private var externalTrack: [String: String]?
    private var progressTimer: DispatchSourceTimer?
    private var isStopping: Bool = false  // Define isStopping here
    private var lastProgressCall = Date().timeIntervalSince1970
    var hasSource = false

    // MARK: - Initialization

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        setupView()
        setupNotifications()
    }

    // MARK: - Setup

    private func setupView() {
        DispatchQueue.main.async {
            self.backgroundColor = .black
            self.videoView = UIView()
            self.videoView?.translatesAutoresizingMaskIntoConstraints = false

            if let videoView = self.videoView {
                self.addSubview(videoView)
                NSLayoutConstraint.activate([
                    videoView.leadingAnchor.constraint(equalTo: self.leadingAnchor),
                    videoView.trailingAnchor.constraint(equalTo: self.trailingAnchor),
                    videoView.topAnchor.constraint(equalTo: self.topAnchor),
                    videoView.bottomAnchor.constraint(equalTo: self.bottomAnchor),
                ])
            }
        }
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
    func startPictureInPicture() {}

    @objc func play() {
        self.mediaPlayer?.play()
        self.isPaused = false
        print("Play")
    }

    @objc func pause() {
        self.mediaPlayer?.pause()
        self.isPaused = true
    }

    @objc func seekTo(_ time: Int32) {
        guard let player = self.mediaPlayer else { return }

        let wasPlaying = player.isPlaying
        if wasPlaying {
            self.pause()
        }

        if let duration = player.media?.length.intValue {
            print("Seeking to time: \(time) Video Duration \(duration)")

            // If the specified time is greater than the duration, seek to the end
            let seekTime = time > duration ? duration - 1000 : time
            player.time = VLCTime(int: seekTime)

            if wasPlaying {
                self.play()
            }
            self.updatePlayerState()
        } else {
            print("Error: Unable to retrieve video duration")
        }
    }

    @objc func setSource(_ source: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.hasSource {
                return
            }

            let mediaOptions = source["mediaOptions"] as? [String: Any] ?? [:]
            self.externalTrack = source["externalTrack"] as? [String: String]
            var initOptions = source["initOptions"] as? [Any] ?? []
            self.startPosition = source["startPosition"] as? Int32 ?? 0
            self.externalSubtitles = source["externalSubtitles"] as? [[String: String]]
            initOptions.append("--start-time=\(self.startPosition)")

            guard let uri = source["uri"] as? String, !uri.isEmpty else {
                print("Error: Invalid or empty URI")
                self.onVideoError?(["error": "Invalid or empty URI"])
                return
            }

            let autoplay = source["autoplay"] as? Bool ?? false
            let isNetwork = source["isNetwork"] as? Bool ?? false

            self.onVideoLoadStart?(["target": self.reactTag ?? NSNull()])
            self.mediaPlayer = VLCMediaPlayer(options: initOptions)
            self.mediaPlayer?.delegate = self
            self.mediaPlayer?.drawable = self.videoView
            self.mediaPlayer?.scaleFactor = 0

            let media: VLCMedia
            if isNetwork {
                print("Loading network file: \(uri)")
                media = VLCMedia(url: URL(string: uri)!)
            } else {
                print("Loading local file: \(uri)")
                if uri.starts(with: "file://"), let url = URL(string: uri) {
                    media = VLCMedia(url: url)
                } else {
                    media = VLCMedia(path: uri)
                }
            }

            print("Debug: Media options: \(mediaOptions)")
            media.addOptions(mediaOptions)

            self.mediaPlayer?.media = media
            self.setInitialExternalSubtitles()
            self.hasSource = true
            if autoplay {
                print("Playing...")
                self.play()
            }
        }
    }

    @objc func setAudioTrack(_ trackIndex: Int) {
        self.mediaPlayer?.currentAudioTrackIndex = Int32(trackIndex)
    }

    @objc func getAudioTracks() -> [[String: Any]]? {
        guard let trackNames = mediaPlayer?.audioTrackNames,
            let trackIndexes = mediaPlayer?.audioTrackIndexes
        else {
            return nil
        }

        return zip(trackNames, trackIndexes).map { name, index in
            return ["name": name, "index": index]
        }
    }

    @objc func setSubtitleTrack(_ trackIndex: Int) {
        print("Debug: Attempting to set subtitle track to index: \(trackIndex)")
        self.mediaPlayer?.currentVideoSubTitleIndex = Int32(trackIndex)
        print(
            "Debug: Current subtitle track index after setting: \(self.mediaPlayer?.currentVideoSubTitleIndex ?? -1)"
        )
    }

    @objc func setSubtitleURL(_ subtitleURL: String, name: String) {
        guard let url = URL(string: subtitleURL) else {
            print("Error: Invalid subtitle URL")
            return
        }

        let result = self.mediaPlayer?.addPlaybackSlave(url, type: .subtitle, enforce: false)
        if let result = result {
            let internalName = "Track \(self.customSubtitles.count)"
            print("Subtitle added with result: \(result) \(internalName)")
            self.customSubtitles.append((internalName: internalName, originalName: name))
        } else {
            print("Failed to add subtitle")
        }
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

    @objc func getSubtitleTracks() -> [[String: Any]]? {
        guard let mediaPlayer = self.mediaPlayer else {
            return nil
        }

        let count = mediaPlayer.numberOfSubtitlesTracks
        print("Debug: Number of subtitle tracks: \(count)")

        guard count > 0 else {
            return nil
        }

        var tracks: [[String: Any]] = []

        if let names = mediaPlayer.videoSubTitlesNames as? [String],
            let indexes = mediaPlayer.videoSubTitlesIndexes as? [NSNumber]
        {
            for (index, name) in zip(indexes, names) {
                if let customSubtitle = customSubtitles.first(where: { $0.internalName == name }) {
                    tracks.append(["name": customSubtitle.originalName, "index": index.intValue])
                } else {
                    tracks.append(["name": name, "index": index.intValue])
                }
            }
        }

        print("Debug: Subtitle tracks: \(tracks)")
        return tracks
    }

    @objc func stop(completion: (() -> Void)? = nil) {
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

    private func performStop(completion: (() -> Void)? = nil) {
        // Stop the media player
        mediaPlayer?.stop()

        // Remove observer
        NotificationCenter.default.removeObserver(self)

        // Clear the video view
        videoView?.removeFromSuperview()
        videoView = nil

        // Release the media player
        mediaPlayer?.delegate = nil
        mediaPlayer = nil

        isStopping = false
        completion?()
    }

    private func updateVideoProgress() {
        guard let player = self.mediaPlayer else { return }

        let currentTimeMs = player.time.intValue
        let durationMs = player.media?.length.intValue ?? 0

        print("Debug: Current time: \(currentTimeMs)")
        if currentTimeMs >= 0 && currentTimeMs < durationMs {
            self.onVideoProgress?([
                "currentTime": currentTimeMs,
                "duration": durationMs,
            ])
        }
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
        performStop()
    }
}

extension VlcPlayer3View: VLCMediaPlayerDelegate {
    func mediaPlayerTimeChanged(_ aNotification: Notification) {
        // self?.updateVideoProgress()
        let timeNow = Date().timeIntervalSince1970
        if timeNow - lastProgressCall >= 1 {
            lastProgressCall = timeNow
            updateVideoProgress()
        }
    }

    func mediaPlayerStateChanged(_ aNotification: Notification) {
        self.updatePlayerState()
    }

    private func updatePlayerState() {
        guard let player = self.mediaPlayer else { return }
        let currentState = player.state

        var stateInfo: [String: Any] = [
            "target": self.reactTag ?? NSNull(),
            "currentTime": player.time.intValue,
            "duration": player.media?.length.intValue ?? 0,
            "error": false,
        ]

        if player.isPlaying {
            stateInfo["isPlaying"] = true
            stateInfo["isBuffering"] = false
            stateInfo["state"] = "Playing"
        } else {
            stateInfo["isPlaying"] = false
            stateInfo["state"] = "Paused"
        }

        if player.state == VLCMediaPlayerState.buffering {
            stateInfo["isBuffering"] = true
            stateInfo["state"] = "Buffering"
        } else if player.state == VLCMediaPlayerState.error {
            print("player.state ~ error")
            stateInfo["state"] = "Error"
            self.onVideoLoadEnd?(stateInfo)
        } else if player.state == VLCMediaPlayerState.opening {
            print("player.state ~ opening")
            stateInfo["state"] = "Opening"
        }

        if self.lastReportedState != currentState
            || self.lastReportedIsPlaying != player.isPlaying
        {
            self.lastReportedState = currentState
            self.lastReportedIsPlaying = player.isPlaying
            self.onVideoStateChange?(stateInfo)
        }

    }
}

extension VlcPlayer3View: VLCMediaDelegate {
    // Implement VLCMediaDelegate methods if needed
}

extension VLCMediaPlayerState {
    var description: String {
        switch self {
        case .opening: return "Opening"
        case .buffering: return "Buffering"
        case .playing: return "Playing"
        case .paused: return "Paused"
        case .stopped: return "Stopped"
        case .ended: return "Ended"
        case .error: return "Error"
        case .esAdded: return "ESAdded"
        @unknown default: return "Unknown"
        }
    }
}
