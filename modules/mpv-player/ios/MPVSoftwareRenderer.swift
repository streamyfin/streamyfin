//
//  MPVSoftwareRenderer.swift
//  test
//
//  Created by Francesco on 28/09/25.
//

import Libmpv
import CoreMedia
import CoreVideo
import AVFoundation

protocol MPVSoftwareRendererDelegate: AnyObject {
    func renderer(_ renderer: MPVSoftwareRenderer, didUpdatePosition position: Double, duration: Double)
    func renderer(_ renderer: MPVSoftwareRenderer, didChangePause isPaused: Bool)
    func renderer(_ renderer: MPVSoftwareRenderer, didChangeLoading isLoading: Bool)
    func renderer(_ renderer: MPVSoftwareRenderer, didBecomeReadyToSeek: Bool)
}

final class MPVSoftwareRenderer {
    enum RendererError: Error {
        case mpvCreationFailed
        case mpvInitialization(Int32)
        case renderContextCreation(Int32)
    }
    
    private let displayLayer: AVSampleBufferDisplayLayer
    private let renderQueue = DispatchQueue(label: "mpv.software.render", qos: .userInitiated)
    private let eventQueue = DispatchQueue(label: "mpv.software.events", qos: .utility)
    private let stateQueue = DispatchQueue(label: "mpv.software.state", attributes: .concurrent)
    private let eventQueueGroup = DispatchGroup()
    private let renderQueueKey = DispatchSpecificKey<Void>()
    
    private var dimensionsArray = [Int32](repeating: 0, count: 2)
    private var renderParams = [mpv_render_param](repeating: mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil), count: 5)
    
    private var mpv: OpaquePointer?
    private var renderContext: OpaquePointer?
    private var videoSize: CGSize = .zero
    private var pixelBufferPool: CVPixelBufferPool?
    private var pixelBufferPoolAuxAttributes: CFDictionary?
    private var formatDescription: CMVideoFormatDescription?
    private var didFlushForFormatChange = false
    private var poolWidth: Int = 0
    private var poolHeight: Int = 0
    private var preAllocatedBuffers: [CVPixelBuffer] = []
    private let maxPreAllocatedBuffers = 6
    
    private var currentPreset: PlayerPreset?
    private var currentURL: URL?
    private var currentHeaders: [String: String]?
    
    private var disposeBag: [() -> Void] = []
    
    private var isRunning = false
    private var isStopping = false
    private var shouldClearPixelBuffer = false
    private let bgraFormatCString: [CChar] = Array("bgra\0".utf8CString)
    
    weak var delegate: MPVSoftwareRendererDelegate?
    private var cachedDuration: Double = 0
    private var cachedPosition: Double = 0
    private var isPaused: Bool = true
    private var isLoading: Bool = false
    private var isRenderScheduled = false
    private var lastRenderTime: CFTimeInterval = 0
    private let minRenderInterval: CFTimeInterval = 1.0 / 120.0
    private var isReadyToSeek: Bool = false
    
    var isPausedState: Bool {
        return isPaused
    }
    
    init(displayLayer: AVSampleBufferDisplayLayer) {
        self.displayLayer = displayLayer
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
        setOption(name: "terminal", value: "yes")
        setOption(name: "msg-level", value: "status")
        setOption(name: "keep-open", value: "yes")
        setOption(name: "idle", value: "yes")
        setOption(name: "vo", value: "libmpv")
        setOption(name: "hwdec", value: "videotoolbox-copy")
        setOption(name: "gpu-api", value: "metal")
        setOption(name: "gpu-context", value: "metal")
        setOption(name: "demuxer-thread", value: "yes")
        setOption(name: "ytdl", value: "yes")
        
        // Subtitle rendering options
       setOption(name: "subs-match-os-language", value: "yes")
        setOption(name: "subs-fallback", value: "yes")
        setOption(name: "sub-auto", value: "no")
        
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
            self.preAllocatedBuffers.removeAll()
            self.pixelBufferPool = nil
            self.poolWidth = 0
            self.poolHeight = 0
        }
        
        eventQueueGroup.wait()
        
        renderQueue.sync { [weak self] in
            guard let self else { return }
            
            if let handle = handleForShutdown {
                mpv_destroy(handle)
            }
            self.mpv = nil
            
            self.preAllocatedBuffers.removeAll()
            self.pixelBufferPool = nil
            self.pixelBufferPoolAuxAttributes = nil
            self.formatDescription = nil
            self.poolWidth = 0
            self.poolHeight = 0
            
            self.disposeBag.forEach { $0() }
            self.disposeBag.removeAll()
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.displayLayer.flushAndRemoveImage()
        }
        
        isStopping = false
    }
    
    func load(url: URL, with preset: PlayerPreset, headers: [String: String]? = nil) {
        currentPreset = preset
        currentURL = url
        currentHeaders = headers
        
        renderQueue.async { [weak self] in
            guard let self else { return }
            self.isLoading = true
            self.isReadyToSeek = false
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.delegate?.renderer(self, didChangeLoading: true)
            }
        }
        
        guard let handle = mpv else { return }
        
        renderQueue.async { [weak self] in
            guard let self else { return }
            self.apply(commands: preset.commands, on: handle)
            self.command(handle, ["stop"])
            self.updateHTTPHeaders(headers)
            
            // Handle file URLs - use path, otherwise use absolute string
            let target: String
            if url.isFileURL {
                // For file URLs, use the path (removes file:// prefix)
                target = url.path
                Logger.shared.log("Loading file: \(target)", type: "Info")
            } else {
                // For network URLs, use absolute string
                target = url.absoluteString
                Logger.shared.log("Loading URL: \(target)", type: "Info")
            }
            
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
            .map { key, value in
                "\(key): \(value)"
            }
            .joined(separator: "\r\n")
        setProperty(name: "http-header-fields", value: headerString)
    }
    
    private func createRenderContext() throws {
        guard let handle = mpv else { return }
        
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
            let instance = Unmanaged<MPVSoftwareRenderer>.fromOpaque(context).takeUnretainedValue()
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
            ("pause", MPV_FORMAT_FLAG)
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
            let instance = Unmanaged<MPVSoftwareRenderer>.fromOpaque(userdata).takeUnretainedValue()
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
    
    private func scheduleRender() {
        renderQueue.async { [weak self] in
            guard let self, self.isRunning, !self.isStopping else { return }
            
            let currentTime = CACurrentMediaTime()
            if self.isRenderScheduled && (currentTime - self.lastRenderTime) < self.minRenderInterval {
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
    
    private func renderFrame() {
        guard let context = renderContext else { return }
        let size = currentVideoSize()
        guard size.width > 0, size.height > 0 else { return }
        
        let width = Int(size.width)
        let height = Int(size.height)
        
        if poolWidth != width || poolHeight != height {
            recreatePixelBufferPool(width: width, height: height)
        }
        
        var pixelBuffer: CVPixelBuffer?
        var status: CVReturn = kCVReturnError
        
        if !preAllocatedBuffers.isEmpty {
            pixelBuffer = preAllocatedBuffers.removeFirst()
            status = kCVReturnSuccess
        } else if let pool = pixelBufferPool {
            status = CVPixelBufferPoolCreatePixelBufferWithAuxAttributes(kCFAllocatorDefault, pool, pixelBufferPoolAuxAttributes, &pixelBuffer)
        }
        
        if status != kCVReturnSuccess || pixelBuffer == nil {
            let attrs: [CFString: Any] = [
                kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
                kCVPixelBufferCGImageCompatibilityKey: kCFBooleanTrue!,
                kCVPixelBufferCGBitmapContextCompatibilityKey: kCFBooleanTrue!,
                kCVPixelBufferMetalCompatibilityKey: kCFBooleanTrue!,
                kCVPixelBufferWidthKey: width,
                kCVPixelBufferHeightKey: height,
                kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA
            ]
            status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pixelBuffer)
        }
        
        guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
            Logger.shared.log("Failed to create pixel buffer for rendering (status: \(status))", type: "Error")
            return
        }
        
        let actualFormat = CVPixelBufferGetPixelFormatType(buffer)
        if actualFormat != kCVPixelFormatType_32BGRA {
            Logger.shared.log("Pixel buffer format mismatch: expected BGRA (0x42475241), got \(actualFormat)", type: "Error")
        }
        
        CVPixelBufferLockBaseAddress(buffer, [])
        guard let baseAddress = CVPixelBufferGetBaseAddress(buffer) else {
            CVPixelBufferUnlockBaseAddress(buffer, [])
            return
        }
        
        if shouldClearPixelBuffer {
            let bufferDataSize = CVPixelBufferGetDataSize(buffer)
            memset(baseAddress, 0, bufferDataSize)
            shouldClearPixelBuffer = false
        }
        
        dimensionsArray[0] = Int32(width)
        dimensionsArray[1] = Int32(height)
        let stride = Int32(CVPixelBufferGetBytesPerRow(buffer))
        let expectedMinStride = Int32(width * 4)
        if stride < expectedMinStride {
            Logger.shared.log("Unexpected pixel buffer stride \(stride) < expected \(expectedMinStride) — skipping render to avoid memory corruption", type: "Error")
            CVPixelBufferUnlockBaseAddress(buffer, [])
            return
        }
        
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
        
        CVPixelBufferUnlockBaseAddress(buffer, [])
        enqueue(buffer: buffer)
        
        if preAllocatedBuffers.count < 2 {
            renderQueue.async { [weak self] in
                self?.preAllocateBuffers()
            }
        }
    }
    
    private func createPixelBufferPool(width: Int, height: Int) {
        let pixelFormat = kCVPixelFormatType_32BGRA
        
        let attrs: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: pixelFormat,
            kCVPixelBufferWidthKey: width,
            kCVPixelBufferHeightKey: height,
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
            kCVPixelBufferMetalCompatibilityKey: kCFBooleanTrue!,
            kCVPixelBufferCGImageCompatibilityKey: kCFBooleanTrue!,
            kCVPixelBufferCGBitmapContextCompatibilityKey: kCFBooleanTrue!
        ]
        
        let poolAttrs: [CFString: Any] = [
            kCVPixelBufferPoolMinimumBufferCountKey: maxPreAllocatedBuffers,
            kCVPixelBufferPoolMaximumBufferAgeKey: 0
        ]
        
        let auxAttrs: [CFString: Any] = [
            kCVPixelBufferPoolAllocationThresholdKey: 4
        ]
        
        var pool: CVPixelBufferPool?
        let status = CVPixelBufferPoolCreate(kCFAllocatorDefault, poolAttrs as CFDictionary, attrs as CFDictionary, &pool)
        if status == kCVReturnSuccess, let pool {
            renderQueueSync {
                self.pixelBufferPool = pool
                self.pixelBufferPoolAuxAttributes = auxAttrs as CFDictionary
                self.poolWidth = width
                self.poolHeight = height
            }
            
            renderQueue.async { [weak self] in
                self?.preAllocateBuffers()
            }
        } else {
            Logger.shared.log("Failed to create CVPixelBufferPool (status: \(status))", type: "Error")
        }
    }
    
    private func recreatePixelBufferPool(width: Int, height: Int) {
        renderQueueSync {
            self.preAllocatedBuffers.removeAll()
            self.pixelBufferPool = nil
            self.formatDescription = nil
            self.poolWidth = 0
            self.poolHeight = 0
        }
        
        createPixelBufferPool(width: width, height: height)
    }
    
    private func preAllocateBuffers() {
        guard DispatchQueue.getSpecific(key: renderQueueKey) != nil else {
            renderQueue.async { [weak self] in
                self?.preAllocateBuffers()
            }
            return
        }
        
        guard let pool = pixelBufferPool else { return }
        
        let targetCount = min(maxPreAllocatedBuffers, 4)
        let currentCount = preAllocatedBuffers.count
        
        guard currentCount < targetCount else { return }
        
        let bufferCount = targetCount - currentCount
        
        for _ in 0..<bufferCount {
            var buffer: CVPixelBuffer?
            let status = CVPixelBufferPoolCreatePixelBufferWithAuxAttributes(
                kCFAllocatorDefault,
                pool,
                pixelBufferPoolAuxAttributes,
                &buffer
            )
            
            if status == kCVReturnSuccess, let buffer = buffer {
                if preAllocatedBuffers.count < maxPreAllocatedBuffers {
                    preAllocatedBuffers.append(buffer)
                }
            } else {
                if status != kCVReturnWouldExceedAllocationThreshold {
                    Logger.shared.log("Failed to pre-allocate buffer (status: \(status))", type: "Warn")
                }
                break
            }
        }
    }
    
    private func enqueue(buffer: CVPixelBuffer) {
        let needsFlush = updateFormatDescriptionIfNeeded(for: buffer)
        var shouldNotifyLoadingEnd = false
        renderQueueSync {
            if self.isLoading {
                self.isLoading = false
                shouldNotifyLoadingEnd = true
            }
        }
        var capturedFormatDescription: CMVideoFormatDescription?
        renderQueueSync {
            capturedFormatDescription = self.formatDescription
        }
        
        guard let formatDescription = capturedFormatDescription else {
            Logger.shared.log("Missing formatDescription when creating sample buffer — skipping frame", type: "Error")
            return
        }
        
        let presentationTime = CMClockGetTime(CMClockGetHostTimeClock())
        var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: presentationTime, decodeTimeStamp: .invalid)
        
        var sampleBuffer: CMSampleBuffer?
        let result = CMSampleBufferCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: buffer,
            dataReady: true,
            makeDataReadyCallback: nil,
            refcon: nil,
            formatDescription: formatDescription,
            sampleTiming: &timing,
            sampleBufferOut: &sampleBuffer
        )
        
        guard result == noErr, let sample = sampleBuffer else {
            Logger.shared.log("Failed to create sample buffer (error: \(result), -12743 = invalid format)", type: "Error")
            
            let width = CVPixelBufferGetWidth(buffer)
            let height = CVPixelBufferGetHeight(buffer)
            let pixelFormat = CVPixelBufferGetPixelFormatType(buffer)
            Logger.shared.log("Buffer info: \(width)x\(height), format: \(pixelFormat)", type: "Error")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            
            if self.displayLayer.status == .failed {
                if let error = self.displayLayer.error {
                    Logger.shared.log("Display layer in failed state: \(error.localizedDescription)", type: "Error")
                }
                self.displayLayer.flushAndRemoveImage()
            }
            
            if needsFlush {
                self.displayLayer.flushAndRemoveImage()
                self.didFlushForFormatChange = true
            } else if self.didFlushForFormatChange {
                self.displayLayer.flush()
                self.didFlushForFormatChange = false
            }
            
            if self.displayLayer.controlTimebase == nil {
                var timebase: CMTimebase?
                if CMTimebaseCreateWithSourceClock(allocator: kCFAllocatorDefault, sourceClock: CMClockGetHostTimeClock(), timebaseOut: &timebase) == noErr, let timebase {
                    CMTimebaseSetRate(timebase, rate: 1.0)
                    CMTimebaseSetTime(timebase, time: presentationTime)
                    self.displayLayer.controlTimebase = timebase
                } else {
                    Logger.shared.log("Failed to create control timebase", type: "Error")
                }
            }
            
            if !self.displayLayer.isReadyForMoreMediaData {
                Logger.shared.log("Display layer not ready for more media data", type: "Warn")
            }
            if shouldNotifyLoadingEnd {
                self.delegate?.renderer(self, didChangeLoading: false)
            }
            
            self.displayLayer.enqueue(sample)
        }
    }
    
    private func updateFormatDescriptionIfNeeded(for buffer: CVPixelBuffer) -> Bool {
        var didChange = false
        let width = Int32(CVPixelBufferGetWidth(buffer))
        let height = Int32(CVPixelBufferGetHeight(buffer))
        let pixelFormat = CVPixelBufferGetPixelFormatType(buffer)
        
        renderQueueSync {
            var needsRecreate = false
            
            if let description = formatDescription {
                let currentDimensions = CMVideoFormatDescriptionGetDimensions(description)
                let currentPixelFormat = CMFormatDescriptionGetMediaSubType(description)
                
                if currentDimensions.width != width ||
                    currentDimensions.height != height ||
                    currentPixelFormat != pixelFormat {
                    needsRecreate = true
                }
            } else {
                needsRecreate = true
            }
            
            if needsRecreate {
                var newDescription: CMVideoFormatDescription?
                
                let status = CMVideoFormatDescriptionCreateForImageBuffer(
                    allocator: kCFAllocatorDefault,
                    imageBuffer: buffer,
                    formatDescriptionOut: &newDescription
                )
                
                if status == noErr, let newDescription = newDescription {
                    formatDescription = newDescription
                    didChange = true
                    Logger.shared.log("Created new format description: \(width)x\(height), format: \(pixelFormat)", type: "Info")
                } else {
                    Logger.shared.log("Failed to create format description (status: \(status))", type: "Error")
                }
            }
        }
        return didChange
    }
    
    private func renderQueueSync(_ block: () -> Void) {
        if DispatchQueue.getSpecific(key: renderQueueKey) != nil {
            block()
        } else {
            renderQueue.sync(execute: block)
        }
    }
    
    private func currentVideoSize() -> CGSize {
        stateQueue.sync {
            videoSize
        }
    }
    
    private func updateVideoSize(width: Int, height: Int) {
        let size = CGSize(width: max(width, 0), height: max(height, 0))
        stateQueue.async(flags: .barrier) {
            self.videoSize = size
        }
        renderQueue.async { [weak self] in
            guard let self else { return }
            
            if self.poolWidth != width || self.poolHeight != height {
                self.recreatePixelBufferPool(width: max(width, 0), height: max(height, 0))
            }
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
            var value = Double(0)
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_DOUBLE, value: &value)
            if status >= 0 {
                cachedPosition = value
                delegate?.renderer(self, didUpdatePosition: cachedPosition, duration: cachedDuration)
            }
        case "pause":
            var flag: Int32 = 0
            let status = getProperty(handle: handle, name: name, format: MPV_FORMAT_FLAG, value: &flag)
            if status >= 0 {
                let newPaused = flag != 0
                if newPaused != isPaused {
                    isPaused = newPaused
                    delegate?.renderer(self, didChangePause: isPaused)
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
        command(handle, ["seek", String(clamped), "absolute"])
    }
    
    func seek(by seconds: Double) {
        guard let handle = mpv else { return }
        command(handle, ["seek", String(seconds), "relative"])
    }
    
    func setSpeed(_ speed: Double) {
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
        guard let handle = mpv else { return [] }
        
        var node = mpv_node()
        let status = "track-list".withCString { pointer in
            mpv_get_property(handle, pointer, MPV_FORMAT_NODE, &node)
        }
        
        guard status >= 0 else { return [] }
        defer { mpv_free_node_contents(&node) }
        
        var tracks: [[String: Any]] = []
        
        if node.format == MPV_FORMAT_NODE_ARRAY {
            let array = node.u.list.pointee
            for i in 0..<Int(array.num) {
                guard let values = array.values else { continue }
                let trackNode = values[i]
                
                if trackNode.format == MPV_FORMAT_NODE_MAP {
                    let map = trackNode.u.list.pointee
                    var trackInfo: [String: Any] = [:]
                    
                    for j in 0..<Int(map.num) {
                        guard let keys = map.keys, let vals = map.values else { continue }
                        let key = String(cString: keys[j]!)
                        let val = vals[j]
                        
                        switch key {
                        case "id":
                            if val.format == MPV_FORMAT_INT64 {
                                trackInfo["id"] = Int(val.u.int64)
                            }
                        case "type":
                            if val.format == MPV_FORMAT_STRING, let str = val.u.string {
                                trackInfo["type"] = String(cString: str)
                            }
                        case "title":
                            if val.format == MPV_FORMAT_STRING, let str = val.u.string {
                                trackInfo["title"] = String(cString: str)
                            }
                        case "lang":
                            if val.format == MPV_FORMAT_STRING, let str = val.u.string {
                                trackInfo["lang"] = String(cString: str)
                            }
                        case "selected":
                            if val.format == MPV_FORMAT_FLAG {
                                trackInfo["selected"] = val.u.flag == 1
                            }
                        default:
                            break
                        }
                    }
                    
                    if trackInfo["type"] as? String == "sub" {
                        tracks.append(trackInfo)
                    }
                }
            }
        }
        
        print("MPV: Found \(tracks.count) subtitle tracks")
        for track in tracks {
            print("MPV: Subtitle track - ID: \(track["id"] ?? "?"), Title: \(track["title"] ?? "?"), Lang: \(track["lang"] ?? "?"), Selected: \(track["selected"] ?? false)")
        }
        
        return tracks
    }
    
    func setSubtitleTrack(_ trackId: Int) {
        setProperty(name: "sid", value: String(trackId))
        print("MPV: Set subtitle track to \(trackId)")
    }
    
    func disableSubtitles() {
        setProperty(name: "sid", value: "no")
        print("MPV: Disabled subtitles")
    }
    
    func getCurrentSubtitleTrack() -> Int {
        guard let handle = mpv else { return 0 }
        var trackId: Int64 = 0
        let status = getProperty(handle: handle, name: "sid", format: MPV_FORMAT_INT64, value: &trackId)
        print("MPV: Current subtitle track is \(trackId), status: \(status)")
        return status >= 0 ? Int(trackId) : 0
    }
    
    func addSubtitleFile(url: String) {
        guard let handle = mpv else { return }
        command(handle, ["sub-add", url])
    }
    
    // MARK: - Subtitle Positioning
    
    /// Set subtitle vertical position (0-100, where 100 is bottom)
    func setSubtitlePosition(_ position: Int) {
        let clampedPosition = max(0, min(100, position))
        setProperty(name: "sub-pos", value: String(clampedPosition))
    }
    
    /// Set subtitle scale (1.0 is normal size)
    func setSubtitleScale(_ scale: Double) {
        let clampedScale = max(0.1, min(10.0, scale))
        setProperty(name: "sub-scale", value: String(clampedScale))
    }
    
    /// Set subtitle vertical margin in pixels
    func setSubtitleMarginY(_ margin: Int) {
        setProperty(name: "sub-margin-y", value: String(margin))
    }
    
    /// Set subtitle horizontal alignment: "left", "center", "right"
    func setSubtitleAlignX(_ alignment: String) {
        setProperty(name: "sub-align-x", value: alignment)
    }
    
    /// Set subtitle vertical alignment: "top", "center", "bottom"
    func setSubtitleAlignY(_ alignment: String) {
        setProperty(name: "sub-align-y", value: alignment)
    }
    
    /// Set subtitle font size
    func setSubtitleFontSize(_ size: Int) {
        let clampedSize = max(10, min(200, size))
        setProperty(name: "sub-font-size", value: String(clampedSize))
    }
}
