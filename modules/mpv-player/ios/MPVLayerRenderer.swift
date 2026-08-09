import UIKit
import MPVKit
import CoreMedia
import CoreVideo
import AVFoundation

/// HDR mode detected from video properties
enum HDRMode {
    case sdr
    case hdr10
    case dolbyVision
    case hlg
}

protocol MPVLayerRendererDelegate: AnyObject {
    func renderer(_ renderer: MPVLayerRenderer, didUpdatePosition position: Double, duration: Double, cacheSeconds: Double)
    func renderer(_ renderer: MPVLayerRenderer, didChangePause isPaused: Bool)
    func renderer(_ renderer: MPVLayerRenderer, didChangeLoading isLoading: Bool)
    func renderer(_ renderer: MPVLayerRenderer, didBecomeReadyToSeek: Bool)
    func renderer(_ renderer: MPVLayerRenderer, didBecomeTracksReady: Bool)
    func renderer(_ renderer: MPVLayerRenderer, didDetectHDRMode mode: HDRMode, fps: Double)
    func renderer(_ renderer: MPVLayerRenderer, didSelectAudioOutput audioOutput: String)
    /// Fired only for a genuine end-of-file (MPV_END_FILE_REASON_EOF) — never
    /// for stop/quit during teardown, which would emit spurious end events.
    func rendererDidReachEnd(_ renderer: MPVLayerRenderer)
}

/// MPV player using vo_avfoundation for video output.
/// This renders video directly to AVSampleBufferDisplayLayer for PiP support.
final class MPVLayerRenderer {
    enum RendererError: Error {
        case mpvCreationFailed
        case mpvInitialization(Int32)
    }
    
    private let displayLayer: AVSampleBufferDisplayLayer
    private let queue: DispatchQueue
    private let stateQueue = DispatchQueue(label: "mpv.avfoundation.state", attributes: .concurrent)

    // Key to identify if we're on the mpv queue (to avoid deadlock in stop())
    private static let queueKey = DispatchSpecificKey<Bool>()
    
    private var mpv: OpaquePointer?
    
    private var currentPreset: PlayerPreset?
    private var currentURL: URL?
    private var currentHeaders: [String: String]?
    private var pendingExternalSubtitles: [String] = []
    private var initialSubtitleId: Int?
    private var initialAudioId: Int?
    
    private var _isRunning = false
    private var _isStopping = false

    private var isRunning: Bool {
        get { stateQueue.sync { _isRunning } }
        set { stateQueue.async(flags: .barrier) { self._isRunning = newValue } }
    }

    private var isStopping: Bool {
        get { stateQueue.sync { _isStopping } }
        set { stateQueue.sync(flags: .barrier) { _isStopping = newValue } }  // Must be sync for stop() to work
    }
    
    // KVO observation for display layer status
    private var statusObservation: NSKeyValueObservation?

    // Display layer recovery (see performDecoderReset)
    private static let maxDecoderResets = 3
    private var _decoderResetCount = 0
    private var decoderResetCount: Int {
        get { stateQueue.sync { _decoderResetCount } }
        set { stateQueue.sync(flags: .barrier) { _decoderResetCount = newValue } }
    }

    /// The hwdec mode this renderer was configured with in `start()`. Recovery
    /// restores exactly this instead of `auto`, so a device that was told to
    /// software-decode never gets silently promoted back to VideoToolbox.
    private var configuredHwdec = "videotoolbox"

    weak var delegate: MPVLayerRendererDelegate?
    
    // Thread-safe state for playback
    private var _cachedDuration: Double = 0
    private var _cachedPosition: Double = 0
    private var _cachedCacheSeconds: Double = 0
    private var _isPaused: Bool = true
    private var _playbackSpeed: Double = 1.0
    private var _isLoading: Bool = false
    private var _isReadyToSeek: Bool = false
    private var _isSeeking: Bool = false

    // Progress update throttling - CRITICAL for performance!
    // DO NOT REMOVE THIS THROTTLE - it is essential for battery life and CPU efficiency.
    //
    // Without throttling, time-pos fires every video frame (24+ times/sec at 24fps).
    // Each update crosses the React Native JS bridge, which is expensive on mobile.
    // Even if the JS side does nothing, 24+ bridge calls/sec wastes CPU and battery.
    //
    // Throttling to 1 update/sec during normal playback is sufficient for:
    // - Progress bar updates (users can't perceive 1-second granularity)
    // - Playback position tracking
    // - Any JS-side logic that needs current position
    //
    // During seeking, we bypass the throttle for responsive scrubbing.
    // This optimization reduced CPU usage by ~50% for downloaded file playback.
    private var lastProgressUpdateTime: CFAbsoluteTime = 0
    
    // Thread-safe accessors
    private var cachedDuration: Double {
        get { stateQueue.sync { _cachedDuration } }
        set { stateQueue.async(flags: .barrier) { self._cachedDuration = newValue } }
    }
    private var cachedPosition: Double {
        get { stateQueue.sync { _cachedPosition } }
        set { stateQueue.async(flags: .barrier) { self._cachedPosition = newValue } }
    }
    private var cachedCacheSeconds: Double {
        get { stateQueue.sync { _cachedCacheSeconds } }
        set { stateQueue.async(flags: .barrier) { self._cachedCacheSeconds = newValue } }
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
    private var isSeeking: Bool {
        get { stateQueue.sync { _isSeeking } }
        set { stateQueue.async(flags: .barrier) { self._isSeeking = newValue } }
    }
    
    var isPausedState: Bool {
        return isPaused
    }
    
    init(displayLayer: AVSampleBufferDisplayLayer) {
        self.displayLayer = displayLayer
        self.queue = DispatchQueue(label: "mpv.avfoundation", qos: .userInitiated)
        queue.setSpecific(key: Self.queueKey, value: true)
        observeDisplayLayerStatus()
    }
    
   
    /// Watches for display layer failures and auto-recovers.
    ///
    /// iOS aggressively kills VideoToolbox decoder sessions when the app is
    /// backgrounded, the screen is locked, or system resources are low.
    /// This causes the video to go black - especially problematic for PiP.
    ///
    /// This KVO observer detects when the display layer status becomes `.failed`
    /// and automatically reinitializes the hardware decoder to restore video.
    private func observeDisplayLayerStatus() {
        statusObservation = displayLayer.observe(\.status, options: [.new]) { [weak self] layer, _ in
            guard let self else { return }
            
            if layer.status == .failed {
                print("🔧 Display layer failed - auto-resetting decoder")
                self.queue.async {
                    self.performDecoderReset()
                }
            }
        }
    }
    
    /// Actually performs the decoder reset (called by observer or manually)
    ///
    /// Bounded on purpose. The reset re-enables hardware decoding, so if the
    /// layer failed *because* the codec has no hardware decoder on this device
    /// (AV1 on any current Apple TV, for instance), the retry reproduces the
    /// exact failure and the KVO observer fires again — an unbounded loop that
    /// presents as a permanent hang rather than an error. After
    /// `maxDecoderResets` consecutive failures we stop retrying and leave mpv
    /// on software decoding, which at worst plays badly instead of not at all.
    /// The budget is reset per loaded file in `load()`.
    private func performDecoderReset() {
        guard let handle = mpv else { return }

        let attempt = decoderResetCount + 1
        guard attempt <= Self.maxDecoderResets else {
            Logger.shared.log(
                "Display layer failed again after \(Self.maxDecoderResets) decoder resets; staying on software decoding",
                type: "Warn"
            )
            return
        }
        decoderResetCount = attempt

        print("🔧 Resetting decoder (\(attempt)/\(Self.maxDecoderResets)): status=\(displayLayer.status.rawValue), requiresFlush=\(displayLayer.requiresFlushToResumeDecoding)")
        commandSync(handle, ["set", "hwdec", "no"])

        // On the final attempt, stay on software decoding rather than handing
        // the same unsupported stream back to VideoToolbox one more time.
        if attempt < Self.maxDecoderResets {
            commandSync(handle, ["set", "hwdec", configuredHwdec])
        }
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

        // Pass the AVSampleBufferDisplayLayer to mpv via --wid
        // The vo_avfoundation driver expects this
        let layerPtrInt = Int(bitPattern: Unmanaged.passUnretained(displayLayer).toOpaque())
        var displayLayerPtr = Int64(layerPtrInt)
        checkError(mpv_set_option(handle, "wid", MPV_FORMAT_INT64, &displayLayerPtr))

        // Use AVFoundation video output - required for PiP support
        checkError(mpv_set_option_string(handle, "vo", "avfoundation"))

        // Composite OSD mode - renders subtitles directly onto video frames using GPU.
        // CRITICAL: Must be set immediately after vo=avfoundation, before hwdec options.
        // Moving this elsewhere causes tvOS to freeze when exiting the player.
        // tvOS: "no" (breaks subtitle rendering; note: subtitle styling won't work).
        // Simulator: "no" (no VideoToolbox support).
        // iOS device: "yes" for PiP subtitle support.
        #if os(tvOS) || targetEnvironment(simulator)
        checkError(mpv_set_option_string(handle, "avfoundation-composite-osd", "no"))
        #else
        checkError(mpv_set_option_string(handle, "avfoundation-composite-osd", "yes"))
        #endif

        // Hardware decoding with VideoToolbox
        // On simulator, use software decoding since VideoToolbox is not available
        // On device, use VideoToolbox with software fallback enabled
        #if targetEnvironment(simulator)
        configuredHwdec = "no"
        #else
        configuredHwdec = "videotoolbox"
        #endif
        checkError(mpv_set_option_string(handle, "hwdec", configuredHwdec))
        checkError(mpv_set_option_string(handle, "hwdec-codecs", "all"))
        checkError(mpv_set_option_string(handle, "hwdec-software-fallback", "yes"))

        // HDR passthrough - signal content colorspace to display system
        // This prevents tone-mapping and allows HDR content to pass through
        #if os(tvOS)
        checkError(mpv_set_option_string(handle, "target-colorspace-hint", "yes"))
        #endif

        // Subtitle and audio settings
        checkError(mpv_set_option_string(mpv, "sub-scale-with-window", "no"))
        checkError(mpv_set_option_string(mpv, "sub-use-margins", "no"))
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

        // Stop observing display layer status
        statusObservation?.invalidate()
        statusObservation = nil

        // Clear wakeup callback first to stop event processing
        if let handle = mpv {
            mpv_set_wakeup_callback(handle, nil, nil)

            // Send quit command and drain events on the mpv queue
            queue.sync { [weak self] in
                guard let self, let handle = self.mpv else { return }
                self.commandSync(handle, ["quit"])

                // Drain any remaining events after quit
                var drainCount = 0
                let maxDrain = 100
                while drainCount < maxDrain, let event = mpv_wait_event(handle, 0.1)?.pointee {
                    if event.event_id == MPV_EVENT_NONE || event.event_id == MPV_EVENT_SHUTDOWN {
                        break
                    }
                    drainCount += 1
                }
            }

            // Call mpv_terminate_destroy on a background thread to avoid blocking main
            // mpv_terminate_destroy may need main thread for AVFoundation cleanup,
            // so we can't call it while blocking main with queue.sync
            let handleToDestroy = handle
            mpv = nil  // Clear immediately so nothing else uses it
            DispatchQueue.global(qos: .userInitiated).async {
                mpv_terminate_destroy(handleToDestroy)
            }
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if #available(iOS 18.0, tvOS 17.0, *) {
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
        initialAudioId: Int? = nil,
        cacheEnabled: String? = nil,
        cacheSeconds: Int? = nil,
        demuxerMaxBytes: Int? = nil,
        demuxerMaxBackBytes: Int? = nil
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
            // Fresh file, fresh recovery budget (see performDecoderReset)
            self.decoderResetCount = 0
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.delegate?.renderer(self, didChangeLoading: true)
            }

            guard let handle = self.mpv else { return }

            self.apply(commands: preset.commands, on: handle)
            // Stop previous playback before loading new file
            self.command(handle, ["stop"])
            self.updateHTTPHeaders(headers)

            // Apply cache/buffer settings
            if let cacheMode = cacheEnabled {
                self.setProperty(name: "cache", value: cacheMode)
            }
            if let cacheSecs = cacheSeconds {
                self.setProperty(name: "cache-secs", value: String(cacheSecs))
            }
            if let maxBytes = demuxerMaxBytes {
                self.setProperty(name: "demuxer-max-bytes", value: "\(maxBytes)MiB")
            }
            if let maxBackBytes = demuxerMaxBackBytes {
                self.setProperty(name: "demuxer-max-back-bytes", value: "\(maxBackBytes)MiB")
            }

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
            ("paused-for-cache", MPV_FORMAT_FLAG),
            ("demuxer-cache-duration", MPV_FORMAT_DOUBLE),
            ("current-ao", MPV_FORMAT_STRING)
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
    
    @discardableResult
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
            if !pendingExternalSubtitles.isEmpty, let handle = mpv {
                for (index, subUrl) in pendingExternalSubtitles.enumerated() {
                    print("🔧 Adding external subtitle [\(index)]: \(subUrl)")
                    // Use commandSync to ensure subs are added in exact order (not async)
                    // "auto" flag = add without auto-selecting
                    commandSync(handle, ["sub-add", subUrl, "auto"])
                }
                pendingExternalSubtitles = []
            }
            // Apply the initial audio/subtitle selection now that the file's
            // tracks are enumerated. Setting sid/aid before `loadfile` does not
            // reliably stick for embedded tracks (the selection is silently
            // dropped), so we (re)apply here for embedded and external alike.
            // This is what makes a carried-over subtitle show up on the next
            // episode without a manual re-selection.
            if let audioId = initialAudioId, audioId > 0 {
                setAudioTrack(audioId)
            }
            if let subId = initialSubtitleId {
                setSubtitleTrack(subId)
            } else {
                disableSubtitles()
            }
            // The disable above can race a JS-side identity selection that
            // landed before FILE_LOADED (JS no longer passes an initial sid).
            // Re-emit tracksReady so the idempotent JS re-apply always runs
            // after it — for embedded-only files this is the only
            // post-FILE_LOADED fire.
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.delegate?.renderer(self, didBecomeTracksReady: true)
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

            // Detect HDR mode for tvOS display switching
            detectHDRMode()

        case MPV_EVENT_SEEK:
            // Seek started - show loading indicator and enable immediate progress updates
            isSeeking = true
            if !isLoading {
                isLoading = true
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.renderer(self, didChangeLoading: true)
                }
            }
            
        case MPV_EVENT_PLAYBACK_RESTART:
            // Video playback has started/restarted (including after seek)
            isSeeking = false
            if isLoading {
                isLoading = false
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.renderer(self, didChangeLoading: false)
                }
            }
        case MPV_EVENT_END_FILE:
            // Only a real EOF counts as "playback ended". The other reasons
            // (stop, quit, error, redirect) fire during teardown and stream
            // replacement, where an end event would incorrectly trigger the
            // native player's auto-advance/auto-close.
            if let endFile = event.data?.assumingMemoryBound(to: mpv_event_end_file.self).pointee,
               endFile.reason == MPV_END_FILE_REASON_EOF {
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.rendererDidReachEnd(self)
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
                    self.delegate?.renderer(self, didUpdatePosition: self.cachedPosition, duration: self.cachedDuration, cacheSeconds: self.cachedCacheSeconds)
                }
            }
        case "time-pos":
            var value = Double(0)
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_DOUBLE, value: &value)
            if status >= 0 {
                cachedPosition = value
                // Always update immediately when seeking, otherwise throttle to once per second
                let now = CFAbsoluteTimeGetCurrent()
                let shouldUpdate = isSeeking || (now - lastProgressUpdateTime >= 1.0)
                if shouldUpdate {
                    lastProgressUpdateTime = now
                    DispatchQueue.main.async { [weak self] in
                        guard let self else { return }
                        self.delegate?.renderer(self, didUpdatePosition: self.cachedPosition, duration: self.cachedDuration, cacheSeconds: self.cachedCacheSeconds)
                    }
                }
            }
        case "demuxer-cache-duration":
            var value = Double(0)
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_DOUBLE, value: &value)
            if status >= 0 {
                cachedCacheSeconds = value
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
        case "current-ao":
            // Audio output is now active - notify delegate
            if let aoName = getStringProperty(handle: handle, name: name) {
                print("[MPV] 🔊 Audio output selected: \(aoName)")
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.renderer(self, didSelectAudioOutput: aoName)
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
            guard getProperty(handle: handle, name: "track-list/\(i)/id", format: MPV_FORMAT_INT64, value: &trackId) >= 0 else { continue }

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

            // Identity fields used to map a Jellyfin subtitle to the real track
            // (instead of fragile positional counting). `external` + `external-filename`
            // uniquely identify a sub-added sidecar. `ff-index` is exposed for
            // diagnostics / potential future exact-index matching; the current
            // resolver matches embedded tracks by language/title, not ff-index.
            var external: Int32 = 0
            getProperty(handle: handle, name: "track-list/\(i)/external", format: MPV_FORMAT_FLAG, value: &external)
            track["external"] = external != 0

            if let extFilename = getStringProperty(handle: handle, name: "track-list/\(i)/external-filename") {
                track["externalFilename"] = extFilename
            }

            var ffIndex: Int64 = 0
            if getProperty(handle: handle, name: "track-list/\(i)/ff-index", format: MPV_FORMAT_INT64, value: &ffIndex) >= 0 {
                track["ffIndex"] = Int(ffIndex)
            }

            var selected: Int32 = 0
            getProperty(handle: handle, name: "track-list/\(i)/selected", format: MPV_FORMAT_FLAG, value: &selected)
            track["selected"] = selected != 0

            Logger.shared.log("getSubtitleTracks: found sub track id=\(trackId), title=\(track["title"] ?? "none"), lang=\(track["lang"] ?? "none"), external=\(external != 0)", type: "Info")
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

    func setSubtitleDelay(_ seconds: Double) {
        setProperty(name: "sub-delay", value: String(seconds))
    }

    func setAudioDelay(_ seconds: Double) {
        setProperty(name: "audio-delay", value: String(seconds))
    }

    func setVolumeBoost(_ percent: Int) {
        // Softvol gain: 100 = neutral, above amplifies. volume-max defaults
        // to 130, so lift the ceiling first or 150/200% writes get clamped.
        setProperty(name: "volume-max", value: "200")
        setProperty(name: "volume", value: String(percent))
    }

    /// Speech-clarity EQ ("dialogue boost"): cut the low rumble where scores
    /// and explosions live, lift the 2-3kHz presence band where consonants
    /// live. EQ rather than a compressor because MPVKit's trimmed FFmpeg
    /// build ships no dynaudnorm/loudnorm/acompressor — `equalizer` (lavfi)
    /// is available. Gains are modest and net-neutral-ish so the float path
    /// cannot clip.
    func setDialogueBoost(_ enabled: Bool) {
        if enabled {
            setProperty(
                name: "af",
                value: "lavfi=[equalizer=f=100:t=q:w=1.2:g=-6,equalizer=f=2800:t=q:w=1.2:g=5]"
            )
        } else {
            setProperty(name: "af", value: "")
        }
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

    func setSubtitleBackgroundColor(_ color: String) {
        setProperty(name: "sub-back-color", value: color)
    }

    func setSubtitleBorderStyle(_ style: String) {
        // "outline-and-shadow" (default) or "background-box" (enables background color)
        setProperty(name: "sub-border-style", value: style)
    }

    func setSubtitleAssOverride(_ mode: String) {
        // Controls whether to override ASS subtitle styles
        // "no" = keep ASS styles, "force" = override with user settings
        setProperty(name: "sub-ass-override", value: mode)
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
            guard getProperty(handle: handle, name: "track-list/\(i)/id", format: MPV_FORMAT_INT64, value: &trackId) >= 0 else { continue }

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

    // MARK: - HDR Detection

    /// Detects the HDR mode of the currently playing video by reading mpv properties
    private func detectHDRMode() {
        guard let handle = mpv else { return }

        // Get video color properties
        let primaries = getStringProperty(handle: handle, name: "video-params/primaries")
        let gamma = getStringProperty(handle: handle, name: "video-params/gamma")

        // Get FPS for display criteria
        var fps: Double = 24.0
        getProperty(handle: handle, name: "container-fps", format: MPV_FORMAT_DOUBLE, value: &fps)
        if fps <= 0 { fps = 24.0 }

        Logger.shared.log("HDR Detection - primaries: \(primaries ?? "nil"), gamma: \(gamma ?? "nil"), fps: \(fps)", type: "Info")

        // Determine HDR mode based on color properties
        // bt.2020 primaries with PQ gamma = HDR10 or Dolby Vision
        // bt.2020 primaries with HLG gamma = HLG
        // Otherwise SDR
        let hdrMode: HDRMode

        if primaries == "bt.2020" || primaries == "bt.2020-ncl" {
            if gamma == "pq" {
                // PQ gamma indicates HDR10 or Dolby Vision
                // We'll use hdr10 as the base, Dolby Vision detection would need codec inspection
                // For DV Profile 8.1, HDR10 fallback should work
                hdrMode = .hdr10
            } else if gamma == "hlg" {
                hdrMode = .hlg
            } else {
                // bt.2020 without HDR gamma - still request HDR mode for wide color
                hdrMode = .hdr10
            }
        } else {
            hdrMode = .sdr
        }

        Logger.shared.log("HDR Detection - detected mode: \(hdrMode)", type: "Info")

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.renderer(self, didDetectHDRMode: hdrMode, fps: fps)
        }
    }

    // MARK: - Technical Info

    func getTechnicalInfo() -> [String: Any] {
        guard let handle = mpv else { return [:] }

        var info: [String: Any] = [:]

        // Video dimensions
        var videoWidth: Int64 = 0
        var videoHeight: Int64 = 0
        if getProperty(handle: handle, name: "video-params/w", format: MPV_FORMAT_INT64, value: &videoWidth) >= 0 {
            info["videoWidth"] = Int(videoWidth)
        }
        if getProperty(handle: handle, name: "video-params/h", format: MPV_FORMAT_INT64, value: &videoHeight) >= 0 {
            info["videoHeight"] = Int(videoHeight)
        }

        // Video codec
        if let videoCodec = getStringProperty(handle: handle, name: "video-format") {
            info["videoCodec"] = videoCodec
        }

        // Audio codec
        if let audioCodec = getStringProperty(handle: handle, name: "audio-codec-name") {
            info["audioCodec"] = audioCodec
        }

        // FPS (container fps)
        var fps: Double = 0
        if getProperty(handle: handle, name: "container-fps", format: MPV_FORMAT_DOUBLE, value: &fps) >= 0 && fps > 0 {
            info["fps"] = fps
        }

        // Video bitrate (bits per second)
        var videoBitrate: Int64 = 0
        if getProperty(handle: handle, name: "video-bitrate", format: MPV_FORMAT_INT64, value: &videoBitrate) >= 0 && videoBitrate > 0 {
            info["videoBitrate"] = Int(videoBitrate)
        }

        // Audio bitrate (bits per second)
        var audioBitrate: Int64 = 0
        if getProperty(handle: handle, name: "audio-bitrate", format: MPV_FORMAT_INT64, value: &audioBitrate) >= 0 && audioBitrate > 0 {
            info["audioBitrate"] = Int(audioBitrate)
        }

        // Demuxer cache duration (seconds of video buffered)
        var cacheSeconds: Double = 0
        if getProperty(handle: handle, name: "demuxer-cache-duration", format: MPV_FORMAT_DOUBLE, value: &cacheSeconds) >= 0 {
            info["cacheSeconds"] = cacheSeconds
        }

        // Configured cache limits — read back from mpv to confirm user
        // settings actually took effect. mpv stores byte sizes as int64
        // (bytes); convert to MiB for display.
        var demuxerMaxBytes: Int64 = 0
        if getProperty(handle: handle, name: "demuxer-max-bytes", format: MPV_FORMAT_INT64, value: &demuxerMaxBytes) >= 0 {
            info["demuxerMaxBytes"] = Int(demuxerMaxBytes / (1024 * 1024))
        }
        var demuxerMaxBackBytes: Int64 = 0
        if getProperty(handle: handle, name: "demuxer-max-back-bytes", format: MPV_FORMAT_INT64, value: &demuxerMaxBackBytes) >= 0 {
            info["demuxerMaxBackBytes"] = Int(demuxerMaxBackBytes / (1024 * 1024))
        }
        var cacheSecsLimit: Double = 0
        if getProperty(handle: handle, name: "cache-secs", format: MPV_FORMAT_DOUBLE, value: &cacheSecsLimit) >= 0 {
            info["cacheSecsLimit"] = cacheSecsLimit
        }

        // Dropped frames
        var droppedFrames: Int64 = 0
        if getProperty(handle: handle, name: "frame-drop-count", format: MPV_FORMAT_INT64, value: &droppedFrames) >= 0 {
            info["droppedFrames"] = Int(droppedFrames)
        }

        // Active video output driver
        if let voDriver = getStringProperty(handle: handle, name: "vo") {
            info["voDriver"] = voDriver
        }

        // Active hardware decoder
        if let hwdec = getStringProperty(handle: handle, name: "hwdec-current") {
            info["hwdec"] = hwdec
        }

        // Estimated video output fps (post-filter)
        var estimatedVfFps: Double = 0
        if getProperty(handle: handle, name: "estimated-vf-fps", format: MPV_FORMAT_DOUBLE, value: &estimatedVfFps) >= 0 && estimatedVfFps > 0 {
            info["estimatedVfFps"] = estimatedVfFps
        }

        return info
    }
}
