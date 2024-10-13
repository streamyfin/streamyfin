import ExpoModulesCore
import MobileVLCKit
import UIKit

class VlcPlayerView: ExpoView {
    private var mediaPlayer: VLCMediaPlayer?
    private var videoView: UIView?
    private var progressUpdateInterval: TimeInterval = 0.5
    private var isPaused: Bool = false
    private var currentGeometryCString: [CChar]?
    private var lastReportedState: VLCMediaPlayerState?

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

            self.setupMediaPlayer()
        }
    }

    private func setupMediaPlayer() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.mediaPlayer = VLCMediaPlayer()
            self.mediaPlayer?.delegate = self
            self.mediaPlayer?.drawable = self.videoView
        }
    }

    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(applicationWillResignActive),
            name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(applicationWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    // MARK: - Public Methods

    @objc func play() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.mediaPlayer?.play()
            self.isPaused = false
        }
    }

    @objc func pause() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.mediaPlayer?.pause()
            self.isPaused = true
        }
    }

    @objc func seekTo(_ time: Int32) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.mediaPlayer?.time = VLCTime(int: time)
        }
    }

    @objc func setSource(_ source: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.mediaPlayer?.stop()
            self.mediaPlayer = nil

            let mediaOptions = source["mediaOptions"] as? [String: Any]
            let initOptions = source["initOptions"] as? [Any]
            let uri = source["uri"] as? String
            let initType = source["initType"] as? Int ?? 0
            let autoplay = source["autoplay"] as? Bool ?? false
            let isNetwork = source["isNetwork"] as? Bool ?? false

            guard let uri = uri, !uri.isEmpty else { return }

            if initType == 2, let options = initOptions {
                self.mediaPlayer = VLCMediaPlayer(options: options)
            } else {
                self.mediaPlayer = VLCMediaPlayer()
            }

            self.mediaPlayer?.delegate = self
            self.mediaPlayer?.drawable = self.videoView
            self.mediaPlayer?.scaleFactor = 0

            let media: VLCMedia
            if isNetwork {
                print("Loading network file: \(uri)")
                media = VLCMedia(url: URL(string: uri)!)
            } else {
                print("Loading local file: \(uri)")
                if uri.starts(with: "file://") {
                    if let url = URL(string: uri) {
                        media = VLCMedia(url: url)
                    } else {
                        print("Error: Invalid local file URL")
                        return
                    }
                } else {
                    media = VLCMedia(path: uri)
                }
            }

            media.delegate = self
            if let mediaOptions = mediaOptions {
                media.addOptions(mediaOptions)
            }

            // Set the media without parsing
            self.mediaPlayer?.media = media

            if autoplay {
                self.play()
            }

            self.onVideoLoadStart?(["target": self.reactTag ?? NSNull()])
        }
    }

    @objc func setMuted(_ muted: Bool) {
        DispatchQueue.main.async {
            self.mediaPlayer?.audio?.isMuted = muted
        }
    }

    @objc func setVolume(_ volume: Int) {
        DispatchQueue.main.async {
            self.mediaPlayer?.audio?.volume = Int32(volume)
        }
    }

    @objc func setVideoAspectRatio(_ ratio: String) {
        DispatchQueue.main.async {
            ratio.withCString { cString in
                self.mediaPlayer?.videoAspectRatio = UnsafeMutablePointer(mutating: cString)
            }
        }
    }

    @objc func setAudioTrack(_ trackIndex: Int) {
        DispatchQueue.main.async {
            self.mediaPlayer?.currentAudioTrackIndex = Int32(trackIndex)
        }
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

    // @objc func getAudioTracks(
    //     _ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    // ) {
    //     DispatchQueue.global(qos: .userInitiated).async { [weak self] in
    //         guard let self = self, let mediaPlayer = self.mediaPlayer else {
    //             DispatchQueue.main.async {
    //                 reject("ERROR", "Media player not available", nil)
    //             }
    //             return
    //         }

    //         guard let trackNames = mediaPlayer.audioTrackNames,
    //             let trackIndexes = mediaPlayer.audioTrackIndexes
    //         else {
    //             DispatchQueue.main.async {
    //                 reject("ERROR", "No audio tracks available", nil)
    //             }
    //             return
    //         }

    //         let tracks = zip(trackNames, trackIndexes).map { name, index in
    //             return ["name": name, "index": index]
    //         }

    //         DispatchQueue.main.async {
    //             resolve(tracks)
    //         }
    //     }
    // }

    @objc func setSubtitleTrack(_ trackIndex: Int) {
        DispatchQueue.main.async {
            if trackIndex == -1 {
                // Disable subtitles
                self.mediaPlayer?.currentVideoSubTitleIndex = -1
            } else {
                // Set the subtitle track
                self.mediaPlayer?.currentVideoSubTitleIndex = Int32(trackIndex)
            }
        }
    }

    @objc func getSubtitleTracks() -> [[String: Any]]? {
        guard let mediaPlayer = self.mediaPlayer else {
            return nil
        }

        let count = mediaPlayer.numberOfSubtitlesTracks
        guard count > 0 else {
            return nil
        }

        var tracks: [[String: Any]] = []

        // Add the "Disabled" track
        tracks.append(["name": "Disabled", "index": -1])

        if let names = mediaPlayer.videoSubTitlesNames as? [String],
            let indexes = mediaPlayer.videoSubTitlesIndexes as? [NSNumber]
        {
            for (index, name) in zip(indexes, names) {
                tracks.append(["name": name, "index": index.intValue])
            }
        }

        return tracks
    }

    // @objc func getSubtitleTracks(
    //     _ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    // ) {
    //     DispatchQueue.global(qos: .userInitiated).async { [weak self] in
    //         guard let self = self, let mediaPlayer = self.mediaPlayer else {
    //             DispatchQueue.main.async {
    //                 reject("ERROR", "Media player not available", nil)
    //             }
    //             return
    //         }

    //         let count = mediaPlayer.numberOfSubtitlesTracks
    //         guard count > 0 else {
    //             DispatchQueue.main.async {
    //                 reject("ERROR", "No subtitle tracks available", nil)
    //             }
    //             return
    //         }

    //         var tracks: [[String: Any]] = [["name": "Disabled", "index": -1]]

    //         if let names = mediaPlayer.videoSubTitlesNames as? [String],
    //             let indexes = mediaPlayer.videoSubTitlesIndexes as? [NSNumber]
    //         {
    //             for (index, name) in zip(indexes, names) {
    //                 tracks.append(["name": name, "index": index.intValue])
    //             }
    //         }

    //         DispatchQueue.main.async {
    //             resolve(tracks)
    //         }
    //     }
    // }

    @objc func setSubtitleDelay(_ delay: Int) {
        DispatchQueue.main.async {
            self.mediaPlayer?.currentVideoSubTitleDelay = NSInteger(delay)
        }
    }

    @objc func setAudioDelay(_ delay: Int) {
        DispatchQueue.main.async {
            self.mediaPlayer?.currentAudioPlaybackDelay = NSInteger(delay)
        }
    }

    @objc func takeSnapshot(_ path: String, width: Int, height: Int) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.mediaPlayer?.saveVideoSnapshot(
                at: path, withWidth: Int32(width), andHeight: Int32(height))
        }
    }

    @objc func setVideoCropGeometry(_ geometry: String?) {
        DispatchQueue.main.async {
            if let geometry = geometry, !geometry.isEmpty {
                self.currentGeometryCString = geometry.cString(using: .utf8)
                self.currentGeometryCString?.withUnsafeMutableBufferPointer { buffer in
                    self.mediaPlayer?.videoCropGeometry = buffer.baseAddress
                }
            } else {
                self.currentGeometryCString = nil
                self.mediaPlayer?.videoCropGeometry = nil
            }
        }
    }

    @objc func getVideoCropGeometry() -> String? {
        guard let cString = mediaPlayer?.videoCropGeometry else {
            return nil
        }
        return String(cString: cString)
    }

    @objc func setRate(_ rate: Float) {
        DispatchQueue.main.async {
            self.mediaPlayer?.rate = rate
        }
    }

    @objc func nextChapter() {
        DispatchQueue.main.async {
            self.mediaPlayer?.nextChapter()
        }
    }

    @objc func previousChapter() {
        DispatchQueue.main.async {
            self.mediaPlayer?.previousChapter()
        }
    }

    @objc func getChapters() -> [[String: Any]]? {
        guard let currentTitleIndex = mediaPlayer?.currentTitleIndex,
            let chapters = mediaPlayer?.chapterDescriptions(ofTitle: currentTitleIndex)
                as? [[String: Any]]
        else {
            return nil
        }

        return chapters.compactMap { chapter in
            guard let name = chapter[VLCChapterDescriptionName] as? String,
                let timeOffset = chapter[VLCChapterDescriptionTimeOffset] as? NSNumber,
                let duration = chapter[VLCChapterDescriptionDuration] as? NSNumber
            else {
                return nil
            }

            return [
                "name": name,
                "timeOffset": timeOffset.doubleValue,
                "duration": duration.doubleValue,
            ]
        }
    }

    private var isStopping: Bool = false

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
        if !isPaused {
            pause()
        }
    }

    @objc private func applicationWillEnterForeground() {
        if !isPaused {
            play()
        }
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

    // MARK: - Expo Events

    @objc var onPlaybackStateChanged: RCTDirectEventBlock?
    @objc var onVideoLoadStart: RCTDirectEventBlock?
    @objc var onVideoStateChange: RCTDirectEventBlock?
    @objc var onVideoProgress: RCTDirectEventBlock?

    // MARK: - Deinitialization

    deinit {
        performStop()
    }
}

extension VlcPlayerView: VLCMediaPlayerDelegate {
    func mediaPlayerStateChanged(_ aNotification: Notification) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.updatePlayerState()
        }
    }

    private func updatePlayerState() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let player = self.mediaPlayer else { return }
            let currentState = player.state

            var stateInfo: [String: Any] = [
                "target": self.reactTag ?? NSNull(),
                "currentTime": player.time.intValue,
                "duration": player.media?.length.intValue ?? 0,
            ]

            if player.isPlaying {
                stateInfo["isPlaying"] = true
                stateInfo["isBuffering"] = false
                stateInfo["state"] = "Playing"
            } else {
                stateInfo["isPlaying"] = false
                stateInfo["state"] = "Paused"
            }

            if player.state == .buffering && player.isPlaying {
                stateInfo["isBuffering"] = true
                stateInfo["state"] = "Buffering"
            }

            // switch currentState {
            // case .opening:
            //     stateInfo["state"] = "Opening"
            // case .buffering:
            //     stateInfo["state"] = "Buffering"
            //     stateInfo["isBuffering"] = true
            // case .playing:
            //     stateInfo["state"] = "Playing"
            // case .paused:
            //     stateInfo["state"] = "Paused"
            // case .stopped:
            //     stateInfo["state"] = "Stopped"
            // case .ended:
            //     stateInfo["state"] = "Ended"
            // case .error:
            //     stateInfo["state"] = "Error"
            // default:
            //     stateInfo["state"] = "Unknown"
            // }

            print("State changed: \(stateInfo)")

            self.lastReportedState = currentState
            self.onVideoStateChange?(stateInfo)
        }
    }

    func mediaPlayerTimeChanged(_ aNotification: Notification) {
        DispatchQueue.main.async { [weak self] in
            self?.updateVideoProgress()
        }
    }

    private func updateVideoProgress() {
        DispatchQueue.main.async {
            guard let player = self.mediaPlayer else { return }

            let currentTimeMs = player.time.intValue
            let durationMs = player.media?.length.intValue ?? 0

            if currentTimeMs >= 0 && currentTimeMs < durationMs {
                self.onVideoProgress?([
                    "currentTime": currentTimeMs,
                    "duration": durationMs,
                ])
            }
        }
    }
}

extension VlcPlayerView: VLCMediaDelegate {
    func mediaMetaDataDidChange(_ aMedia: VLCMedia) {
        // Implement if needed
    }

    func mediaDidFinishParsing(_ aMedia: VLCMedia) {
        DispatchQueue.main.async {
            let duration = aMedia.length.intValue
            self.onVideoStateChange?(["type": "MediaParsed", "duration": duration])
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
        case .ended: return "Ended"
        case .error: return "Error"
        case .esAdded: return "ESAdded"
        @unknown default: return "Unknown"
        }
    }
}
