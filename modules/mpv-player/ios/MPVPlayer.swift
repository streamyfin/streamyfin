import UIKit
import OpenGLES
import Libmpv
import AVFoundation

protocol MPVPlayerDelegate: AnyObject {
    func player(_ player: MPVPlayer, didUpdatePosition position: Double, duration: Double)
    func player(_ player: MPVPlayer, didChangePause isPaused: Bool)
    func player(_ player: MPVPlayer, didChangeLoading isLoading: Bool)
    func player(_ player: MPVPlayer, didBecomeReadyToSeek: Bool)
    func player(_ player: MPVPlayer, didBecomeTracksReady: Bool)
}

/// Simplified MPV player using only OpenGL rendering
final class MPVPlayer {
    
    enum PlayerError: Error {
        case openGLNotSupported
        case mpvCreationFailed
        case mpvInitialization(Int32)
        case renderContextCreation(Int32)
    }
    
    // MARK: - Properties
    
    private var mpv: OpaquePointer?
    private var renderContext: OpaquePointer?
    
    private let renderQueue = DispatchQueue(label: "mpv.render", qos: .userInteractive)
    private let eventQueue = DispatchQueue(label: "mpv.events", qos: .utility)
    private let stateQueue = DispatchQueue(label: "mpv.state", attributes: .concurrent)
    private let eventQueueGroup = DispatchGroup()
    private let renderQueueKey = DispatchSpecificKey<Void>()
    
    // OpenGL resources
    private var eaglContext: EAGLContext?
    private var glLayer: CAEAGLLayer?
    private var defaultFramebuffer: GLuint = 0
    private var colorRenderbuffer: GLuint = 0
    private var framebufferWidth: GLint = 0
    private var framebufferHeight: GLint = 0
    
    // State
    private var videoSize: CGSize = .zero
    private var isRunning = false
    private var isStopping = false
    private var isLoading = false
    private var isReadyToSeek = false
    private var isRenderScheduled = false
    private var lastRenderTime: CFTimeInterval = 0
    private var minRenderInterval: CFTimeInterval = 1.0 / 60.0
    
    // Playback state (thread-safe)
    private var _cachedDuration: Double = 0
    private var _cachedPosition: Double = 0
    private var _isPaused: Bool = true
    private var _playbackSpeed: Double = 1.0
    private var _isSeeking: Bool = false
    private var _positionUpdateTime: CFTimeInterval = 0
    
    // Media info
    private var currentURL: URL?
    private var currentHeaders: [String: String]?
    private var pendingExternalSubtitles: [String] = []
    private var initialSubtitleId: Int?
    private var initialAudioId: Int?
    
    private var disposeBag: [() -> Void] = []
    
    weak var delegate: MPVPlayerDelegate?
    
    // MARK: - Public Accessors
    
    var openGLLayer: CALayer? { glLayer }
    var isPausedState: Bool { isPaused }
    
    // Thread-safe state accessors
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
    private var isSeeking: Bool {
        get { stateQueue.sync { _isSeeking } }
        set { stateQueue.async(flags: .barrier) { self._isSeeking = newValue } }
    }
    private var positionUpdateTime: CFTimeInterval {
        get { stateQueue.sync { _positionUpdateTime } }
        set { stateQueue.async(flags: .barrier) { self._positionUpdateTime = newValue } }
    }
    
    // MARK: - Initialization
    
    init() throws {
        // Setup OpenGL for fast render mode
        if let context = EAGLContext(api: .openGLES3) ?? EAGLContext(api: .openGLES2) {
            eaglContext = context
            setupOpenGLLayer()
        } else {
            throw PlayerError.openGLNotSupported
        }
        
        // Get screen refresh rate
        if let screen = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.screen })
            .first {
            let maxFPS = screen.maximumFramesPerSecond
            minRenderInterval = 1.0 / CFTimeInterval(min(maxFPS, 60))
        }
        
        renderQueue.setSpecific(key: renderQueueKey, value: ())
    }
    
    deinit {
        stop()
    }
    
    private func setupOpenGLLayer() {
        let layer = CAEAGLLayer()
        layer.isOpaque = true
        layer.drawableProperties = [
            kEAGLDrawablePropertyRetainedBacking: false,
            kEAGLDrawablePropertyColorFormat: kEAGLColorFormatRGBA8
        ]
        layer.contentsScale = UIScreen.main.scale
        layer.backgroundColor = UIColor.black.cgColor
        glLayer = layer
    }
    
    // MARK: - Lifecycle
    
    func start() throws {
        guard !isRunning else { return }
        
        // Create MPV handle
        guard let handle = mpv_create() else {
            throw PlayerError.mpvCreationFailed
        }
        mpv = handle
        
        // Core options
        setOption(name: "terminal", value: "yes")
        setOption(name: "msg-level", value: "status")
        setOption(name: "keep-open", value: "yes")
        setOption(name: "idle", value: "yes")
        setOption(name: "vo", value: "libmpv")
        
        // Hardware decoding
        setOption(name: "hwdec", value: "videotoolbox")
        
        // Performance options
        setOption(name: "demuxer-thread", value: "yes")
        setOption(name: "profile", value: "fast")
        setOption(name: "vd-lavc-threads", value: "0")
        setOption(name: "cache", value: "yes")
        setOption(name: "demuxer-max-bytes", value: "50M")
        setOption(name: "demuxer-readahead-secs", value: "10")
        
        // A/V sync
        setOption(name: "video-sync", value: "audio")
        setOption(name: "framedrop", value: "vo")
        setOption(name: "video-latency-hacks", value: "yes")
        setOption(name: "audio-buffer", value: "0.2")
        
        // Subtitles and format
        setOption(name: "vf", value: "sub,format=rgba")
        setOption(name: "sub-visibility", value: "yes")
        
        // Aspect Ratio
        setOption(name: "keepaspect", value: "yes")
        
        let initStatus = mpv_initialize(handle)
        guard initStatus >= 0 else {
            throw PlayerError.mpvInitialization(initStatus)
        }
        
        mpv_request_log_messages(handle, "warn")
        
        try createOpenGLRenderContext(handle: handle)
        observeProperties()
        installWakeupHandler()
        
        isRunning = true
        Logger.shared.log("MPVPlayer started", type: "Info")
    }
    
    func stop() {
        if isStopping { return }
        if !isRunning, mpv == nil { return }
        isRunning = false
        isStopping = true
        
        var handleForShutdown: OpaquePointer?
        
        renderQueue.sync { [weak self] in
            guard let self else { return }
            
            self.destroyRenderContext()
            
            handleForShutdown = self.mpv
            if let handle = handleForShutdown {
                mpv_set_wakeup_callback(handle, nil, nil)
                self.command(handle, ["quit"])
                mpv_wakeup(handle)
            }
        }
        
        eventQueueGroup.wait()
        
        renderQueue.sync { [weak self] in
            guard let self else { return }
            
            if let handle = handleForShutdown {
                mpv_destroy(handle)
            }
            self.mpv = nil
            
            self.disposeBag.forEach { $0() }
            self.disposeBag.removeAll()
        }
        
        isStopping = false
    }
    
    // MARK: - Render Context Management
    
    private func createOpenGLRenderContext(handle: OpaquePointer) throws {
        guard let context = eaglContext else {
            throw PlayerError.openGLNotSupported
        }
        
        EAGLContext.setCurrent(context)
        
        // Define the get_proc_address callback with correct C function pointer type
        let getProcAddress: @convention(c) (UnsafeMutableRawPointer?, UnsafePointer<CChar>?) -> UnsafeMutableRawPointer? = { _, name in
            guard let name = name else { return nil }
            // Use RTLD_DEFAULT to search all loaded libraries
            return dlsym(UnsafeMutableRawPointer(bitPattern: -2), name)
        }
        
        var initParams = mpv_opengl_init_params(
            get_proc_address: getProcAddress,
            get_proc_address_ctx: nil
        )
        
        var apiType = MPV_RENDER_API_TYPE_OPENGL
        
        let status = withUnsafeMutablePointer(to: &apiType) { apiPtr in
            withUnsafeMutablePointer(to: &initParams) { initPtr in
                var params = [
                    mpv_render_param(type: MPV_RENDER_PARAM_API_TYPE, data: UnsafeMutableRawPointer(apiPtr)),
                    mpv_render_param(type: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, data: UnsafeMutableRawPointer(initPtr)),
                    mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil)
                ]
                return mpv_render_context_create(&renderContext, handle, &params)
            }
        }
        
        guard status >= 0, renderContext != nil else {
            throw PlayerError.renderContextCreation(status)
        }
        
        // Set update callback
        mpv_render_context_set_update_callback(renderContext, { ctx in
            guard let ctx = ctx else { return }
            let player = Unmanaged<MPVPlayer>.fromOpaque(ctx).takeUnretainedValue()
            player.scheduleRender()
        }, Unmanaged.passUnretained(self).toOpaque())
        
        Logger.shared.log("OpenGL render context created", type: "Info")
    }
    
    private func destroyRenderContext() {
        if let ctx = renderContext {
            mpv_render_context_set_update_callback(ctx, nil, nil)
            mpv_render_context_free(ctx)
            renderContext = nil
        }
    }
    
    // MARK: - Rendering
    
    private func scheduleRender() {
        renderQueue.async { [weak self] in
            guard let self, self.isRunning, !self.isStopping else { return }
            
            let currentTime = CACurrentMediaTime()
            let timeSinceLastRender = currentTime - self.lastRenderTime
            
            if timeSinceLastRender < self.minRenderInterval {
                let remaining = self.minRenderInterval - timeSinceLastRender
                if self.isRenderScheduled { return }
                self.isRenderScheduled = true
                
                self.renderQueue.asyncAfter(deadline: .now() + remaining) { [weak self] in
                    guard let self else { return }
                    self.lastRenderTime = CACurrentMediaTime()
                    self.performRender()
                    self.isRenderScheduled = false
                }
                return
            }
            
            self.isRenderScheduled = true
            self.lastRenderTime = currentTime
            self.performRender()
            self.isRenderScheduled = false
        }
    }
    
    private func performRender() {
        guard let context = renderContext else { return }
        
        let status = mpv_render_context_update(context)
        let updateFlags = UInt32(status)
        
        if updateFlags & MPV_RENDER_UPDATE_FRAME.rawValue != 0 {
            renderOpenGL()
        }
        
        if status > 0 {
            scheduleRender()
        }
    }
    
    private func renderOpenGL() {
        guard let context = eaglContext,
              let ctx = renderContext,
              framebufferWidth > 0, framebufferHeight > 0 else {
            return
        }
        
        EAGLContext.setCurrent(context)
        
        glBindFramebuffer(GLenum(GL_FRAMEBUFFER), defaultFramebuffer)
        glViewport(0, 0, framebufferWidth, framebufferHeight)
        
        var fbo = mpv_opengl_fbo(
            fbo: Int32(defaultFramebuffer),
            w: framebufferWidth,
            h: framebufferHeight,
            internal_format: 0x1908 // GL_RGBA
        )
        
        var flipY: Int32 = 1
        
        var params: [mpv_render_param] = [
            mpv_render_param(type: MPV_RENDER_PARAM_OPENGL_FBO, data: withUnsafeMutablePointer(to: &fbo) { UnsafeMutableRawPointer($0) }),
            mpv_render_param(type: MPV_RENDER_PARAM_FLIP_Y, data: withUnsafeMutablePointer(to: &flipY) { UnsafeMutableRawPointer($0) }),
            mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil)
        ]
        
        _ = params.withUnsafeMutableBufferPointer { buffer in
            mpv_render_context_render(ctx, buffer.baseAddress)
        }
        
        glBindRenderbuffer(GLenum(GL_RENDERBUFFER), colorRenderbuffer)
        context.presentRenderbuffer(Int(GL_RENDERBUFFER))
        
        // Notify loading end on first frame
        if isLoading {
            isLoading = false
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.delegate?.player(self, didChangeLoading: false)
            }
        }
    }
    
    // MARK: - OpenGL Framebuffer
    
    func createOpenGLFramebuffer(size: CGSize) {
        guard let context = eaglContext, let layer = glLayer else { return }
        
        renderQueue.async { [weak self] in
            guard let self else { return }
            
            EAGLContext.setCurrent(context)
            
            // Delete old
            if self.defaultFramebuffer != 0 {
                glDeleteFramebuffers(1, &self.defaultFramebuffer)
            }
            if self.colorRenderbuffer != 0 {
                glDeleteRenderbuffers(1, &self.colorRenderbuffer)
            }
            
            // Create framebuffer
            glGenFramebuffers(1, &self.defaultFramebuffer)
            glBindFramebuffer(GLenum(GL_FRAMEBUFFER), self.defaultFramebuffer)
            
            // Create renderbuffer
            glGenRenderbuffers(1, &self.colorRenderbuffer)
            glBindRenderbuffer(GLenum(GL_RENDERBUFFER), self.colorRenderbuffer)
            
            // CAUTION: renderbufferStorage MUST be called on main thread for the layer
            DispatchQueue.main.sync {
                layer.frame = CGRect(origin: .zero, size: size)
                context.renderbufferStorage(Int(GL_RENDERBUFFER), from: layer)
            }
            
            glGetRenderbufferParameteriv(GLenum(GL_RENDERBUFFER), GLenum(GL_RENDERBUFFER_WIDTH), &self.framebufferWidth)
            glGetRenderbufferParameteriv(GLenum(GL_RENDERBUFFER), GLenum(GL_RENDERBUFFER_HEIGHT), &self.framebufferHeight)
            
            glFramebufferRenderbuffer(GLenum(GL_FRAMEBUFFER), GLenum(GL_COLOR_ATTACHMENT0), GLenum(GL_RENDERBUFFER), self.colorRenderbuffer)
        }
    }
    
    // MARK: - Video Size
    
    private func updateVideoSize(width: Int, height: Int) {
        let size = CGSize(width: max(width, 0), height: max(height, 0))
        stateQueue.async(flags: .barrier) {
            self.videoSize = size
        }
    }
    
    // MARK: - MPV Options & Properties
    
    private func setOption(name: String, value: String) {
        guard let handle = mpv else { return }
        _ = value.withCString { valuePointer in
            name.withCString { namePointer in
                mpv_set_option_string(handle, namePointer, valuePointer)
            }
        }
    }
    
    private func setProperty(name: String, value: String) {
        guard let handle = mpv else { return }
        _ = value.withCString { valuePointer in
            name.withCString { namePointer in
                mpv_set_property_string(handle, namePointer, valuePointer)
            }
        }
    }
    
    private func clearProperty(name: String) {
        guard let handle = mpv else { return }
        _ = name.withCString { namePointer in
            mpv_set_property(handle, namePointer, MPV_FORMAT_NONE, nil)
        }
    }
    
    @discardableResult
    private func getProperty<T>(handle: OpaquePointer, name: String, format: mpv_format, value: inout T) -> Int32 {
        return name.withCString { pointer in
            withUnsafeMutablePointer(to: &value) { mutablePointer in
                mpv_get_property(handle, pointer, format, mutablePointer)
            }
        }
    }
    
    private func getStringProperty(handle: OpaquePointer, name: String) -> String? {
        var result: String?
        name.withCString { pointer in
            if let cString = mpv_get_property_string(handle, pointer) {
                result = String(cString: cString)
                mpv_free(cString)
            }
        }
        return result
    }
    
    // MARK: - Commands
    
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
            buffer.baseAddress!.withMemoryRebound(to: UnsafePointer<CChar>?.self, capacity: buffer.count) { rebound in
                body(UnsafeMutablePointer(mutating: rebound))
            }
        }
    }
    
    // MARK: - Event Handling
    
    private func observeProperties() {
        guard let handle = mpv else { return }
        let properties: [(String, mpv_format)] = [
            ("dwidth", MPV_FORMAT_INT64),
            ("dheight", MPV_FORMAT_INT64),
            ("duration", MPV_FORMAT_DOUBLE),
            ("time-pos", MPV_FORMAT_DOUBLE),
            ("pause", MPV_FORMAT_FLAG),
            ("track-list/count", MPV_FORMAT_INT64)
        ]
        
        for (name, format) in properties {
            _ = name.withCString { pointer in
                mpv_observe_property(handle, 0, pointer, format)
            }
        }
    }
    
    private func installWakeupHandler() {
        guard let handle = mpv else { return }
        mpv_set_wakeup_callback(handle, { userdata in
            guard let userdata else { return }
            let player = Unmanaged<MPVPlayer>.fromOpaque(userdata).takeUnretainedValue()
            player.processEvents()
        }, Unmanaged.passUnretained(self).toOpaque())
        
        renderQueue.async { [weak self] in
            guard let self else { return }
            self.disposeBag.append { [weak self] in
                guard let self, let handle = self.mpv else { return }
                mpv_set_wakeup_callback(handle, nil, nil)
            }
        }
    }
    
    private func processEvents() {
        eventQueueGroup.enter()
        let group = eventQueueGroup
        eventQueue.async { [weak self] in
            defer { group.leave() }
            guard let self else { return }
            while !self.isStopping {
                guard let handle = self.mpv else { return }
                guard let eventPointer = mpv_wait_event(handle, 0) else { return }
                let event = eventPointer.pointee
                if event.event_id == MPV_EVENT_NONE { continue }
                self.handleEvent(event)
                if event.event_id == MPV_EVENT_SHUTDOWN { break }
            }
        }
    }
    
    private func handleEvent(_ event: mpv_event) {
        switch event.event_id {
        case MPV_EVENT_VIDEO_RECONFIG:
            guard let handle = mpv else { return }
            var width: Int64 = 0
            var height: Int64 = 0
            getProperty(handle: handle, name: "dwidth", format: MPV_FORMAT_INT64, value: &width)
            getProperty(handle: handle, name: "dheight", format: MPV_FORMAT_INT64, value: &height)
            updateVideoSize(width: Int(width), height: Int(height))
            
        case MPV_EVENT_FILE_LOADED:
            if !pendingExternalSubtitles.isEmpty, let handle = mpv {
                for subUrl in pendingExternalSubtitles {
                    command(handle, ["sub-add", subUrl])
                }
                pendingExternalSubtitles = []
                
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
                    self.delegate?.player(self, didBecomeReadyToSeek: true)
                }
            }
            
        case MPV_EVENT_PROPERTY_CHANGE:
            if let property = event.data?.assumingMemoryBound(to: mpv_event_property.self).pointee.name {
                let name = String(cString: property)
                handlePropertyChange(name: name)
            }
            
        case MPV_EVENT_LOG_MESSAGE:
            if let logPtr = event.data?.assumingMemoryBound(to: mpv_event_log_message.self) {
                let text = String(cString: logPtr.pointee.text)
                let lower = text.lowercased()
                if lower.contains("error") {
                    Logger.shared.log("mpv: \(text)", type: "Error")
                } else if lower.contains("warn") {
                    Logger.shared.log("mpv: \(text)", type: "Warn")
                }
            }
            
        default:
            break
        }
    }
    
    private func handlePropertyChange(name: String) {
        guard let handle = mpv else { return }
        
        switch name {
        case "duration":
            var value = Double(0)
            if getProperty(handle: handle, name: name, format: MPV_FORMAT_DOUBLE, value: &value) >= 0 {
                cachedDuration = value
                delegate?.player(self, didUpdatePosition: cachedPosition, duration: cachedDuration)
            }
            
        case "time-pos":
            guard !isSeeking else { return }
            var value = Double(0)
            if getProperty(handle: handle, name: name, format: MPV_FORMAT_DOUBLE, value: &value) >= 0 {
                cachedPosition = value
                positionUpdateTime = CACurrentMediaTime()
                delegate?.player(self, didUpdatePosition: cachedPosition, duration: cachedDuration)
            }
            
        case "pause":
            var flag: Int32 = 0
            if getProperty(handle: handle, name: name, format: MPV_FORMAT_FLAG, value: &flag) >= 0 {
                let newPaused = flag != 0
                if newPaused != isPaused {
                    isPaused = newPaused
                    delegate?.player(self, didChangePause: isPaused)
                }
            }
            
        case "track-list/count":
            var trackCount: Int64 = 0
            if getProperty(handle: handle, name: name, format: MPV_FORMAT_INT64, value: &trackCount) >= 0, trackCount > 0 {
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.delegate?.player(self, didBecomeTracksReady: true)
                }
            }
            
        default:
            break
        }
    }
    
    // MARK: - Public Playback API
    
    func load(url: URL, headers: [String: String]? = nil, startPosition: Double? = nil,
              externalSubtitles: [String]? = nil, initialSubtitleId: Int? = nil, initialAudioId: Int? = nil) {
        
        currentURL = url
        currentHeaders = headers
        pendingExternalSubtitles = externalSubtitles ?? []
        self.initialSubtitleId = initialSubtitleId
        self.initialAudioId = initialAudioId
        
        renderQueue.async { [weak self] in
            guard let self else { return }
            self.isLoading = true
            self.isReadyToSeek = false
            
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.delegate?.player(self, didChangeLoading: true)
            }
            
            guard let handle = self.mpv else { return }
            
            self.commandSync(handle, ["stop"])
            
            // Set headers
            if let headers = headers, !headers.isEmpty {
                let headerString = headers.map { "\($0.key): \($0.value)" }.joined(separator: "\r\n")
                self.setProperty(name: "http-header-fields", value: headerString)
            } else {
                self.clearProperty(name: "http-header-fields")
            }
            
            // Set start position
            if let pos = startPosition, pos > 0 {
                self.setProperty(name: "start", value: String(format: "%.2f", pos))
            } else {
                self.setProperty(name: "start", value: "0")
            }
            
            // Set initial tracks
            if let audioId = initialAudioId, audioId > 0 {
                self.setAudioTrack(audioId)
            }
            
            if self.pendingExternalSubtitles.isEmpty {
                if let subId = initialSubtitleId {
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
    
    func play() {
        setProperty(name: "pause", value: "no")
    }
    
    func pause() {
        setProperty(name: "pause", value: "yes")
    }
    
    func seek(to seconds: Double) {
        guard let handle = mpv else { return }
        let clamped = max(0, seconds)
        isSeeking = true
        cachedPosition = clamped
        positionUpdateTime = CACurrentMediaTime()
        
        commandSync(handle, ["seek", String(clamped), "absolute"])
        isSeeking = false
    }
    
    func seek(by seconds: Double) {
        guard let handle = mpv else { return }
        isSeeking = true
        let newPosition = max(0, cachedPosition + seconds)
        cachedPosition = newPosition
        positionUpdateTime = CACurrentMediaTime()
        
        commandSync(handle, ["seek", String(seconds), "relative"])
        isSeeking = false
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
    
    func getCurrentPosition() -> Double { cachedPosition }
    func getDuration() -> Double { cachedDuration }
    
    // MARK: - Track Controls
    
    func getSubtitleTracks() -> [[String: Any]] {
        guard let handle = mpv else { return [] }
        var tracks: [[String: Any]] = []
        
        var trackCount: Int64 = 0
        getProperty(handle: handle, name: "track-list/count", format: MPV_FORMAT_INT64, value: &trackCount)
        
        for i in 0..<trackCount {
            guard getStringProperty(handle: handle, name: "track-list/\(i)/type") == "sub" else { continue }
            
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
            
            tracks.append(track)
        }
        return tracks
    }
    
    func setSubtitleTrack(_ trackId: Int) {
        setProperty(name: "sid", value: trackId < 0 ? "no" : String(trackId))
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
        commandSync(handle, ["sub-add", url, select ? "select" : "cached"])
    }
    
    func getAudioTracks() -> [[String: Any]] {
        guard let handle = mpv else { return [] }
        var tracks: [[String: Any]] = []
        
        var trackCount: Int64 = 0
        getProperty(handle: handle, name: "track-list/count", format: MPV_FORMAT_INT64, value: &trackCount)
        
        for i in 0..<trackCount {
            guard getStringProperty(handle: handle, name: "track-list/\(i)/type") == "audio" else { continue }
            
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
            if channels > 0 { track["channels"] = Int(channels) }
            var selected: Int32 = 0
            getProperty(handle: handle, name: "track-list/\(i)/selected", format: MPV_FORMAT_FLAG, value: &selected)
            track["selected"] = selected != 0
            
            tracks.append(track)
        }
        return tracks
    }
    
    func setAudioTrack(_ trackId: Int) {
        setProperty(name: "aid", value: String(trackId))
    }
    
    func getCurrentAudioTrack() -> Int {
        guard let handle = mpv else { return 0 }
        var aid: Int64 = 0
        getProperty(handle: handle, name: "aid", format: MPV_FORMAT_INT64, value: &aid)
        return Int(aid)
    }
    
    // MARK: - Subtitle Positioning
    
    func setSubtitlePosition(_ position: Int) { setProperty(name: "sub-pos", value: String(position)) }
    func setSubtitleScale(_ scale: Double) { setProperty(name: "sub-scale", value: String(scale)) }
    func setSubtitleMarginY(_ margin: Int) { setProperty(name: "sub-margin-y", value: String(margin)) }
    func setSubtitleAlignX(_ alignment: String) { setProperty(name: "sub-align-x", value: alignment) }
    func setSubtitleAlignY(_ alignment: String) { setProperty(name: "sub-align-y", value: alignment) }
    func setSubtitleFontSize(_ size: Int) { setProperty(name: "sub-font-size", value: String(size)) }
}
