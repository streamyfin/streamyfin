import UIKit
import MPVKit
import CoreMedia
import CoreVideo
import AVFoundation

protocol MPVLayerRendererDelegate: AnyObject {
    func renderer(_ renderer: MPVLayerRenderer, didUpdatePosition position: Double, duration: Double)
    func renderer(_ renderer: MPVLayerRenderer, didChangePause isPaused: Bool)
    func renderer(_ renderer: MPVLayerRenderer, didChangeLoading isLoading: Bool)
    func renderer(_ renderer: MPVLayerRenderer, didBecomeReadyToSeek: Bool)
    func renderer(_ renderer: MPVLayerRenderer, didBecomeTracksReady: Bool)
}

/// MPV player using vo_avfoundation for video output.
/// This renders video directly to AVSampleBufferDisplayLayer for PiP support.
final class MPVLayerRenderer {
    enum RendererError: Error {
        case mpvCreationFailed
        case mpvInitialization(Int32)
    }
    
    private let displayLayer: AVSampleBufferDisplayLayer
    private let queue = DispatchQueue(label: "mpv.avfoundation", qos: .userInitiated)
    private let stateQueue = DispatchQueue(label: "mpv.avfoundation.state", attributes: .concurrent)
    
    private var mpv: OpaquePointer?
    
    private var currentPreset: PlayerPreset?
    private var currentURL: URL?
    private var currentHeaders: [String: String]?
    private var pendingExternalSubtitles: [String] = []
    private var initialSubtitleId: Int?
    private var initialAudioId: Int?
    
    private var isRunning = false
    private var isStopping = false
    
    weak var delegate: MPVLayerRendererDelegate?
    
    // Thread-safe state for playback
    private var _cachedDuration: Double = 0
    private var _cachedPosition: Double = 0
    private var _isPaused: Bool = true
    private var _playbackSpeed: Double = 1.0
    private var _isLoading: Bool = false
    private var _isReadyToSeek: Bool = false
    
    // Thread-safe accessors
    private var cachedDuration: Double {
        get { stateQueue.sync { _cachedDuration } }
        set { stateQueue.async(flags: .barrier) { self._cachedDuration = newValue } }
    }
    private var cachedPosition: Double {
        get { stateQueue.sync { _cachedPosition } }
        set { stateQueue.async(flags: .barrier) { self._cachedPosition = newValue } }
    }
    private var isPaused: Bool {
        get { stateQueue.sync { _isPaused } }
        set { stateQueue.async(flags: .barrier) { self._isPaused = newValue } }
    }
    private var playbackSpeed: Double {
        get { stateQueue.sync { _playbackSpeed } }
        set { stateQueue.async(flags: .barrier) { self._playbackSpeed = newValue } }
    }
    private var isLoading: Bool {
        get { stateQueue.sync { _isLoading } }
        set { stateQueue.async(flags: .barrier) { self._isLoading = newValue } }
    }
    private var isReadyToSeek: Bool {
        get { stateQueue.sync { _isReadyToSeek } }
        set { stateQueue.async(flags: .barrier) { self._isReadyToSeek = newValue } }
    }
    
    var isPausedState: Bool {
        return isPaused
    }
    
    init(displayLayer: AVSampleBufferDisplayLayer) {
        self.displayLayer = displayLayer
    }
    
    deinit {
        stop()
    }
    
    func start() throws {
        guard !isRunning else { return }
        guard let handle = mpv_create() else {
            throw RendererError.mpvCreationFailed
        }
        mpv = handle

        // Logging - only warnings and errors in release, verbose in debug
        #if DEBUG
        checkError(mpv_request_log_messages(handle, "warn"))
        #else
        checkError(mpv_request_log_messages(handle, "no"))
        #endif

        // Detect if running on simulator
        #if targetEnvironment(simulator)
        let isSimulator = true
        #else
        let isSimulator = false
        #endif

        // Pass the AVSampleBufferDisplayLayer to mpv via --wid
        // The vo_avfoundation driver expects this
        let layerPtrInt = Int(bitPattern: Unmanaged.passUnretained(displayLayer).toOpaque())
        var displayLayerPtr = Int64(layerPtrInt)
        checkError(mpv_set_option(handle, "wid", MPV_FORMAT_INT64, &displayLayerPtr))

        // Use AVFoundation video output - required for PiP support
        checkError(mpv_set_option_string(handle, "vo", "avfoundation"))

        // Enable composite OSD mode - renders subtitles directly onto video frames using GPU
        // This is better for PiP as subtitles are baked into the video
        checkError(mpv_set_option_string(handle, "avfoundation-composite-osd", "yes"))

        // Hardware decoding with VideoToolbox
        // On simulator, use software decoding since VideoToolbox is not available
        // On device, use VideoToolbox with software fallback enabled
        let hwdecValue = isSimulator ? "no" : "videotoolbox"
        checkError(mpv_set_option_string(handle, "hwdec", hwdecValue))
        checkError(mpv_set_option_string(handle, "hwdec-codecs", "all"))
        checkError(mpv_set_option_string(handle, "hwdec-software-fallback", "yes"))

        // Subtitle and audio settings
        checkError(mpv_set_option_string(mpv, "subs-match-os-language", "yes"))
        checkError(mpv_set_option_string(mpv, "subs-fallback", "yes"))

        // Initialize mpv
        let initStatus = mpv_initialize(handle)
        guard initStatus >= 0 else {
            throw RendererError.mpvInitialization(initStatus)
        }

        // Observe properties
        observeProperties()

        // Setup wakeup callback
        mpv_set_wakeup_callback(handle, { ctx in
            guard let ctx = ctx else { return }
            let instance = Unmanaged<MPVLayerRenderer>.fromOpaque(ctx).takeUnretainedValue()
            instance.processEvents()
        }, Unmanaged.passUnretained(self).toOpaque())
        isRunning = true
    }
    
    func stop() {
        if isStopping { return }
        if !isRunning, mpv == nil { return }
        isRunning = false
        isStopping = true
        
        queue.sync { [weak self] in
            guard let self, let handle = self.mpv else { return }
            
            mpv_set_wakeup_callback(handle, nil, nil)
            mpv_terminate_destroy(handle)
            self.mpv = nil
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if #available(iOS 18.0, *) {
                self.displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
            } else {
                self.displayLayer.flushAndRemoveImage()
            }
        }
        
        isStopping = false
    }
    
    func load(
        url: URL,
        with preset: PlayerPreset,
        headers: [String: String]? = nil,
        startPosition: Double? = nil,
        externalSubtitles: [String]? = nil,
        initialSubtitleId: Int? = nil,
        initialAudioId: Int? = nil
    ) {
        currentPreset = preset
        currentURL = url
        currentHeaders = headers
        pendingExternalSubtitles = externalSubtitles ?? []
        self.initialSubtitleId = initialSubtitleId
        self.initialAudioId = initialAudioId
        queue.async { [weak self] in
            guard let self else { return }
            self.isLoading = true
            self.isReadyToSeek = false
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.delegate?.renderer(self, didChangeLoading: true)
            }

            guard let handle = self.mpv else { return }

            self.apply(commands: preset.commands, on: handle)
            // Stop previous playback before loading new file
            self.command(handle, ["stop"])
            self.updateHTTPHeaders(headers)
            // Set start position
            if let startPos = startPosition, startPos > 0 {
                self.setProperty(name: "start", value: String(format: "%.2f", startPos))
            } else {
                self.setProperty(name: "start", value: "0")
            }
            // Set initial audio track if specified
            if let audioId = self.initialAudioId, audioId > 0 {
                self.setAudioTrack(audioId)
            }
            // Set initial subtitle track if no external subs
            if self.pendingExternalSubtitles.isEmpty {
                if let subId = self.initialSubtitleId {
                    self.setSubtitleTrack(subId)
                } else {
                    self.disableSubtitles()
                }
            } else {
                self.disableSubtitles()
            }
            let target = url.isFileURL ? url.path : url.absoluteString
            self.command(handle, ["loadfile", target, "replace"])
        }
    }
    
    func reloadCurrentItem() {
        guard let url = currentURL, let preset = currentPreset else { return }
        load(url: url, with: preset, headers: currentHeaders)
    }
    
    func applyPreset(_ preset: PlayerPreset) {
        currentPreset = preset
        guard let handle = mpv else { return }
        queue.async { [weak self] in
            guard let self else { return }
            self.apply(commands: preset.commands, on: handle)
        }
    }
    
    // MARK: - Property Helpers
    
    private func setOption(name: String, value: String) {
        guard let handle = mpv else { return }
        checkError(mpv_set_option_string(handle, name, value))
    }
    
    private func setProperty(name: String, value: String) {
        guard let handle = mpv else { return }
        let status = mpv_set_property_string(handle, name, value)
        if status < 0 {
            Logger.shared.log("Failed to set property \(name)=\(value) (\(status))", type: "Warn")
        }
    }
    
    private func clearProperty(name: String) {
        guard let handle = mpv else { return }
        let status = mpv_set_property(handle, name, MPV_FORMAT_NONE, nil)
        if status < 0 {
            Logger.shared.log("Failed to clear property \(name) (\(status))", type: "Warn")
        }
    }
    
    private func updateHTTPHeaders(_ headers: [String: String]?) {
        guard let headers, !headers.isEmpty else {
            clearProperty(name: "http-header-fields")
            return
        }
        
        let headerString = headers
            .map { key, value in "\(key): \(value)" }
            .joined(separator: "\r\n")
        setProperty(name: "http-header-fields", value: headerString)
    }
    
    private func observeProperties() {
        guard let handle = mpv else { return }
        let properties: [(String, mpv_format)] = [
            ("duration", MPV_FORMAT_DOUBLE),
            ("time-pos", MPV_FORMAT_DOUBLE),
            ("pause", MPV_FORMAT_FLAG),
            ("track-list/count", MPV_FORMAT_INT64),
            ("paused-for-cache", MPV_FORMAT_FLAG)
        ]
        for (name, format) in properties {
            mpv_observe_property(handle, 0, name, format)
        }
    }
    
    private func apply(commands: [[String]], on handle: OpaquePointer) {
        for command in commands {
            guard !command.isEmpty else { continue }
            self.command(handle, command)
        }
    }
    
    private func command(_ handle: OpaquePointer, _ args: [String]) {
        guard !args.isEmpty else { return }
        _ = withCStringArray(args) { pointer in
            mpv_command_async(handle, 0, pointer)
        }
    }
    
    private func commandSync(_ handle: OpaquePointer, _ args: [String]) -> Int32 {
        guard !args.isEmpty else { return -1 }
        return withCStringArray(args) { pointer in
            mpv_command(handle, pointer)
        }
    }
    
    private func checkError(_ status: CInt) {
        if status < 0 {
            Logger.shared.log("MPV API error: \(String(cString: mpv_error_string(status)))", type: "Error")
        }
    }
    
    // MARK: - Event Handling
    
    private func processEvents() {
        queue.async { [weak self] in
            guard let self else { return }
            
            while self.mpv != nil && !self.isStopping {
                guard let handle = self.mpv,
                      let eventPointer = mpv_wait_event(handle, 0) else { return }
                let event = eventPointer.pointee
                if event.event_id == MPV_EVENT_NONE { break }
                self.handleEvent(event)
                if event.event_id == MPV_EVENT_SHUTDOWN { break }
            }
        }
    }
    
    private func handleEvent(_ event: mpv_event) {
        switch event.event_id {
        case MPV_EVENT_FILE_LOADED:
            // Add external subtitles now that the file is loaded
            let hadExternalSubs = !pendingExternalSubtitles.isEmpty
            if hadExternalSubs, let handle = mpv {
                for subUrl in pendingExternalSubtitles {
                    command(handle, ["sub-add", subUrl])
                }
                pendingExternalSubtitles = []
                // Set subtitle after external subs are added
                if let subId = initialSubtitleId {
                    setSubtitleTrack(subId)
                } else {
                    disableSubtitles()
                }
            }
            if !isReadyToSeek {
                isReadyToSeek = true
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.renderer(self, didBecomeReadyToSeek: true)
                }
            }
            // Notify loading ended
            if isLoading {
                isLoading = false
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.renderer(self, didChangeLoading: false)
                }
            }
            
        case MPV_EVENT_SEEK:
            // Seek started - show loading indicator
            if !isLoading {
                isLoading = true
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.renderer(self, didChangeLoading: true)
                }
            }
            
        case MPV_EVENT_PLAYBACK_RESTART:
            // Video playback has started/restarted (including after seek)
            if isLoading {
                isLoading = false
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.renderer(self, didChangeLoading: false)
                }
            }
        case MPV_EVENT_PROPERTY_CHANGE:
            if let property = event.data?.assumingMemoryBound(to: mpv_event_property.self).pointee.name {
                let name = String(cString: property)
                refreshProperty(named: name, event: event)
            }

        case MPV_EVENT_SHUTDOWN:
            Logger.shared.log("mpv shutdown", type: "Warn")

        case MPV_EVENT_LOG_MESSAGE:
            if let logMessagePointer = event.data?.assumingMemoryBound(to: mpv_event_log_message.self) {
                let component = String(cString: logMessagePointer.pointee.prefix)
                let text = String(cString: logMessagePointer.pointee.text)
                let lower = text.lowercased()
                if lower.contains("error") {
                    Logger.shared.log("mpv[\(component)] \(text)", type: "Error")
                } else if lower.contains("warn") || lower.contains("warning") {
                    Logger.shared.log("mpv[\(component)] \(text)", type: "Warn")
                }
            }
        default:
            break
        }
    }
    
    private func refreshProperty(named name: String, event: mpv_event) {
        guard let handle = mpv else { return }
        switch name {
        case "duration":
            var value = Double(0)
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_DOUBLE, value: &value)
            if status >= 0 {
                cachedDuration = value
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.renderer(self, didUpdatePosition: self.cachedPosition, duration: self.cachedDuration)
                }
            }
        case "time-pos":
            var value = Double(0)
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_DOUBLE, value: &value)
            if status >= 0 {
                cachedPosition = value
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.renderer(self, didUpdatePosition: self.cachedPosition, duration: self.cachedDuration)
                }
            }
        case "pause":
            var flag: Int32 = 0
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_FLAG, value: &flag)
            if status >= 0 {
                let newPaused = flag != 0
                if newPaused != isPaused {
                    isPaused = newPaused
                    DispatchQueue.main.async { [weak self] in
                        guard let self else { return }
                        self.delegate?.renderer(self, didChangePause: self.isPaused)
                    }
                }
            }
        case "paused-for-cache":
            var flag: Int32 = 0
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_FLAG, value: &flag)
            if status >= 0 {
                let buffering = flag != 0
                if buffering != isLoading {
                    isLoading = buffering
                    DispatchQueue.main.async { [weak self] in
                        guard let self else { return }
                        self.delegate?.renderer(self, didChangeLoading: buffering)
                    }
                }
            }
        case "track-list/count":
            var trackCount: Int64 = 0
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_INT64, value: &trackCount)
            if status >= 0 && trackCount > 0 {
                Logger.shared.log("Track list updated: \(trackCount) tracks available", type: "Info")
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.renderer(self, didBecomeTracksReady: true)
                }
            }
        default:
            break
        }
    }
    
    private func getStringProperty(handle: OpaquePointer, name: String) -> String? {
        var result: String?
        if let cString = mpv_get_property_string(handle, name) {
            result = String(cString: cString)
            mpv_free(cString)
        }
        return result
    }
    
    @discardableResult
    private func getProperty<T>(handle: OpaquePointer, name: String, format: mpv_format, value: inout T) -> Int32 {
        return withUnsafeMutablePointer(to: &value) { mutablePointer in
            return mpv_get_property(handle, name, format, mutablePointer)
        }
    }
    
    @inline(__always)
    private func withCStringArray<R>(_ args: [String], body: (UnsafeMutablePointer<UnsafePointer<CChar>?>?) -> R) -> R {
        var cStrings = [UnsafeMutablePointer<CChar>?]()
        cStrings.reserveCapacity(args.count + 1)
        for s in args {
            cStrings.append(strdup(s))
        }
        cStrings.append(nil)
        defer {
            for ptr in cStrings where ptr != nil {
                free(ptr)
            }
        }
        
        return cStrings.withUnsafeMutableBufferPointer { buffer in
            return buffer.baseAddress!.withMemoryRebound(to: UnsafePointer<CChar>?.self, capacity: buffer.count) { rebound in
                return body(UnsafeMutablePointer(mutating: rebound))
            }
        }
    }
    
    // MARK: - Playback Controls
    
    func play() {
        setProperty(name: "pause", value: "no")
    }
    
    func pausePlayback() {
        setProperty(name: "pause", value: "yes")
    }
    
    func togglePause() {
        if isPaused { play() } else { pausePlayback() }
    }
    
    func seek(to seconds: Double) {
        guard let handle = mpv else { return }
        let clamped = max(0, seconds)
        cachedPosition = clamped
        commandSync(handle, ["seek", String(clamped), "absolute"])
    }
    
    func seek(by seconds: Double) {
        guard let handle = mpv else { return }
        let newPosition = max(0, cachedPosition + seconds)
        cachedPosition = newPosition
        commandSync(handle, ["seek", String(seconds), "relative"])
    }
    
    /// Sync timebase - no-op for vo_avfoundation (mpv handles timing)
    func syncTimebase() {
        // vo_avfoundation manages its own timebase
    }
    
    func setSpeed(_ speed: Double) {
        playbackSpeed = speed
        setProperty(name: "speed", value: String(speed))
    }
    
    func getSpeed() -> Double {
        guard let handle = mpv else { return 1.0 }
        var speed: Double = 1.0
        getProperty(handle: handle, name: "speed", format: MPV_FORMAT_DOUBLE, value: &speed)
        return speed
    }
    
    // MARK: - Subtitle Controls
    
    func getSubtitleTracks() -> [[String: Any]] {
        guard let handle = mpv else {
            Logger.shared.log("getSubtitleTracks: mpv handle is nil", type: "Warn")
            return []
        }
        var tracks: [[String: Any]] = []
        
        var trackCount: Int64 = 0
        getProperty(handle: handle, name: "track-list/count", format: MPV_FORMAT_INT64, value: &trackCount)
        
        for i in 0..<trackCount {
            guard let trackType = getStringProperty(handle: handle, name: "track-list/\(i)/type"),
                  trackType == "sub" else { continue }
            
            var trackId: Int64 = 0
            getProperty(handle: handle, name: "track-list/\(i)/id", format: MPV_FORMAT_INT64, value: &trackId)
            
            var track: [String: Any] = ["id": Int(trackId)]
            
            if let title = getStringProperty(handle: handle, name: "track-list/\(i)/title") {
                track["title"] = title
            }
            
            if let lang = getStringProperty(handle: handle, name: "track-list/\(i)/lang") {
                track["lang"] = lang
            }
            
            var selected: Int32 = 0
            getProperty(handle: handle, name: "track-list/\(i)/selected", format: MPV_FORMAT_FLAG, value: &selected)
            track["selected"] = selected != 0
            
            Logger.shared.log("getSubtitleTracks: found sub track id=\(trackId), title=\(track["title"] ?? "none"), lang=\(track["lang"] ?? "none")", type: "Info")
            tracks.append(track)
        }
        
        Logger.shared.log("getSubtitleTracks: returning \(tracks.count) subtitle tracks", type: "Info")
        return tracks
    }
    
    func setSubtitleTrack(_ trackId: Int) {
        Logger.shared.log("setSubtitleTrack: setting sid to \(trackId)", type: "Info")
        guard mpv != nil else {
            Logger.shared.log("setSubtitleTrack: mpv handle is nil!", type: "Error")
            return
        }
        
        if trackId < 0 {
            setProperty(name: "sid", value: "no")
        } else {
            setProperty(name: "sid", value: String(trackId))
        }
    }
    
    func disableSubtitles() {
        setProperty(name: "sid", value: "no")
    }
    
    func getCurrentSubtitleTrack() -> Int {
        guard let handle = mpv else { return 0 }
        var sid: Int64 = 0
        getProperty(handle: handle, name: "sid", format: MPV_FORMAT_INT64, value: &sid)
        return Int(sid)
    }
    
    func addSubtitleFile(url: String, select: Bool = true) {
        guard let handle = mpv else { return }
        let flag = select ? "select" : "cached"
        commandSync(handle, ["sub-add", url, flag])
    }
    
    // MARK: - Subtitle Positioning
    
    func setSubtitlePosition(_ position: Int) {
        setProperty(name: "sub-pos", value: String(position))
    }
    
    func setSubtitleScale(_ scale: Double) {
        setProperty(name: "sub-scale", value: String(scale))
    }
    
    func setSubtitleMarginY(_ margin: Int) {
        setProperty(name: "sub-margin-y", value: String(margin))
    }
    
    func setSubtitleAlignX(_ alignment: String) {
        setProperty(name: "sub-align-x", value: alignment)
    }
    
    func setSubtitleAlignY(_ alignment: String) {
        setProperty(name: "sub-align-y", value: alignment)
    }
    
    func setSubtitleFontSize(_ size: Int) {
        setProperty(name: "sub-font-size", value: String(size))
    }
    
    // MARK: - Audio Track Controls
    
    func getAudioTracks() -> [[String: Any]] {
        guard let handle = mpv else {
            Logger.shared.log("getAudioTracks: mpv handle is nil", type: "Warn")
            return []
        }
        var tracks: [[String: Any]] = []
        
        var trackCount: Int64 = 0
        getProperty(handle: handle, name: "track-list/count", format: MPV_FORMAT_INT64, value: &trackCount)
        
        for i in 0..<trackCount {
            guard let trackType = getStringProperty(handle: handle, name: "track-list/\(i)/type"),
                  trackType == "audio" else { continue }
            
            var trackId: Int64 = 0
            getProperty(handle: handle, name: "track-list/\(i)/id", format: MPV_FORMAT_INT64, value: &trackId)
            
            var track: [String: Any] = ["id": Int(trackId)]
            
            if let title = getStringProperty(handle: handle, name: "track-list/\(i)/title") {
                track["title"] = title
            }
            
            if let lang = getStringProperty(handle: handle, name: "track-list/\(i)/lang") {
                track["lang"] = lang
            }
            
            if let codec = getStringProperty(handle: handle, name: "track-list/\(i)/codec") {
                track["codec"] = codec
            }
            
            var channels: Int64 = 0
            getProperty(handle: handle, name: "track-list/\(i)/audio-channels", format: MPV_FORMAT_INT64, value: &channels)
            if channels > 0 {
                track["channels"] = Int(channels)
            }
            
            var selected: Int32 = 0
            getProperty(handle: handle, name: "track-list/\(i)/selected", format: MPV_FORMAT_FLAG, value: &selected)
            track["selected"] = selected != 0
            
            Logger.shared.log("getAudioTracks: found audio track id=\(trackId), title=\(track["title"] ?? "none"), lang=\(track["lang"] ?? "none")", type: "Info")
            tracks.append(track)
        }
        
        Logger.shared.log("getAudioTracks: returning \(tracks.count) audio tracks", type: "Info")
        return tracks
    }
    
    func setAudioTrack(_ trackId: Int) {
        guard mpv != nil else {
            Logger.shared.log("setAudioTrack: mpv handle is nil", type: "Warn")
            return
        }
        Logger.shared.log("setAudioTrack: setting aid to \(trackId)", type: "Info")
        setProperty(name: "aid", value: String(trackId))
    }
    
    func getCurrentAudioTrack() -> Int {
        guard let handle = mpv else { return 0 }
        var aid: Int64 = 0
        getProperty(handle: handle, name: "aid", format: MPV_FORMAT_INT64, value: &aid)
        return Int(aid)
    }
}
