import UIKit
import Metal
import Libmpv
import CoreMedia
import CoreVideo
import AVFoundation

protocol MPVMetalRendererDelegate: AnyObject {
    func renderer(_ renderer: MPVMetalRenderer, didUpdatePosition position: Double, duration: Double)
    func renderer(_ renderer: MPVMetalRenderer, didChangePause isPaused: Bool)
    func renderer(_ renderer: MPVMetalRenderer, didChangeLoading isLoading: Bool)
    func renderer(_ renderer: MPVMetalRenderer, didBecomeReadyToSeek: Bool)
    func renderer(_ renderer: MPVMetalRenderer, didBecomeTracksReady: Bool)
}

final class MPVMetalRenderer {
    enum RendererError: Error {
        case metalNotSupported
        case mpvCreationFailed
        case mpvInitialization(Int32)
        case renderContextCreation(Int32)
    }
    
    private let displayLayer: AVSampleBufferDisplayLayer
    private let renderQueue = DispatchQueue(label: "mpv.metal.render", qos: .userInteractive)
    private let eventQueue = DispatchQueue(label: "mpv.metal.events", qos: .utility)
    private let stateQueue = DispatchQueue(label: "mpv.metal.state", attributes: .concurrent)
    private let eventQueueGroup = DispatchGroup()
    private let renderQueueKey = DispatchSpecificKey<Void>()
    
    private var device: MTLDevice?
    private var commandQueue: MTLCommandQueue?
    private var bufferPool: IOSurfaceBufferPool?
    private var formatDescription: CMVideoFormatDescription?
    
    private var mpv: OpaquePointer?
    private var renderContext: OpaquePointer?
    private var videoSize: CGSize = .zero
    
    private var currentPreset: PlayerPreset?
    private var currentURL: URL?
    private var currentHeaders: [String: String]?
    private var pendingExternalSubtitles: [String] = []
    private var initialSubtitleId: Int?
    private var initialAudioId: Int?
    
    private var disposeBag: [() -> Void] = []
    
    private var isRunning = false
    private var isStopping = false
    
    weak var delegate: MPVMetalRendererDelegate?
    
    // Thread-safe state
    private var _cachedDuration: Double = 0
    private var _cachedPosition: Double = 0
    private var _isPaused: Bool = true
    private var _playbackSpeed: Double = 1.0
    private var _isSeeking: Bool = false
    private var _positionUpdateTime: CFTimeInterval = 0
    private var _lastPTS: Double = 0
    
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
    private var isSeeking: Bool {
        get { stateQueue.sync { _isSeeking } }
        set { stateQueue.async(flags: .barrier) { self._isSeeking = newValue } }
    }
    private var positionUpdateTime: CFTimeInterval {
        get { stateQueue.sync { _positionUpdateTime } }
        set { stateQueue.async(flags: .barrier) { self._positionUpdateTime = newValue } }
    }
    private var lastPTS: Double {
        get { stateQueue.sync { _lastPTS } }
        set { stateQueue.async(flags: .barrier) { self._lastPTS = newValue } }
    }
    
    private var isLoading: Bool = false
    private var isRenderScheduled = false
    private var lastRenderTime: CFTimeInterval = 0
    private var minRenderInterval: CFTimeInterval
    private var isReadyToSeek: Bool = false
    private var lastRenderDimensions: CGSize = .zero
    
    var isPausedState: Bool {
        return isPaused
    }
    
    init(displayLayer: AVSampleBufferDisplayLayer) throws {
        guard let device = MTLCreateSystemDefaultDevice() else {
            throw RendererError.metalNotSupported
        }
        self.device = device
        self.commandQueue = device.makeCommandQueue()
        self.displayLayer = displayLayer
        self.bufferPool = IOSurfaceBufferPool(device: device, maxBufferCount: 6)
        
        guard let screen = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.screen })
            .first
        else {
            throw RendererError.metalNotSupported
        }
        
        let maxFPS = screen.maximumFramesPerSecond
        let cappedFPS = min(maxFPS, 60)
        self.minRenderInterval = 1.0 / CFTimeInterval(cappedFPS)
        renderQueue.setSpecific(key: renderQueueKey, value: ())
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
        
        // Core options
        setOption(name: "terminal", value: "yes")
        setOption(name: "msg-level", value: "status")
        setOption(name: "keep-open", value: "yes")
        setOption(name: "idle", value: "yes")
        setOption(name: "vo", value: "libmpv")
        
        // Hardware decoding - zero-copy for maximum GPU efficiency
        setOption(name: "hwdec", value: "videotoolbox")
        
        // Performance options
        setOption(name: "demuxer-thread", value: "yes")
        setOption(name: "profile", value: "fast")
        setOption(name: "vd-lavc-threads", value: "0")
        setOption(name: "cache", value: "yes")
        setOption(name: "demuxer-max-bytes", value: "50M")
        setOption(name: "demuxer-readahead-secs", value: "10")
        
        // A/V sync options - prioritize audio sync and allow frame drops
        setOption(name: "video-sync", value: "audio")
        setOption(name: "framedrop", value: "vo")
        setOption(name: "video-latency-hacks", value: "yes")
        
        // Audio buffer to prevent underruns during heavy video load
        setOption(name: "audio-buffer", value: "0.2")
        
        // Subtitle options - burn into video frames
        setOption(name: "vf", value: "sub")
        setOption(name: "sub-visibility", value: "yes")
        
        let initStatus = mpv_initialize(handle)
        guard initStatus >= 0 else {
            throw RendererError.mpvInitialization(initStatus)
        }
        
        mpv_request_log_messages(handle, "warn")
        
        try createRenderContext()
        observeProperties()
        installWakeupHandler()
        isRunning = true
    }
    
    func stop() {
        if isStopping { return }
        if !isRunning, mpv == nil { return }
        isRunning = false
        isStopping = true
        
        var handleForShutdown: OpaquePointer?
        
        renderQueue.sync { [weak self] in
            guard let self else { return }
            
            if let ctx = self.renderContext {
                mpv_render_context_set_update_callback(ctx, nil, nil)
                mpv_render_context_free(ctx)
                self.renderContext = nil
            }
            
            handleForShutdown = self.mpv
            if let handle = handleForShutdown {
                mpv_set_wakeup_callback(handle, nil, nil)
                self.command(handle, ["quit"])
                mpv_wakeup(handle)
            }
            
            self.formatDescription = nil
            self.bufferPool?.invalidate()
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
        
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if #available(iOS 18.0, *) {
                self.displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
            } else {
                self.displayLayer.flushAndRemoveImage()
            }
            self.displayLayer.controlTimebase = nil
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
        
        renderQueue.async { [weak self] in
            guard let self else { return }
            self.isLoading = true
            self.isReadyToSeek = false
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.delegate?.renderer(self, didChangeLoading: true)
            }
            
            guard let handle = self.mpv else { return }
            
            self.apply(commands: preset.commands, on: handle)
            self.commandSync(handle, ["stop"])
            self.updateHTTPHeaders(headers)
            
            if let startPos = startPosition, startPos > 0 {
                self.setProperty(name: "start", value: String(format: "%.2f", startPos))
            } else {
                self.setProperty(name: "start", value: "0")
            }
            
            if let audioId = self.initialAudioId, audioId > 0 {
                self.setAudioTrack(audioId)
            }
            
            if self.pendingExternalSubtitles.isEmpty {
                if let subId = self.initialSubtitleId {
                    self.setSubtitleTrack(subId)
                } else {
                    self.disableSubtitles()
                }
            } else {
                self.disableSubtitles()
            }
            
            var finalURL = url
            if !url.isFileURL {
                finalURL = url
            }
            
            let target = finalURL.isFileURL ? finalURL.path : finalURL.absoluteString
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
        renderQueue.async { [weak self] in
            guard let self else { return }
            self.apply(commands: preset.commands, on: handle)
        }
    }
    
    // MARK: - MPV Configuration
    
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
        let status = value.withCString { valuePointer in
            name.withCString { namePointer in
                mpv_set_property_string(handle, namePointer, valuePointer)
            }
        }
        if status < 0 {
            Logger.shared.log("Failed to set property \(name)=\(value) (\(status))", type: "Warn")
        }
    }
    
    private func clearProperty(name: String) {
        guard let handle = mpv else { return }
        let status = name.withCString { namePointer in
            mpv_set_property(handle, namePointer, MPV_FORMAT_NONE, nil)
        }
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
    
    // MARK: - Render Context
    
    private func createRenderContext() throws {
        guard let handle = mpv else { return }
        
        // Use software rendering API but with our IOSurface-backed Metal textures
        // This gives us the frame data while still leveraging hardware decoding
        var apiType = MPV_RENDER_API_TYPE_SW
        let status = withUnsafePointer(to: &apiType) { apiTypePtr in
            var params = [
                mpv_render_param(type: MPV_RENDER_PARAM_API_TYPE, data: UnsafeMutableRawPointer(mutating: apiTypePtr)),
                mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil)
            ]
            
            return params.withUnsafeMutableBufferPointer { pointer -> Int32 in
                pointer.baseAddress?.withMemoryRebound(to: mpv_render_param.self, capacity: pointer.count) { parameters in
                    return mpv_render_context_create(&renderContext, handle, parameters)
                } ?? -1
            }
        }
        
        guard status >= 0, renderContext != nil else {
            throw RendererError.renderContextCreation(status)
        }
        
        mpv_render_context_set_update_callback(renderContext, { context in
            guard let context = context else { return }
            let instance = Unmanaged<MPVMetalRenderer>.fromOpaque(context).takeUnretainedValue()
            instance.scheduleRender()
        }, Unmanaged.passUnretained(self).toOpaque())
    }
    
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
            let instance = Unmanaged<MPVMetalRenderer>.fromOpaque(userdata).takeUnretainedValue()
            instance.processEvents()
        }, Unmanaged.passUnretained(self).toOpaque())
        renderQueue.async { [weak self] in
            guard let self else { return }
            self.disposeBag.append { [weak self] in
                guard let self, let handle = self.mpv else { return }
                mpv_set_wakeup_callback(handle, nil, nil)
            }
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
                    self.performRenderUpdate()
                    self.isRenderScheduled = false
                }
                return
            }
            
            self.isRenderScheduled = true
            self.lastRenderTime = currentTime
            self.performRenderUpdate()
            self.isRenderScheduled = false
        }
    }
    
    private func performRenderUpdate() {
        guard let context = renderContext else { return }
        let status = mpv_render_context_update(context)
        
        let updateFlags = UInt32(status)
        
        if updateFlags & MPV_RENDER_UPDATE_FRAME.rawValue != 0 {
            renderFrame()
        }
        
        if status > 0 {
            scheduleRender()
        }
    }
    
    private var dimensionsArray = [Int32](repeating: 0, count: 2)
    private var renderParams = [mpv_render_param](repeating: mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil), count: 5)
    private let bgraFormatCString: [CChar] = Array("bgra\0".utf8CString)
    
    private func renderFrame() {
        guard let context = renderContext, let bufferPool = bufferPool else { return }
        let videoSize = currentVideoSize()
        guard videoSize.width > 0, videoSize.height > 0 else { return }
        
        let width = Int(videoSize.width)
        let height = Int(videoSize.height)
        guard width > 0, height > 0 else { return }
        
        // Configure buffer pool if needed
        if bufferPool.width != width || bufferPool.height != height {
            if !bufferPool.configure(width: width, height: height) {
                Logger.shared.log("Failed to configure buffer pool for \(width)x\(height)", type: "Error")
                return
            }
            formatDescription = bufferPool.createFormatDescription()
            
            // Flush display layer on format change
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                if #available(iOS 18.0, *) {
                    self.displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
                } else {
                    self.displayLayer.flushAndRemoveImage()
                }
            }
        }
        
        guard let pooledBuffer = bufferPool.dequeueBuffer() else {
            Logger.shared.log("Failed to dequeue buffer from pool", type: "Error")
            return
        }
        
        // Render to the IOSurface-backed pixel buffer
        // The pixel buffer is Metal-compatible so this render goes through GPU when possible
        CVPixelBufferLockBaseAddress(pooledBuffer.pixelBuffer, [])
        guard let baseAddress = CVPixelBufferGetBaseAddress(pooledBuffer.pixelBuffer) else {
            CVPixelBufferUnlockBaseAddress(pooledBuffer.pixelBuffer, [])
            bufferPool.enqueueBuffer(pooledBuffer)
            return
        }
        
        dimensionsArray[0] = Int32(width)
        dimensionsArray[1] = Int32(height)
        let stride = Int32(CVPixelBufferGetBytesPerRow(pooledBuffer.pixelBuffer))
        
        let pointerValue = baseAddress
        dimensionsArray.withUnsafeMutableBufferPointer { dimsPointer in
            bgraFormatCString.withUnsafeBufferPointer { formatPointer in
                withUnsafePointer(to: stride) { stridePointer in
                    renderParams[0] = mpv_render_param(type: MPV_RENDER_PARAM_SW_SIZE, data: UnsafeMutableRawPointer(dimsPointer.baseAddress))
                    renderParams[1] = mpv_render_param(type: MPV_RENDER_PARAM_SW_FORMAT, data: UnsafeMutableRawPointer(mutating: formatPointer.baseAddress))
                    renderParams[2] = mpv_render_param(type: MPV_RENDER_PARAM_SW_STRIDE, data: UnsafeMutableRawPointer(mutating: stridePointer))
                    renderParams[3] = mpv_render_param(type: MPV_RENDER_PARAM_SW_POINTER, data: pointerValue)
                    renderParams[4] = mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil)
                    
                    let rc = mpv_render_context_render(context, &renderParams)
                    if rc < 0 {
                        Logger.shared.log("mpv_render_context_render returned error \(rc)", type: "Error")
                    }
                }
            }
        }
        
        CVPixelBufferUnlockBaseAddress(pooledBuffer.pixelBuffer, [])
        
        // Enqueue to display layer
        enqueue(buffer: pooledBuffer)
    }
    
    private func nextMonotonicPTS() -> Double {
        let currentPos = interpolatedPosition()
        let last = lastPTS
        let pts = max(currentPos, last + 0.001)
        lastPTS = pts
        return pts
    }
    
    private func interpolatedPosition() -> Double {
        let basePosition = cachedPosition
        let lastUpdate = positionUpdateTime
        let paused = isPaused
        let speed = playbackSpeed
        
        guard !paused, lastUpdate > 0 else {
            return basePosition
        }
        
        let elapsed = CACurrentMediaTime() - lastUpdate
        return basePosition + (elapsed * speed)
    }
    
    private func enqueue(buffer: IOSurfaceBufferPool.PooledBuffer) {
        var shouldNotifyLoadingEnd = false
        renderQueueSync {
            if self.isLoading {
                self.isLoading = false
                shouldNotifyLoadingEnd = true
            }
        }
        
        guard let formatDescription = formatDescription else {
            Logger.shared.log("Missing formatDescription when creating sample buffer", type: "Error")
            bufferPool?.enqueueBuffer(buffer)
            return
        }
        
        let presentationTime = CMTime(seconds: nextMonotonicPTS(), preferredTimescale: 1000)
        
        guard let sampleBuffer = IOSurfaceBufferPool.createSampleBuffer(
            from: buffer.pixelBuffer,
            formatDescription: formatDescription,
            presentationTime: presentationTime
        ) else {
            bufferPool?.enqueueBuffer(buffer)
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            
            let (status, error): (AVQueuedSampleBufferRenderingStatus?, Error?) = {
                if #available(iOS 18.0, *) {
                    return (
                        self.displayLayer.sampleBufferRenderer.status,
                        self.displayLayer.sampleBufferRenderer.error
                    )
                } else {
                    return (
                        self.displayLayer.status,
                        self.displayLayer.error
                    )
                }
            }()
            
            if status == .failed {
                if let error = error {
                    Logger.shared.log("Display layer failed: \(error.localizedDescription)", type: "Error")
                }
                if #available(iOS 18.0, *) {
                    self.displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
                } else {
                    self.displayLayer.flushAndRemoveImage()
                }
            }
            
            if self.displayLayer.controlTimebase == nil {
                var timebase: CMTimebase?
                if CMTimebaseCreateWithSourceClock(allocator: kCFAllocatorDefault, sourceClock: CMClockGetHostTimeClock(), timebaseOut: &timebase) == noErr, let timebase {
                    CMTimebaseSetRate(timebase, rate: self.isPaused ? 0 : self.playbackSpeed)
                    CMTimebaseSetTime(timebase, time: presentationTime)
                    self.displayLayer.controlTimebase = timebase
                }
            }
            
            if shouldNotifyLoadingEnd {
                self.delegate?.renderer(self, didChangeLoading: false)
            }
            
            if #available(iOS 18.0, *) {
                self.displayLayer.sampleBufferRenderer.enqueue(sampleBuffer)
            } else {
                self.displayLayer.enqueue(sampleBuffer)
            }
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.032) { [weak self, weak bufferPool] in
                bufferPool?.enqueueBuffer(buffer)
            }
        }
    }
    
    private func renderQueueSync(_ block: () -> Void) {
        if DispatchQueue.getSpecific(key: renderQueueKey) != nil {
            block()
        } else {
            renderQueue.sync(execute: block)
        }
    }
    
    private func currentVideoSize() -> CGSize {
        stateQueue.sync { videoSize }
    }
    
    private func updateVideoSize(width: Int, height: Int) {
        let size = CGSize(width: max(width, 0), height: max(height, 0))
        stateQueue.async(flags: .barrier) {
            self.videoSize = size
        }
    }
    
    // MARK: - Commands
    
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
    
    // MARK: - Event Processing
    
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
            refreshVideoState()
        case MPV_EVENT_FILE_LOADED:
            let hadExternalSubs = !pendingExternalSubtitles.isEmpty
            if hadExternalSubs, let handle = mpv {
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
                    self.delegate?.renderer(self, didBecomeReadyToSeek: true)
                }
            }
        case MPV_EVENT_PROPERTY_CHANGE:
            if let property = event.data?.assumingMemoryBound(to: mpv_event_property.self).pointee.name {
                let name = String(cString: property)
                refreshProperty(named: name)
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
                } else if lower.contains("warn") || lower.contains("warning") || lower.contains("deprecated") {
                    Logger.shared.log("mpv[\(component)] \(text)", type: "Warn")
                }
            }
        default:
            break
        }
    }
    
    private func refreshVideoState() {
        guard let handle = mpv else { return }
        var width: Int64 = 0
        var height: Int64 = 0
        getProperty(handle: handle, name: "dwidth", format: MPV_FORMAT_INT64, value: &width)
        getProperty(handle: handle, name: "dheight", format: MPV_FORMAT_INT64, value: &height)
        updateVideoSize(width: Int(width), height: Int(height))
    }
    
    private func refreshProperty(named name: String) {
        guard let handle = mpv else { return }
        switch name {
        case "duration":
            var value = Double(0)
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_DOUBLE, value: &value)
            if status >= 0 {
                cachedDuration = value
                delegate?.renderer(self, didUpdatePosition: cachedPosition, duration: cachedDuration)
            }
        case "time-pos":
            guard !isSeeking else { return }
            var value = Double(0)
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_DOUBLE, value: &value)
            if status >= 0 {
                cachedPosition = value
                positionUpdateTime = CACurrentMediaTime()
                delegate?.renderer(self, didUpdatePosition: cachedPosition, duration: cachedDuration)
            }
        case "pause":
            var flag: Int32 = 0
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_FLAG, value: &flag)
            if status >= 0 {
                let newPaused = flag != 0
                if newPaused != isPaused {
                    isPaused = newPaused
                    let speed = self.playbackSpeed
                    DispatchQueue.main.async { [weak self] in
                        if let timebase = self?.displayLayer.controlTimebase {
                            CMTimebaseSetRate(timebase, rate: newPaused ? 0 : speed)
                        }
                    }
                    delegate?.renderer(self, didChangePause: isPaused)
                }
            }
        case "track-list/count":
            var trackCount: Int64 = 0
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_INT64, value: &trackCount)
            if status >= 0 && trackCount > 0 {
                Logger.shared.log("Track list updated: \(trackCount) tracks available", type: "Info")
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.delegate?.renderer(self, didBecomeTracksReady: true)
                }
            }
        default:
            break
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
    
    @discardableResult
    private func getProperty<T>(handle: OpaquePointer, name: String, format: mpv_format, value: inout T) -> Int32 {
        return name.withCString { pointer in
            return withUnsafeMutablePointer(to: &value) { mutablePointer in
                return mpv_get_property(handle, pointer, format, mutablePointer)
            }
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
        let wasPaused = isPaused
        isSeeking = true
        cachedPosition = clamped
        positionUpdateTime = CACurrentMediaTime()
        lastPTS = clamped
        syncTimebase(to: clamped)
        commandSync(handle, ["seek", String(clamped), "absolute"])
        isSeeking = false
        if wasPaused {
            restoreTimebaseRate()
        }
    }
    
    func seek(by seconds: Double) {
        guard let handle = mpv else { return }
        let wasPaused = isPaused
        isSeeking = true
        let newPosition = max(0, cachedPosition + seconds)
        cachedPosition = newPosition
        positionUpdateTime = CACurrentMediaTime()
        lastPTS = newPosition
        syncTimebase(to: newPosition)
        commandSync(handle, ["seek", String(seconds), "relative"])
        isSeeking = false
        if wasPaused {
            restoreTimebaseRate()
        }
    }
    
    private func restoreTimebaseRate() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            guard let self = self, self.isPaused else { return }
            if let timebase = self.displayLayer.controlTimebase {
                CMTimebaseSetRate(timebase, rate: 0)
            }
        }
    }
    
    private func syncTimebase(to position: Double) {
        let speed = playbackSpeed
        let doWork = { [weak self] in
            guard let self = self else { return }
            if #available(iOS 17.0, *) {
                self.displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: false, completionHandler: nil)
            } else {
                self.displayLayer.flush()
            }
            if let timebase = self.displayLayer.controlTimebase {
                CMTimebaseSetTime(timebase, time: CMTime(seconds: position, preferredTimescale: 1000))
                CMTimebaseSetRate(timebase, rate: speed)
            }
        }
        
        if Thread.isMainThread {
            doWork()
        } else {
            DispatchQueue.main.sync { doWork() }
        }
    }
    
    func syncTimebase() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if let timebase = self.displayLayer.controlTimebase {
                CMTimebaseSetTime(timebase, time: CMTime(seconds: self.cachedPosition, preferredTimescale: 1000))
                CMTimebaseSetRate(timebase, rate: self.isPaused ? 0 : self.playbackSpeed)
            }
        }
    }
    
    func setSpeed(_ speed: Double) {
        playbackSpeed = speed
        setProperty(name: "speed", value: String(speed))
        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  let timebase = self.displayLayer.controlTimebase else { return }
            let rate = self.isPaused ? 0.0 : speed
            CMTimebaseSetRate(timebase, rate: rate)
        }
    }
    
    func getSpeed() -> Double {
        guard let handle = mpv else { return 1.0 }
        var speed: Double = 1.0
        getProperty(handle: handle, name: "speed", format: MPV_FORMAT_DOUBLE, value: &speed)
        return speed
    }
    
    // MARK: - Subtitle Controls
    
    func getSubtitleTracks() -> [[String: Any]] {
        guard let handle = mpv else { return [] }
        var tracks: [[String: Any]] = []
        
        var trackCount: Int64 = 0
        getProperty(handle: handle, name: "track-list/count", format: MPV_FORMAT_INT64, value: &trackCount)
        
        for i in 0..<trackCount {
            var trackType: String?
            if let typeStr = getStringProperty(handle: handle, name: "track-list/\(i)/type") {
                trackType = typeStr
            }
            
            guard trackType == "sub" else { continue }
            
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
        guard let handle = mpv else { return [] }
        var tracks: [[String: Any]] = []
        
        var trackCount: Int64 = 0
        getProperty(handle: handle, name: "track-list/count", format: MPV_FORMAT_INT64, value: &trackCount)
        
        for i in 0..<trackCount {
            var trackType: String?
            if let typeStr = getStringProperty(handle: handle, name: "track-list/\(i)/type") {
                trackType = typeStr
            }
            
            guard trackType == "audio" else { continue }
            
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
}
