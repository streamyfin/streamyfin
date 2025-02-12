import ExpoModulesCore
import VLCKit
import UIKit


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
    private var updatePlayerState: (() -> ())?
    private var updateVideoProgress: (() -> ())?
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
        updatePlayerState: (() -> ())?,
        updateVideoProgress: (() -> ())?
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

    public func pictureInPictureReady() -> (((any VLCPictureInPictureWindowControlling)?) -> Void)! {
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

    func seek(by offset: Int64, completion: @escaping () -> ()) {
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
        let timeNow = Date().timeIntervalSince1970
        if timeNow - lastProgressCall >= 1 {
            lastProgressCall = timeNow
            updateVideoProgress?()
        }
    }

    func mediaPlayerStateChanged(_ state: VLCMediaPlayerState) {
        self.updatePlayerState?()

        guard let pipController = self.pipController else { return }
        DispatchQueue.main.async(execute: {
            pipController.invalidatePlaybackState()
        })
    }
}

// MARK: - VLCMediaDelegate
extension VLCPlayerWrapper: VLCMediaDelegate {
    // Implement VLCMediaDelegate methods if needed
}


class VlcPlayerView: ExpoView {
    private var vlc: VLCPlayerWrapper = VLCPlayerWrapper()
    private var progressUpdateInterval: TimeInterval = 1.0  // Update interval set to 1 second
    private var isPaused: Bool = false
    private var customSubtitles: [(internalName: String, originalName: String)] = []
    private var startPosition: Int32 = 0
    private var isMediaReady: Bool = false
    private var externalTrack: [String: String]?
    private var isStopping: Bool = false  // Define isStopping here
    var hasSource = false

    // MARK: - Initialization
    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        setupVLC()
        setupView()
        setupNotifications()
    }

    // MARK: - Setup
    private func setupVLC() {
        vlc.setup(
            parent: self,
            updatePlayerState: updatePlayerState,
            updateVideoProgress: updateVideoProgress
        )
    }

    private func setupView() {
        DispatchQueue.main.async {
            self.addSubview(self.vlc.getPlayerView())
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
    func startPictureInPicture() {
        self.vlc.pipController?.stateChangeEventHandler = { (isStarted: Bool) in
            self.onPipStarted?(["pipStarted": isStarted])
        }
        self.vlc.pipController?.startPictureInPicture()
    }

    @objc func play() {
        self.vlc.player.play()
        self.isPaused = false
        print("Play")
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
            print("Seeking to time: \(time) Video Duration \(duration)")

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
            print("Error: Unable to retrieve video duration")
        }
    }

    @objc func setSource(_ source: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.hasSource {
                return
            }

            var mediaOptions = source["mediaOptions"] as? [String: Any] ?? [:]
            self.externalTrack = source["externalTrack"] as? [String: String]
            let initOptions: [String] = source["initOptions"] as? [String] ?? []
            self.startPosition = source["startPosition"] as? Int32 ?? 0

            for item in initOptions {
                let option = item.components(separatedBy: "=")
                mediaOptions.updateValue(option[1], forKey: option[0].replacingOccurrences(of: "--", with: ""))
            }

            guard let uri = source["uri"] as? String, !uri.isEmpty else {
                print("Error: Invalid or empty URI")
                self.onVideoError?(["error": "Invalid or empty URI"])
                return
            }

            let autoplay = source["autoplay"] as? Bool ?? false
            let isNetwork = source["isNetwork"] as? Bool ?? false

            self.onVideoLoadStart?(["target": self.reactTag ?? NSNull()])

            let media: VLCMedia!
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

            self.vlc.player.media = media
            self.hasSource = true

            if autoplay {
                print("Playing...")
                self.play()
                self.vlc.player.time = VLCTime(number: NSNumber(value: self.startPosition * 1000))
            }
        }
    }

    @objc func setAudioTrack(_ trackIndex: Int) {
        let track = self.vlc.player.audioTracks[trackIndex]
        track.isSelectedExclusively = true;
    }

    @objc func getAudioTracks() -> [[String: Any]]? {
        return vlc.player.audioTracks.enumerated().map {
            return ["name": $1.trackName, "index": $0 ]
        }
    }

    @objc func setSubtitleTrack(_ trackIndex: Int) {
        print("Debug: Attempting to set subtitle track to index: \(trackIndex)")
        let track = self.vlc.player.textTracks[trackIndex]
        track.isSelectedExclusively = true;
        print("Debug: Current subtitle track index after setting: \(track.trackName)")
    }

    @objc func setSubtitleURL(_ subtitleURL: String, name: String) {
        guard let url = URL(string: subtitleURL) else {
            print("Error: Invalid subtitle URL")
            return
        }
        let result = self.vlc.player.addPlaybackSlave(url, type: .subtitle, enforce: true)

        if result > 0 {
            let internalName = "Track \(self.customSubtitles.count + 1)"
            print("Subtitle added with result: \(result) \(internalName)")
            self.customSubtitles.append((internalName: internalName, originalName: name))
        } else {
            print("Failed to add subtitle")
        }
    }

    @objc func getSubtitleTracks() -> [[String: Any]]? {
        if self.vlc.player.textTracks.count == 0 {
            return nil
        }

        print("Debug: Number of subtitle tracks: \(self.vlc.player.textTracks.count)")

        let tracks = self.vlc.player.textTracks.enumerated().map { (index, track) in
            if let customSubtitle = customSubtitles.first(where: { $0.internalName == track.trackName }) {
                return ["name": customSubtitle.originalName, "index": index ]
            }
            else {
                return ["name": track.trackName, "index": index ]
            }
        }

       print("Debug: Subtitle tracks: \(tracks)")
       return tracks
    }

    private func setSubtitleTrackByName(_ trackName: String) {
        for track in self.vlc.player.textTracks {
            if (track.trackName.starts(with: trackName)) {
                print("Track Index setting to: \(track.trackName)")
                track.isSelectedExclusively = true
                return
            }
        }

        print("Track not found for name: \(trackName)")
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
        vlc.player.stop()

        // Remove observer
        NotificationCenter.default.removeObserver(self)

        // Clear the video view
        vlc.getPlayerView().removeFromSuperview()

        isStopping = false
        completion?()
    }

    private func updateVideoProgress() {
        guard let media = self.vlc.player.media else { return }

        let currentTimeMs = self.vlc.player.time.intValue
        let durationMs = self.vlc.player.media?.length.intValue ?? 0

        print("Debug: Current time: \(currentTimeMs)")
        if currentTimeMs >= 0 && currentTimeMs < durationMs {
            if !self.isMediaReady {
                self.isMediaReady = true
                // Set external track subtitle when starting.
                if let externalTrack = self.externalTrack {
                    if let name = externalTrack["name"], !name.isEmpty {
                        let deliveryUrl = externalTrack["DeliveryUrl"] ?? ""
                        self.setSubtitleURL(deliveryUrl, name: name)
                    }
                }
            }
        }
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
            "state": player.state.description
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
        performStop()
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
        @unknown default: return "Unknown"
        }
    }
}
