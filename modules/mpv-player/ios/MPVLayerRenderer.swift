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

    // Key to identify if we're already on stateQueue. deinit can run ON a
    // stateQueue worker: when an async barrier block holding the last strong
    // reference to self is released while the lane drains, deinit → stop() →
    // isStopping would stateQueue.sync onto the queue this thread already
    // owns, and libdispatch traps that as EXC_BREAKPOINT. The weak captures
    // in the async setters prevent that ownership, and the accessors below
    // read the backing field directly when already on the queue as a second
    // line of defence.
    private static let stateQueueKey = DispatchSpecificKey<Bool>()

    private var isOnStateQueue: Bool {
        DispatchQueue.getSpecific(key: Self.stateQueueKey) == true
    }
    
    private var mpv: OpaquePointer?
    
    private var pendingExternalSubtitles: [String] = []
    private var initialSubtitleId: Int?
    private var initialAudioId: Int?
    
    private var _isRunning = false
    private var _isStopping = false
    private var _isMuted = false
    private var routeChangeObserver: NSObjectProtocol?

    private var isRunning: Bool {
        get {
            if isOnStateQueue { return _isRunning }
            return stateQueue.sync { _isRunning }
        }
        set { stateQueue.async(flags: .barrier) { [weak self] in self?._isRunning = newValue } }
    }

    private var isStopping: Bool {
        get {
            if isOnStateQueue { return _isStopping }
            return stateQueue.sync { _isStopping }
        }
        set {  // Must be sync for stop() to work
            if isOnStateQueue {
                _isStopping = newValue
                return
            }
            stateQueue.sync(flags: .barrier) { _isStopping = newValue }
        }
    }

    /// Retained across mpv re-creation; see setMute. Sync setter like
    /// isStopping: start() reads it on the render queue right after setMute
    /// writes it from the JS thread, so an async barrier could hand the fresh
    /// handle a stale value and leave playback audible.
    private var isMuted: Bool {
        get { stateQueue.sync { _isMuted } }
        set { stateQueue.sync(flags: .barrier) { _isMuted = newValue } }
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
        set { stateQueue.async(flags: .barrier) { [weak self] in self?._cachedDuration = newValue } }
    }
    private var cachedPosition: Double {
        get { stateQueue.sync { _cachedPosition } }
        set { stateQueue.async(flags: .barrier) { [weak self] in self?._cachedPosition = newValue } }
    }
    private var cachedCacheSeconds: Double {
        get { stateQueue.sync { _cachedCacheSeconds } }
        set { stateQueue.async(flags: .barrier) { [weak self] in self?._cachedCacheSeconds = newValue } }
    }
    private var isPaused: Bool {
        get { stateQueue.sync { _isPaused } }
        set { stateQueue.async(flags: .barrier) { [weak self] in self?._isPaused = newValue } }
    }
    private var playbackSpeed: Double {
        get { stateQueue.sync { _playbackSpeed } }
        set { stateQueue.async(flags: .barrier) { [weak self] in self?._playbackSpeed = newValue } }
    }
    private var isLoading: Bool {
        get { stateQueue.sync { _isLoading } }
        set { stateQueue.async(flags: .barrier) { [weak self] in self?._isLoading = newValue } }
    }
    private var isReadyToSeek: Bool {
        get { stateQueue.sync { _isReadyToSeek } }
        set { stateQueue.async(flags: .barrier) { [weak self] in self?._isReadyToSeek = newValue } }
    }
    private var isSeeking: Bool {
        get { stateQueue.sync { _isSeeking } }
        set { stateQueue.async(flags: .barrier) { [weak self] in self?._isSeeking = newValue } }
    }
    
    var isPausedState: Bool {
        return isPaused
    }
    
    init(displayLayer: AVSampleBufferDisplayLayer) {
        self.displayLayer = displayLayer
        self.queue = DispatchQueue(label: "mpv.avfoundation", qos: .userInitiated)
        queue.setSpecific(key: Self.queueKey, value: true)
        stateQueue.setSpecific(key: Self.stateQueueKey, value: true)
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

    #if os(iOS)
    /// SpringBoard can leave mpv's OSD stale even when video resumes.
    func restoreSubtitlesAfterForeground() {
        guard isRunning, !isStopping, let expectedHandle = mpv else { return }
        syncSubtitleLayerFrame()
        queue.async { [weak self] in
            guard let self, self.mpv == expectedHandle, !self.isStopping else { return }
            var sid: Int64 = 0
            guard self.getProperty(
                handle: expectedHandle, name: "sid", format: MPV_FORMAT_INT64, value: &sid) >= 0,
                sid > 0
            else { return }
            self.commandSync(expectedHandle, ["set", "sub-visibility", "no"])
            self.commandSync(expectedHandle, ["set", "sub-visibility", "yes"])
        }
    }
    #endif
    
    deinit {
        stop()
    }
    
    func start() throws {
        guard !isRunning else { return }
        guard let handle = mpv_create() else {
            throw RendererError.mpvCreationFailed
        }
        mpv = handle

        // Logging. Release builds used to request nothing at all, so a
        // TestFlight log could never show WHY playback failed - #1673 (silent
        // tvOS audio) went through two wrong fixes because the only evidence,
        // "unable to retrieve audio unit channel layout", never left mpv.
        // "info" is cheap (a handful of lines per file) and includes the
        // "AO: [audiounit] 48000Hz 5.1 6ch floatp" summary; what gets
        // forwarded to the app log is filtered in the MPV_EVENT_LOG_MESSAGE
        // handler.
        checkError(mpv_request_log_messages(handle, "info"))

        logAudioRoute("player start")
        routeChangeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil
        ) { [weak self] note in
            let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
            self?.logAudioRoute("route change, reason=\(reason)")
        }

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

        // Audio output: pin tvOS to audiounit. Do NOT reach for the
        // avfoundation AO here - it is a macOS-oriented driver, and the audio
        // clock it hands mpv is what video timing is scheduled against:
        //
        //   ao_read_data(ao, data, n, end_time_av - cur_time_av + cur_time_mp + dt, ...)
        //
        // That anchor is polled off [AVSampleBufferRenderSynchronizer currentTime]
        // and carries no device-latency term at all. On a real Apple TV the HDMI
        // route adds tens of ms of unmodelled output latency and currentTime is
        // coarse, so the anchor is both offset and noisy at the feed rate
        // (samplerate/10, ~100ms chunks) - video stalls, stutters, then jumps on
        // the correction. audiounit instead anchors off the hardware
        // AudioTimeStamp per render callback plus AVAudioSession output latency,
        // which is stable over HDMI. The simulator hides all of this: ~0 output
        // latency and a fine-grained device clock, so avfoundation looks fine
        // there and only fails on device.
        //
        // The silence #1970 was chasing (#1673) is fixed in the AO itself, not
        // by swapping AOs. On HDMI routes carrying Dolby MAT ("Continuous Audio
        // Connection" with an Atmos sink) the audio unit refuses the
        // kAudioUnitProperty_AudioChannelLayout query outright, and stock
        // ao_audiounit.m treated that as fatal ("unable to retrieve audio unit
        // channel layout") - so with audiounit pinned there was no audio output
        // at all. MPVKit 0.41.0-av4 falls back to stereo there instead, the way
        // VLC's audiounit_ios does; av3's clamp for layouts that come back with
        // labels mpv cannot map stays in as well. iOS is unchanged either way -
        // its autoprobe already picks audiounit ahead of avfoundation.
        #if os(tvOS)
        checkError(mpv_set_option_string(handle, "ao", "audiounit"))
        #endif

        // Subtitle and audio settings
        checkError(mpv_set_option_string(mpv, "sub-scale-with-window", "no"))
        checkError(mpv_set_option_string(mpv, "sub-use-margins", "no"))
        checkError(mpv_set_option_string(mpv, "subs-match-os-language", "yes"))
        checkError(mpv_set_option_string(mpv, "subs-fallback", "yes"))
        checkError(mpv_set_option_string(mpv, "sub-vsfilter-bidi-compat", "yes"))

        // Bundled fallback fonts. Must run before mpv_initialize() — libass is
        // configured once, from the config dir mpv resolves at init time.
        setupSubtitleFonts(handle)

        // Initialize mpv
        let initStatus = mpv_initialize(handle)
        guard initStatus >= 0 else {
            throw RendererError.mpvInitialization(initStatus)
        }

        // Re-apply the retained mute flag: a fresh instance always starts
        // audible, which would contradict the state JS still holds.
        if isMuted {
            setProperty(name: "mute", value: "yes")
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

    // MARK: - Subtitle Fonts

    /// Bundled Noto faces, and where each one plugs into libass.
    ///
    /// libass resolves every glyph through `ass_font_select`, in this order:
    ///   1. the family the subtitle asks for (an ASS `Style:` FontName) — glyph-checked
    ///   2. `--sub-font`                                                 — glyph-checked
    ///   3. the system provider's fallback (CoreText here)               — glyph-checked
    ///   4. `subfont.ttf` in mpv's config dir                            — taken BLINDLY
    ///
    /// Step 3 is the one that breaks on Apple platforms: CoreText answers with a
    /// font *name*, which libass then has to open as a *file*. Since iOS 18 the
    /// system CJK face lives in `/System/Library/PrivateFrameworks/…/PingFangUI.ttc`,
    /// which the sandbox will not open — and it uses a nonstandard `hvgl` table
    /// FreeType cannot parse regardless. With step 3 failing and nothing in step 4,
    /// CJK subtitles render as tofu boxes (issue #1789). Apple's guidance for this
    /// exact case is to ship your own font instead of reading system font files.
    ///
    /// So we fill the two slots that do not depend on CoreText:
    ///   - `<config-dir>/fonts/`     enters libass' own font DB, glyph-checked, so a
    ///                               face is only ever used for glyphs it really has
    ///   - `<config-dir>/subfont.ttf` the blind last resort — the CJK face goes here
    ///                               because it is the widest net, and libass opens
    ///                               it by path rather than reading it into memory
    ///
    /// and point `--sub-font` at the bundled Latin face so step 2 resolves
    /// deterministically instead of landing on whatever CoreText happens to pick.
    ///
    /// Android needs none of this: its libmpv builds libass with the fontconfig
    /// provider pointed at `/system/fonts`, so the device's own fonts are reachable.
    private func setupSubtitleFonts(_ handle: OpaquePointer) {
        guard let configDir = Self.mpvConfigDirectory() else { return }

        let fm = FileManager.default
        let fontsDir = configDir.appendingPathComponent("fonts", isDirectory: true)
        do {
            try fm.createDirectory(at: fontsDir, withIntermediateDirectories: true)
        } catch {
            Logger.shared.log(
                "Could not prepare subtitle font directory: \(error.localizedDescription)",
                type: "Warn"
            )
            return
        }

        // Keep libass' font DB isolated without copying 17 MB on the main thread.
        // The links are refreshed when an app update changes the bundle path.
        for name in Self.subtitleFontResources {
            Self.linkFont(named: name, at: fontsDir.appendingPathComponent(name))
        }
        Self.linkFont(
            named: Self.subtitleFallbackFontResource,
            at: configDir.appendingPathComponent("subfont.ttf")
        )

        checkError(mpv_set_option_string(handle, "config", "yes"))
        checkError(mpv_set_option_string(handle, "config-dir", configDir.path))
        checkError(mpv_set_option_string(handle, "sub-font", Self.subtitleFontFamily))
    }

    /// Faces that go into libass' font DB (`<config-dir>/fonts`).
    private static let subtitleFontResources = [
        "NotoSans-Regular.ttf",
        "NotoSansArabic-Regular.ttf",
        "NotoSansHebrew-Regular.ttf",
    ]

    /// Face linked to `<config-dir>/subfont.ttf`, libass' unconditional last resort.
    private static let subtitleFallbackFontResource = "NotoSansCJKsc-Regular.otf"

    /// Family name of `NotoSans-Regular.ttf`, used as `--sub-font`.
    private static let subtitleFontFamily = "Noto Sans"

    /// mpv `sub-font` for a subtitle font setting. "System" names the bundled
    /// default rather than writing an empty family: an empty `sub-font` drops
    /// the Latin default installed by setupSubtitleFonts and sends libass back
    /// through CoreText glyph by glyph, which is the #1789 tofu path.
    static func mpvSubtitleFont(_ font: String) -> String {
        switch font {
        case "System":
            return subtitleFontFamily
        case "sans-serif":
            return "Helvetica"
        case "serif":
            return "Georgia"
        case "monospace":
            return "Menlo"
        case "opendyslexic":
            return "OpenDyslexic"
        default:
            return font
        }
    }

    /// Writable, backup-excluded directory handed to mpv as `--config-dir`.
    private static func mpvConfigDirectory() -> URL? {
        let fm = FileManager.default
        do {
            let root = try fm.url(
                for: .cachesDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            let dir = root.appendingPathComponent("mpv", isDirectory: true)
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            return dir
        } catch {
            Logger.shared.log(
                "Could not prepare mpv cache directory: \(error.localizedDescription)",
                type: "Warn"
            )
            return nil
        }
    }

    /// Links an immutable bundled font into mpv's isolated font directory.
    private static func linkFont(named resource: String, at destination: URL) {
        let fm = FileManager.default
        let name = (resource as NSString).deletingPathExtension
        let ext = (resource as NSString).pathExtension

        guard let source = Bundle.main.url(forResource: name, withExtension: ext) else {
            Logger.shared.log("Bundled subtitle font \(resource) is missing", type: "Warn")
            return
        }

        let currentTarget = try? fm.destinationOfSymbolicLink(atPath: destination.path)
        if let currentTarget,
            URL(fileURLWithPath: currentTarget).standardizedFileURL
                == source.standardizedFileURL
        {
            return
        }

        do {
            if currentTarget != nil || fm.fileExists(atPath: destination.path) {
                try fm.removeItem(at: destination)
            }
            try fm.createSymbolicLink(at: destination, withDestinationURL: source)
        } catch {
            Logger.shared.log(
                "Could not link subtitle font \(resource): \(error.localizedDescription)",
                type: "Warn"
            )
        }
    }

    func stop() {
        if isStopping { return }
        if !isRunning, mpv == nil { return }
        isRunning = false
        isStopping = true

        // Stop observing display layer status
        statusObservation?.invalidate()
        statusObservation = nil

        if let routeChangeObserver {
            NotificationCenter.default.removeObserver(routeChangeObserver)
            self.routeChangeObserver = nil
        }

        // Clear wakeup callback first to stop event processing
        if let handle = mpv {
            mpv_set_wakeup_callback(handle, nil, nil)
            mpv = nil  // Clear immediately so nothing else uses it

            // Quit + drain + destroy on the mpv queue WITHOUT blocking the
            // caller: stop() runs on main (dismiss/deinit), and a queue.sync
            // here can wedge behind a client call that is itself waiting out
            // vo_create — the exact watchdog cycle onQueue() documents. The
            // block deliberately captures only the raw handle, never self
            // (stop() may run from deinit). Ordering on the serial queue
            // guarantees the drain runs after any still-pending client calls
            // against this handle, and terminate runs after the drain.
            queue.async {
                Self.quitAndDrain(handle)
                // mpv_terminate_destroy may need the main thread for
                // AVFoundation cleanup, so keep it off this queue too.
                DispatchQueue.global(qos: .userInitiated).async {
                    mpv_terminate_destroy(handle)
                }
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
        loop: Bool = false,
        cacheEnabled: String? = nil,
        cacheSeconds: Int? = nil,
        demuxerMaxBytes: Int? = nil,
        demuxerMaxBackBytes: Int? = nil
    ) {
        queue.async { [weak self] in
            guard let self else { return }
            // Assigned on the queue, not the caller's thread: these values are
            // read by event handlers and reloads that also run on this queue.
            self.pendingExternalSubtitles = externalSubtitles ?? []
            self.initialSubtitleId = initialSubtitleId
            self.initialAudioId = initialAudioId
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

            // Set looping
            self.setProperty(name: "loop-file", value: loop ? "inf" : "no")

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
    
    func applyPreset(_ preset: PlayerPreset) {
        guard let handle = mpv else { return }
        queue.async { [weak self] in
            guard let self else { return }
            self.apply(commands: preset.commands, on: handle)
        }
    }
    
    // MARK: - Property Helpers

    private var isOnQueue: Bool {
        DispatchQueue.getSpecific(key: Self.queueKey) == true
    }

    /// Runs `work` on the serial mpv work queue without ever blocking the
    /// caller. Blocking libmpv client calls (mpv_get_property /
    /// mpv_set_property / mpv_command) wait on the core's dispatch lock, and
    /// during vo_create the core rendezvouses with the vo thread, whose
    /// avfoundation preinit dispatch_syncs onto the MAIN queue. A blocking
    /// client call made from main in that window therefore deadlocks
    /// main ⇄ core ⇄ vo until the 10s scene-update watchdog kills the app
    /// (0x8BADF00D). Every public mpv-touching entry point hops through here;
    /// callers already on the queue (event handlers, the load block) run
    /// inline so their ordering is unchanged.
    private func onQueue(_ work: @escaping () -> Void) {
        if isOnQueue { work() } else { queue.async(execute: work) }
    }

    private func setOption(name: String, value: String) {
        guard let handle = mpv else { return }
        checkError(mpv_set_option_string(handle, name, value))
    }

    private func setProperty(name: String, value: String) {
        onQueue { [weak self] in
            guard let self, let handle = self.mpv else { return }
            let status = mpv_set_property_string(handle, name, value)
            if status < 0 {
                Logger.shared.log("Failed to set property \(name)=\(value) (\(status))", type: "Warn")
            }
        }
    }
    
    /// Mute the player itself; the device output volume is left untouched.
    ///
    /// The flag is retained so it survives mpv re-creation (next episode,
    /// bitrate change, track re-negotiation). Without it the new instance would
    /// come back audible while JS still believes playback is muted.
    func setMute(_ muted: Bool) {
        isMuted = muted
        setProperty(name: "mute", value: muted ? "yes" : "no")
    }

    private func clearProperty(name: String) {
        onQueue { [weak self] in
            guard let self, let handle = self.mpv else { return }
            let status = mpv_set_property(handle, name, MPV_FORMAT_NONE, nil)
            if status < 0 {
                Logger.shared.log("Failed to clear property \(name) (\(status))", type: "Warn")
            }
        }
    }
    
    private func updateHTTPHeaders(_ headers: [String: String]?) {
        // Emptying the list is what clears it; MPV_FORMAT_NONE is rejected for a
        // string list, which would leave the previous item's headers in place.
        setProperty(name: "http-header-fields", value: "")
        guard let headers, !headers.isEmpty else { return }

        // http-header-fields is an mpv string *list*, and through the property
        // interface only the plain comma-separated form is understood: the
        // %<len>% escape arrives at the server as part of the field name, and
        // the -append modifier is ignored outright. A header value containing a
        // comma therefore cannot be expressed here (it would split into two).
        let headerString = headers
            .map { key, value in "\(key): \(value)" }
            .joined(separator: ",")
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

    /// Teardown helper for stop(): sends "quit" and drains pending events.
    /// Static so the teardown block never captures self (stop() can run from
    /// deinit, where escaping self is unsafe).
    private static func quitAndDrain(_ handle: OpaquePointer) {
        "quit".withCString { quit in
            var args: [UnsafePointer<CChar>?] = [quit, nil]
            args.withUnsafeMutableBufferPointer { buffer in
                _ = mpv_command(handle, buffer.baseAddress)
            }
        }
        var drainCount = 0
        let maxDrain = 100
        while drainCount < maxDrain, let event = mpv_wait_event(handle, 0.1)?.pointee {
            if event.event_id == MPV_EVENT_NONE || event.event_id == MPV_EVENT_SHUTDOWN {
                break
            }
            drainCount += 1
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
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                // Route on mpv's own level, not on the message text: CoreAudio
                // failures read "unable to ... (what/-10879)" and contain
                // neither "error" nor "warn", so the old substring match
                // dropped exactly the lines that mattered.
                let level = logMessagePointer.pointee.log_level.rawValue
                if level <= MPV_LOG_LEVEL_ERROR.rawValue {
                    Logger.shared.log("mpv[\(component)] \(text)", type: "Error")
                } else if level <= MPV_LOG_LEVEL_WARN.rawValue {
                    Logger.shared.log("mpv[\(component)] \(text)", type: "Warn")
                } else if Self.isDiagnosticInfoLine(component: component, text: text) {
                    // Info is requested for the audio/video output summaries
                    // only; the rest (track listings, "Playing:", ...) would
                    // crowd the app log's small ring buffer.
                    Logger.shared.log("mpv[\(component)] \(text)", type: "Info")
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
    
    // MARK: - Audio diagnostics

    /// mpv "info" lines worth keeping in the app log: the negotiated output
    /// summaries ("AO: [audiounit] 48000Hz stereo 2ch floatp", "VO: ...") and
    /// anything the audio output itself says. Everything else at info level
    /// is per-track chatter.
    private static func isDiagnosticInfoLine(component: String, text: String) -> Bool {
        if component == "ao" || component.hasPrefix("ao/") { return true }
        return text.hasPrefix("AO: ") || text.hasPrefix("VO: ")
    }

    /// One line describing the AVAudioSession output route, written to the app
    /// log so it shows up in an export - or on the TV's log screen, which has
    /// no export. Silent tvOS audio (#1673) was guessed at twice because nothing
    /// recorded what the HDMI route actually reported; this is that record.
    /// Channel labels are CoreAudio AudioChannelLabel values (1=L, 2=R, 3=C,
    /// 4=LFE, 5=Ls, 6=Rs, ...; 0xFFFFFFFF=unknown; 0x1000N=discrete N).
    private func logAudioRoute(_ reason: String) {
        let session = AVAudioSession.sharedInstance()
        let outputs = session.currentRoute.outputs.map { port -> String in
            let channels = port.channels ?? []
            let labels = channels.map { String($0.channelLabel) }.joined(separator: ",")
            return "\(port.portType.rawValue)(\(channels.count)ch labels=[\(labels)])"
        }
        Logger.shared.log(
            "Audio route (\(reason)): outputs=\(outputs.joined(separator: " + ")) "
                + "outputChannels=\(session.outputNumberOfChannels) "
                + "maxChannels=\(session.maximumOutputNumberOfChannels) "
                + "sampleRate=\(Int(session.sampleRate)) "
                + "outputLatency=\(Int(session.outputLatency * 1000))ms",
            type: "Info"
        )
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
        guard mpv != nil else { return }
        let clamped = max(0, seconds)
        cachedPosition = clamped
        onQueue { [weak self] in
            guard let self, let handle = self.mpv else { return }
            self.commandSync(handle, ["seek", String(clamped), "absolute"])
        }
    }



    func seek(by seconds: Double) {
        guard mpv != nil else { return }
        let newPosition = max(0, cachedPosition + seconds)
        cachedPosition = newPosition
        onQueue { [weak self] in
            guard let self, let handle = self.mpv else { return }
            self.commandSync(handle, ["seek", String(seconds), "relative"])
        }
    }

    /// Keep MPVKit's non-composited subtitle layer aligned with the display.
    /// Portrait fill must crop it with the video; landscape stays aspect-fitted
    /// so subtitles retain their normal bottom margin.
    func syncSubtitleLayerFrame() {
        guard let subtitleLayer = displayLayer.sublayers?.last else { return }
        subtitleLayer.contentsGravity =
            displayLayer.videoGravity == .resizeAspectFill
                && displayLayer.bounds.height > displayLayer.bounds.width
            ? .resizeAspectFill
            : .resizeAspect
        #if os(tvOS) || targetEnvironment(simulator)
        subtitleLayer.frame = displayLayer.bounds
        #endif
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
        // Cached mirror, not a live mpv read: speed only changes through
        // setSpeed(), and a blocking mpv_get_property here may run on the
        // main thread (see onQueue).
        return playbackSpeed
    }
    
    // MARK: - Subtitle Controls

    /// Non-blocking track enumeration; the completion fires on the mpv work
    /// queue. The blocking property reads must never run on the caller's
    /// thread (see onQueue).
    func getSubtitleTracks(completion: @escaping ([[String: Any]]) -> Void) {
        onQueue { [weak self] in
            completion(self?.getSubtitleTracksOnQueue() ?? [])
        }
    }

    private func getSubtitleTracksOnQueue() -> [[String: Any]] {
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
        applyBidiMode(forTrack: trackId)
    }

    private func applyBidiMode(forTrack trackId: Int) {
        onQueue { [weak self] in
            guard let self, let handle = self.mpv else { return }
            let codec = trackId >= 0
                ? self.subtitleCodec(handle: handle, trackId: Int64(trackId))
                : nil
            let isAss = codec == "ass" || codec == "ssa"
            mpv_set_property_string(
                handle, "sub-ass-style-overrides", isAss ? "Encoding=-1" : ""
            )
        }
    }

    private func subtitleCodec(handle: OpaquePointer, trackId: Int64) -> String? {
        var trackCount: Int64 = 0
        getProperty(handle: handle, name: "track-list/count", format: MPV_FORMAT_INT64, value: &trackCount)
        for i in 0..<trackCount {
            guard getStringProperty(handle: handle, name: "track-list/\(i)/type") == "sub" else { continue }
            var id: Int64 = 0
            guard getProperty(handle: handle, name: "track-list/\(i)/id", format: MPV_FORMAT_INT64, value: &id) >= 0,
                  id == trackId else { continue }
            return getStringProperty(handle: handle, name: "track-list/\(i)/codec")
        }
        return nil
    }

    func disableSubtitles() {
        setProperty(name: "sid", value: "no")
        applyBidiMode(forTrack: -1)
    }
    
    func getCurrentSubtitleTrack(completion: @escaping (Int) -> Void) {
        onQueue { [weak self] in
            guard let self, let handle = self.mpv else { return completion(0) }
            var sid: Int64 = 0
            self.getProperty(handle: handle, name: "sid", format: MPV_FORMAT_INT64, value: &sid)
            completion(Int(sid))
        }
    }
    
    func addSubtitleFile(url: String, select: Bool = true) {
        let flag = select ? "select" : "cached"
        onQueue { [weak self] in
            guard let self, let handle = self.mpv else { return }
            self.commandSync(handle, ["sub-add", url, flag])
            guard select else { return }
            var sid: Int64 = -1
            _ = self.getProperty(handle: handle, name: "sid", format: MPV_FORMAT_INT64, value: &sid)
            self.applyBidiMode(forTrack: Int(sid))
        }
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

    /// Accessibility mono downmix — collapses all channels to a single one so
    /// both ears hear the full mix. "auto-safe" is mpv's default layout pick.
    func setMonoDownmix(_ enabled: Bool) {
        setProperty(name: "audio-channels", value: enabled ? "mono" : "auto-safe")
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
    
    func setSubtitleStyle(config: [String: Any]) {
        let isDyslexic = (config["font"] as? String) == "opendyslexic"

        if let fontSize = config["fontSize"] as? Int {
            let size = isDyslexic ? fontSize + 20 : fontSize
            setProperty(name: "sub-font-size", value: String(size))
        } else if let fontSizeDouble = config["fontSize"] as? Double {
            let size = isDyslexic ? Int(fontSizeDouble) + 20 : Int(fontSizeDouble)
            setProperty(name: "sub-font-size", value: String(size))
        }

        if let color = config["color"] as? String {
            setProperty(name: "sub-color", value: color)
        }

        if let font = config["font"] as? String {
            setProperty(name: "sub-font", value: Self.mpvSubtitleFont(font))
        }

        if let background = config["background"] as? String {
            if background.isEmpty {
                setProperty(name: "sub-border-style", value: "outline-and-shadow")
                setProperty(name: "sub-shadow-offset", value: "1")
                setProperty(name: "sub-border-size", value: "3")
            } else {
                setProperty(name: "sub-back-color", value: background)
                setProperty(name: "sub-border-style", value: "background-box")
                let padding: Int
                if let pInt = config["backgroundPadding"] as? Int {
                    padding = pInt
                } else if let pDouble = config["backgroundPadding"] as? Double {
                    padding = Int(pDouble)
                } else {
                    padding = 12
                }
                let finalPadding = isDyslexic ? padding / 2 : padding
                setProperty(name: "sub-shadow-offset", value: String(finalPadding))
                setProperty(name: "sub-border-size", value: "0")
            }
        }
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
        setProperty(name: "sub-ass-override", value: mode == "no" ? "scale" : mode)
    }

    // MARK: - Audio Track Controls

    /// Non-blocking track enumeration; the completion fires on the mpv work
    /// queue (see getSubtitleTracks).
    func getAudioTracks(completion: @escaping ([[String: Any]]) -> Void) {
        onQueue { [weak self] in
            completion(self?.getAudioTracksOnQueue() ?? [])
        }
    }

    private func getAudioTracksOnQueue() -> [[String: Any]] {
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
    
    func getCurrentAudioTrack(completion: @escaping (Int) -> Void) {
        onQueue { [weak self] in
            guard let self, let handle = self.mpv else { return completion(0) }
            var aid: Int64 = 0
            self.getProperty(handle: handle, name: "aid", format: MPV_FORMAT_INT64, value: &aid)
            completion(Int(aid))
        }
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

    /// Non-blocking stats snapshot; the completion fires on the mpv work
    /// queue (see getSubtitleTracks).
    func getTechnicalInfo(completion: @escaping ([String: Any]) -> Void) {
        onQueue { [weak self] in
            completion(self?.getTechnicalInfoOnQueue() ?? [:])
        }
    }

    private func getTechnicalInfoOnQueue() -> [String: Any] {
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
