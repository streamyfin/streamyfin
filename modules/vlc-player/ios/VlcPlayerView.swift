import ExpoModulesCore
import MobileVLCKit
import UIKit

class VlcPlayerView: ExpoView {
    private var mediaPlayer: VLCMediaPlayer?
    private var videoView: UIView?
    private var progressUpdateTimer: Timer?
    private var progressUpdateInterval: TimeInterval = 0.5
    private var isPaused: Bool = false
    private var currentGeometryCString: [CChar]?

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
        DispatchQueue.main.async {
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
        self.mediaPlayer?.play()
        self.isPaused = false
    }

    @objc func pause() {
        self.mediaPlayer?.pause()
        self.isPaused = true
    }

    @objc func seekTo(_ time: Double) {
        self.mediaPlayer?.time = VLCTime(int: Int32(time * 1000))
    }

    @objc func setSource(_ source: [String: Any]) {
        DispatchQueue.main.async {
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
                media = VLCMedia(url: URL(string: uri)!)
            } else {
                media = VLCMedia(path: uri)
            }

            media.delegate = self
            if let mediaOptions = mediaOptions {
                media.addOptions(mediaOptions)
            }

            // Parse the media asynchronously
            media.parse()
            self.mediaPlayer?.media = media

            if autoplay {
                self.play()
            }

            self.onVideoLoadStart?(["target": self.reactTag ?? NSNull()])
        }
    }

    @objc func setProgressUpdateInterval(_ interval: Double) {
        progressUpdateInterval = TimeInterval(interval / 1000.0)
        updateProgressTimer()
    }

    @objc func jumpBackward(_ interval: Int) {
        mediaPlayer?.jumpBackward(Int32(interval))
    }

    @objc func jumpForward(_ interval: Int) {
        mediaPlayer?.jumpForward(Int32(interval))
    }

    @objc func setMuted(_ muted: Bool) {
        mediaPlayer?.audio?.isMuted = muted
    }

    @objc func setVolume(_ volume: Int) {
        mediaPlayer?.audio?.volume = Int32(volume)
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

    @objc func setSubtitleTrack(_ trackIndex: Int) {
        DispatchQueue.main.async {
            self.mediaPlayer?.currentVideoSubTitleIndex = Int32(trackIndex)
        }
    }

    @objc func getSubtitleTracks() -> [[String: Any]]? {
        guard let trackNames = mediaPlayer?.videoSubTitlesNames,
            let trackIndexes = mediaPlayer?.videoSubTitlesIndexes
        else {
            return nil
        }

        return zip(trackNames, trackIndexes).map { name, index in
            return ["name": name, "index": index]
        }
    }

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

    // MARK: - Private Methods

    private func updateProgressTimer() {
        progressUpdateTimer?.invalidate()
        progressUpdateTimer = Timer.scheduledTimer(
            withTimeInterval: progressUpdateInterval, repeats: true
        ) { [weak self] _ in
            self?.sendProgressUpdate()
        }
    }

    private func sendProgressUpdate() {
        DispatchQueue.main.async {
            guard let player = self.mediaPlayer else { return }
            let currentTime = player.time.intValue
            let duration = player.media?.length.intValue ?? 0
            let progress: [String: Any] = [
                "currentTime": currentTime,
                "duration": duration,
            ]
            self.onVideoProgress?(progress)
        }
    }

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

    private func release() {
        DispatchQueue.main.async {
            self.mediaPlayer?.stop()
            self.mediaPlayer = nil
            NotificationCenter.default.removeObserver(self)
        }
    }

    // MARK: - Expo Events

    @objc var onProgress: RCTDirectEventBlock?
    @objc var onPlaybackStateChanged: RCTDirectEventBlock?
    @objc var onVideoLoadStart: RCTDirectEventBlock?
    @objc var onVideoStateChange: RCTDirectEventBlock?
    @objc var onVideoProgress: RCTDirectEventBlock?

    // MARK: - Deinitialization

    deinit {
        release()
    }
}

extension VlcPlayerView: VLCMediaPlayerDelegate {
    func mediaPlayerStateChanged(_ aNotification: Notification) {
        DispatchQueue.main.async {
            guard let player = self.mediaPlayer else { return }

            let state = player.state
            var stateInfo: [String: Any] = [
                "target": self.reactTag ?? NSNull(),
                "currentTime": player.time.intValue,
                "duration": player.media?.length.intValue ?? 0,
            ]

            switch state {
            case .opening:
                stateInfo["type"] = "Opening"
            case .paused:
                self.isPaused = true
                stateInfo["type"] = "Paused"
            case .stopped:
                stateInfo["type"] = "Stopped"
            case .buffering:
                if player.isPlaying {
                    // If the player is actually playing while in buffering state,
                    // we'll report it as "Playing"
                    self.isPaused = false
                    stateInfo["type"] = "Playing"
                } else {
                    stateInfo["type"] = "Buffering"
                    stateInfo["isBuffering"] = true
                }
            case .playing:
                self.isPaused = false
                stateInfo["type"] = "Playing"
            case .esAdded:
                stateInfo["type"] = "ESAdded"
            case .ended:
                print("VLCMediaPlayerStateEnded")
                stateInfo["type"] = "Ended"
            case .error:
                stateInfo["type"] = "Error"
                self.release()
            @unknown default:
                stateInfo["type"] = "Unknown"
            }

            self.onVideoStateChange?(stateInfo)
        }
    }

    func mediaPlayerTimeChanged(_ aNotification: Notification) {
        updateVideoProgress()
    }

    private func updateVideoProgress() {
        DispatchQueue.main.async {
            guard let player = self.mediaPlayer else { return }

            let currentTime = player.time.intValue
            let duration = player.media?.length.intValue ?? 0

            if currentTime >= 0 && currentTime < duration {
                self.onVideoProgress?([
                    "target": self.reactTag ?? NSNull(),
                    "currentTime": currentTime,
                    "duration": duration,
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
