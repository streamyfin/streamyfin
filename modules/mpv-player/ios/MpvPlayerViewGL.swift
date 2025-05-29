import ExpoModulesCore
import Foundation
import GLKit
import Libmpv
import SwiftUI
import UIKit

// MARK: - MPV Properties
enum MpvProperty {
    static let timePosition = "time-pos"
    static let duration = "duration"
    static let pause = "pause"
    static let pausedForCache = "paused-for-cache"
    static let videoParamsSigPeak = "video-params/sig-peak"
}

// MARK: - Protocol
protocol MpvPlayerDelegate: AnyObject {
    func propertyChanged(mpv: OpaquePointer, propertyName: String, value: Any?)
}

// MARK: - MPV Player View
class MpvPlayerView: ExpoView {
    // MARK: - Properties

    private var playerController: MpvGLViewController?
    private var source: [String: Any]?
    private var externalSubtitles: [[String: String]]?

    // MARK: - Event Emitters

    @objc var onVideoStateChange: RCTDirectEventBlock?
    @objc var onVideoLoadStart: RCTDirectEventBlock?
    @objc var onVideoLoadEnd: RCTDirectEventBlock?
    @objc var onVideoProgress: RCTDirectEventBlock?
    @objc var onVideoError: RCTDirectEventBlock?
    @objc var onPlaybackStateChanged: RCTDirectEventBlock?
    @objc var onPipStarted: RCTDirectEventBlock?

    // MARK: - Initialization

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        setupView()
    }

    // MARK: - Setup

    private func setupView() {
        backgroundColor = .black

        print("Setting up MPV GL view")

        // Create player controller - IMPORTANT: Use init(nibName:bundle:) to ensure proper GLKView setup
        let controller = MpvGLViewController(nibName: nil, bundle: nil)

        // Force view loading immediately
        _ = controller.view

        // Configure player delegate
        controller.mpvDelegate = self
        playerController = controller

        // Make sure controller view is properly set up as GLKView
        controller.view.backgroundColor = .black

        // Set explicit frame to ensure it's visible
        controller.view.frame = bounds
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        // Add to hierarchy
        addSubview(controller.view)

        // Use constraints to ensure proper sizing
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: topAnchor),
            controller.view.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    // Override layoutSubviews to make sure the player view is properly sized
    override func layoutSubviews() {
        super.layoutSubviews()
        playerController?.view.frame = bounds
    }

    // MARK: - Public Methods

    func setSource(_ source: [String: Any]) {
        self.source = source

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.onVideoLoadStart?(["target": self.reactTag as Any])

            // Store external subtitle data
            self.externalSubtitles = source["externalSubtitles"] as? [[String: String]]

            if let uri = source["uri"] as? String, let url = URL(string: uri) {
                print("Loading file: \(url.absoluteString)")
                self.playerController?.playUrl = url

                // Set start position if available
                if let startPosition = source["startPosition"] as? Double {
                    self.playerController?.startPosition = startPosition
                }

                self.playerController?.loadFile(url)

                // Set video to fill the screen
                self.setVideoScalingMode("cover")

                // Add external subtitles after the video is loaded
                self.setInitialExternalSubtitles()

                self.onVideoLoadEnd?(["target": self.reactTag as Any])
            } else {
                self.onVideoError?(["error": "Invalid or empty URI"])
            }
        }
    }

    func startPictureInPicture() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.onPipStarted?(["pipStarted": false, "target": self.reactTag as Any])
        }
    }

    func play() {
        playerController?.play()
    }

    func pause() {
        playerController?.pause()
    }

    func stop() {
        playerController?.command("stop", args: [])
    }

    func seekTo(_ time: Int32) {
        let seconds = Double(time) / 1000.0
        print("Seeking to absolute position: \(seconds) seconds")
        playerController?.command("seek", args: ["\(seconds)", "absolute"])
    }

    func setAudioTrack(_ trackIndex: Int) {
        playerController?.command("set", args: ["aid", "\(trackIndex)"])
    }

    func getAudioTracks() -> [[String: Any]] {
        guard let playerController = playerController else {
            return []
        }

        // Get track list as a node
        guard let trackListStr = playerController.getNode("track-list") else {
            return []
        }

        // Parse the JSON string into an array
        guard let data = trackListStr.data(using: .utf8),
            let trackList = try? JSONSerialization.jsonObject(with: data) as? [Any]
        else {
            return []
        }

        // Filter to audio tracks only
        var audioTracks: [[String: Any]] = []
        for case let track as [String: Any] in trackList {
            if let type = track["type"] as? String, type == "audio" {
                let id = track["id"] as? Int ?? 0
                let title = track["title"] as? String ?? "Audio \(id)"
                let lang = track["lang"] as? String ?? "unknown"
                let selected = track["selected"] as? Bool ?? false

                audioTracks.append([
                    "id": id,
                    "title": title,
                    "language": lang,
                    "selected": selected,
                ])
            }
        }

        return audioTracks
    }

    func setSubtitleTrack(_ trackIndex: Int) {
        playerController?.command("set", args: ["sid", "\(trackIndex)"])
    }

    func getSubtitleTracks() -> [[String: Any]] {
        guard let playerController = playerController else {
            return []
        }

        // Get track list as a node
        guard let trackListStr = playerController.getNode("track-list") else {
            return []
        }

        // Parse the JSON string into an array
        guard let data = trackListStr.data(using: .utf8),
            let trackList = try? JSONSerialization.jsonObject(with: data) as? [Any]
        else {
            return []
        }

        // Filter to subtitle tracks only
        var subtitleTracks: [[String: Any]] = []
        for case let track as [String: Any] in trackList {
            if let type = track["type"] as? String, type == "sub" {
                let id = track["id"] as? Int ?? 0
                let title = track["title"] as? String ?? "Subtitle \(id)"
                let lang = track["lang"] as? String ?? "unknown"
                let selected = track["selected"] as? Bool ?? false

                subtitleTracks.append([
                    "id": id,
                    "title": title,
                    "language": lang,
                    "selected": selected,
                ])
            }
        }

        return subtitleTracks
    }

    func setSubtitleURL(_ subtitleURL: String, name: String) {
        guard let url = URL(string: subtitleURL) else { return }

        print("Adding subtitle: \(name) from \(subtitleURL)")

        // Add the subtitle file
        playerController?.command("sub-add", args: [url.absoluteString])
    }

    @objc
    func setVideoScalingMode(_ mode: String) {
        // Mode can be: "contain" (letterbox), "cover" (crop/fill), or "stretch"

        guard let playerController = playerController else { return }

        switch mode.lowercased() {
        case "cover", "fill", "crop":
            // Fill the screen, cropping if necessary
            playerController.command("set", args: ["panscan", "1.0"])
            playerController.command("set", args: ["video-unscaled", "no"])
            playerController.command("set", args: ["video-aspect-override", "no"])
            // Center the crop
            playerController.command("set", args: ["video-align-x", "0.5"])
            playerController.command("set", args: ["video-align-y", "0.5"])
        case "stretch":
            // Stretch to fill without maintaining aspect ratio
            playerController.command("set", args: ["panscan", "0.0"])
            playerController.command("set", args: ["video-unscaled", "no"])
            playerController.command("set", args: ["video-aspect-override", "-1"])
        // No need for alignment as it stretches to fill entire area
        case "contain", "letterbox", "fit":
            // Keep aspect ratio, fit within screen (letterbox)
            playerController.command("set", args: ["panscan", "0.0"])
            playerController.command("set", args: ["video-unscaled", "no"])
            playerController.command("set", args: ["video-aspect-override", "no"])
            // Set alignment to center
            playerController.command("set", args: ["video-align-x", "0.5"])
            playerController.command("set", args: ["video-align-y", "0.5"])
        default:
            break
        }
    }

    private func setInitialExternalSubtitles() {
        if let externalSubtitles = self.externalSubtitles {
            for subtitle in externalSubtitles {
                if let subtitleName = subtitle["name"],
                    let subtitleURL = subtitle["DeliveryUrl"]
                {
                    print("Adding external subtitle: \(subtitleName) from \(subtitleURL)")
                    setSubtitleURL(subtitleURL, name: subtitleName)
                }
            }
        }
    }

    // MARK: - Private Methods

    private func isPaused() -> Bool {
        return playerController?.getFlag(MpvProperty.pause) ?? true
    }

    private func isBuffering() -> Bool {
        return playerController?.getFlag(MpvProperty.pausedForCache) ?? false
    }

    private func getCurrentTime() -> Double {
        return playerController?.getDouble(MpvProperty.timePosition) ?? 0
    }

    private func getVideoDuration() -> Double {
        return playerController?.getDouble(MpvProperty.duration) ?? 0
    }

    // MARK: - Cleanup

    override func removeFromSuperview() {
        cleanup()
        super.removeFromSuperview()
    }

    private func cleanup() {
        // Check if we already cleaned up

        print("Cleaning up player")
        guard playerController != nil else { return }

        // First stop playback
        stop()

        // Break reference cycles
        playerController?.mpvDelegate = nil

        // Remove from view hierarchy
        playerController?.view.removeFromSuperview()

        // Release references
        playerController = nil
    }

    deinit {
        cleanup()
    }

    // Check if player needs reset when the view appears
    override func didMoveToWindow() {
        super.didMoveToWindow()

        // If we're returning to the window and player is missing, reset
        if window != nil && playerController == nil {
            setupView()

            // Reload previous source if available
            if let source = source {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                    self?.setSource(source)
                }
            }
        }
    }
}

// MARK: - MPV Player Delegate
extension MpvPlayerView: MpvPlayerDelegate {
    // Move the static properties to class level
    private static var lastTimePositionUpdate = Date(timeIntervalSince1970: 0)

    func propertyChanged(mpv: OpaquePointer, propertyName: String, value: Any?) {
        // Add throttling for frequently updated properties
        switch propertyName {
        case MpvProperty.timePosition:
            // Throttle timePosition updates to once per second
            let now = Date()
            if now.timeIntervalSince(MpvPlayerView.lastTimePositionUpdate) < 1.0 {
                return
            }
            MpvPlayerView.lastTimePositionUpdate = now

            if let position = value as? Double {
                let timeMs = position * 1000
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    print("IsPlaying: \(!self.isPaused())")
                    self.onVideoProgress?([
                        "currentTime": timeMs,
                        "duration": self.getVideoDuration() * 1000,
                        "isPlaying": !self.isPaused(),
                        "isBuffering": self.isBuffering(),
                        "target": self.reactTag as Any,
                    ])
                }
            }

        case MpvProperty.pausedForCache:
            // We want to respond immediately to buffering state changes
            let isBuffering = value as? Bool ?? false
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.onVideoStateChange?([
                    "isBuffering": isBuffering, "target": self.reactTag as Any,
                    "isPlaying": !self.isPaused(),
                    "state": self.isPaused() ? "Paused" : "Playing",
                ])
            }

        case MpvProperty.pause:
            // We want to respond immediately to play/pause state changes
            if let isPaused = value as? Bool {
                let state = isPaused ? "Paused" : "Playing"
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }

                    print("onPlaybackStateChanged: \(state)")
                    self.onPlaybackStateChanged?([
                        "state": state,
                        "isPlaying": !isPaused,
                        "isBuffering": self.isBuffering(),
                        "currentTime": self.getCurrentTime() * 1000,
                        "duration": self.getVideoDuration() * 1000,
                        "target": self.reactTag as Any,
                    ])
                }
            }

        default:
            break
        }
    }
}

// MARK: - Player Controller
final class MpvGLViewController: GLKViewController {
    // MARK: - Properties
    var mpv: OpaquePointer!
    var mpvGL: OpaquePointer!
    weak var mpvDelegate: MpvPlayerDelegate?
    var queue: DispatchQueue = DispatchQueue(label: "mpv", qos: .userInteractive)
    private var defaultFBO: GLint = -1

    var playUrl: URL?
    var startPosition: Double?

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()

        setupContext()
        setupMpv()

        if let url = playUrl {
            self.loadFile(url)
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        print("GLKViewController viewWillAppear")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        print("GLKViewController viewDidAppear")
    }

    deinit {
        // Clean up on deallocation
        if mpvGL != nil {
            mpv_render_context_free(mpvGL)
            mpvGL = nil
        }

        if mpv != nil {
            mpv_terminate_destroy(mpv)
            mpv = nil
        }
    }

    // MARK: - Setup

    func setupContext() {
        print("Setting up OpenGL ES context")

        let context = EAGLContext(api: .openGLES3)!
        if context == nil {
            print("ERROR: Failed to create OpenGL ES context")
            return
        }

        let isSuccess = EAGLContext.setCurrent(context)
        if !isSuccess {
            print("ERROR: Failed to set current GL context")
            return
        }

        // Set the context on our GLKView
        let glkView = self.view as! GLKView
        glkView.context = context

        print("Successfully set up OpenGL ES context")
    }

    func setupMpv() {
        print("Setting up MPV")

        mpv = mpv_create()
        if mpv == nil {
            print("ERROR: failed creating mpv context\n")
            exit(1)
        }

        // https://mpv.io/manual/stable/#options
        #if DEBUG
            checkError(mpv_request_log_messages(mpv, "debug"))
        #else
            checkError(mpv_request_log_messages(mpv, "no"))
        #endif
        #if os(macOS)
            checkError(mpv_set_option_string(mpv, "input-media-keys", "yes"))
        #endif

        // Set options
        checkError(mpv_set_option_string(mpv, "subs-match-os-language", "yes"))
        checkError(mpv_set_option_string(mpv, "subs-fallback", "yes"))
        checkError(mpv_set_option_string(mpv, "hwdec", "auto-copy"))
        checkError(mpv_set_option_string(mpv, "vo", "libmpv"))
        checkError(mpv_set_option_string(mpv, "profile", "gpu-hq"))
        checkError(mpv_set_option_string(mpv, "gpu-api", "opengl"))

        // Add in setupMpv before initialization
        checkError(mpv_set_option_string(mpv, "opengl-es", "yes"))
        checkError(mpv_set_option_string(mpv, "opengl-version", "3"))

        // Initialize MPV
        checkError(mpv_initialize(mpv))

        // Set starting point if available
        if let startPos = startPosition {
            let startPosString = String(format: "%.1f", startPos)
            print("Setting initial start position to \(startPosString)")
            checkError(mpv_set_option_string(mpv, "start", startPosString))
        }

        // Set up rendering
        print("Setting up MPV GL rendering context")
        let api = UnsafeMutableRawPointer(
            mutating: (MPV_RENDER_API_TYPE_OPENGL as NSString).utf8String)
        var initParams = mpv_opengl_init_params(
            get_proc_address: {
                (ctx, name) in
                return MpvGLViewController.getProcAddress(ctx, name)
            },
            get_proc_address_ctx: nil
        )

        withUnsafeMutablePointer(to: &initParams) { initParams in
            var params = [
                mpv_render_param(type: MPV_RENDER_PARAM_API_TYPE, data: api),
                mpv_render_param(type: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, data: initParams),
                mpv_render_param(),
            ]

            if mpv_render_context_create(&mpvGL, mpv, &params) < 0 {
                puts("ERROR: failed to initialize mpv GL context")
                exit(1)
            }

            print("Successfully created MPV GL render context")

            mpv_render_context_set_update_callback(
                mpvGL,
                mpvGLUpdate,
                UnsafeMutableRawPointer(Unmanaged.passUnretained(self.view).toOpaque())
            )
        }

        // Observe properties
        mpv_observe_property(mpv, 0, MpvProperty.videoParamsSigPeak, MPV_FORMAT_DOUBLE)
        mpv_observe_property(mpv, 0, MpvProperty.pausedForCache, MPV_FORMAT_FLAG)
        mpv_observe_property(mpv, 0, MpvProperty.timePosition, MPV_FORMAT_DOUBLE)
        mpv_observe_property(mpv, 0, MpvProperty.duration, MPV_FORMAT_DOUBLE)
        mpv_observe_property(mpv, 0, MpvProperty.pause, MPV_FORMAT_FLAG)

        // Set wakeup callback
        mpv_set_wakeup_callback(
            self.mpv,
            { (ctx) in
                let client = unsafeBitCast(ctx, to: MpvGLViewController.self)
                client.readEvents()
            }, UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque()))

        print("MPV setup complete")

        // Configure GLKView properly for better performance
        let glkView = self.view as! GLKView
        glkView.enableSetNeedsDisplay = false  // Allow continuous rendering
        glkView.drawableMultisample = .multisample4X  // Might help or hurt - test both
        glkView.drawableColorFormat = .RGBA8888

        // Set higher preferred frame rate
        self.preferredFramesPerSecond = 60  // Or even higher on newer devices
    }

    // MARK: - MPV Methods

    func loadFile(_ url: URL) {
        print("Loading file: \(url.absoluteString)")

        var args = [url.absoluteString]
        args.append("replace")

        print("MPV Command: loadfile with args \(args)")
        command("loadfile", args: args.map { $0 as String? })

        // Set video settings for visibility
        command("set", args: ["video-unscaled", "no"])
        command("set", args: ["panscan", "1.0"])  // Ensure video fills screen
    }

    func togglePause() {
        getFlag(MpvProperty.pause) ? play() : pause()
    }

    func play() {
        setFlag(MpvProperty.pause, false)
    }

    func pause() {
        setFlag(MpvProperty.pause, true)
    }

    func getDouble(_ name: String) -> Double {
        var data = 0.0
        mpv_get_property(mpv, name, MPV_FORMAT_DOUBLE, &data)
        return data
    }

    func getNode(_ name: String) -> String? {
        guard let cString = mpv_get_property_string(mpv, name) else { return nil }
        defer {
            mpv_free(UnsafeMutableRawPointer(mutating: cString))
        }
        return String(cString: cString)
    }

    func getFlag(_ name: String) -> Bool {
        var data = Int64()
        mpv_get_property(mpv, name, MPV_FORMAT_FLAG, &data)
        return data > 0
    }

    func setFlag(_ name: String, _ flag: Bool) {
        guard mpv != nil else { return }
        var data: Int = flag ? 1 : 0
        mpv_set_property(mpv, name, MPV_FORMAT_FLAG, &data)
    }

    func command(
        _ command: String,
        args: [String?] = [],
        checkForErrors: Bool = true,
        returnValueCallback: ((Int32) -> Void)? = nil
    ) {
        guard mpv != nil else {
            return
        }
        var cargs = makeCArgs(command, args).map { $0.flatMap { UnsafePointer<CChar>(strdup($0)) } }
        defer {
            for ptr in cargs where ptr != nil {
                free(UnsafeMutablePointer(mutating: ptr!))
            }
        }
        let returnValue = mpv_command(mpv, &cargs)
        if checkForErrors {
            checkError(returnValue)
        }
        if let cb = returnValueCallback {
            cb(returnValue)
        }
    }

    private func makeCArgs(_ command: String, _ args: [String?]) -> [String?] {
        if !args.isEmpty, args.last == nil {
            fatalError("Command do not need a nil suffix")
        }

        var strArgs = args
        strArgs.insert(command, at: 0)
        strArgs.append(nil)

        return strArgs
    }

    // MARK: - Event Processing

    func readEvents() {
        queue.async { [self] in
            while self.mpv != nil {
                let event = mpv_wait_event(self.mpv, 0)
                if event!.pointee.event_id == MPV_EVENT_NONE {
                    break
                }
                switch event!.pointee.event_id {
                case MPV_EVENT_PROPERTY_CHANGE:
                    let dataOpaquePtr = OpaquePointer(event!.pointee.data)
                    if let property = UnsafePointer<mpv_event_property>(dataOpaquePtr)?.pointee {
                        let propertyName = String(cString: property.name)

                        // Handle different property types
                        var value: Any?

                        switch propertyName {
                        case MpvProperty.pausedForCache, MpvProperty.pause:
                            if property.format == MPV_FORMAT_FLAG,
                                let data = property.data
                            {
                                let boolValue =
                                    UnsafePointer<Bool>(OpaquePointer(data))?.pointee ?? false
                                value = boolValue
                            }

                        case MpvProperty.timePosition, MpvProperty.duration:
                            if property.format == MPV_FORMAT_DOUBLE,
                                let data = property.data
                            {
                                let doubleValue =
                                    UnsafePointer<Double>(OpaquePointer(data))?.pointee ?? 0.0
                                value = doubleValue
                            }

                        default:
                            break
                        }

                        // Notify delegate if we have a value
                        if let value = value {
                            DispatchQueue.main.async { [weak self] in
                                guard let self = self else { return }
                                self.mpvDelegate?.propertyChanged(
                                    mpv: self.mpv, propertyName: propertyName, value: value)
                            }
                        }
                    }
                case MPV_EVENT_SHUTDOWN:
                    mpv_render_context_free(mpvGL)
                    mpv_terminate_destroy(mpv)
                    mpv = nil
                    print("event: shutdown\n")
                    break
                case MPV_EVENT_LOG_MESSAGE:
                    let msg = UnsafeMutablePointer<mpv_event_log_message>(
                        OpaquePointer(event!.pointee.data))
                    print(
                        "[\(String(cString: (msg!.pointee.prefix)!))] \(String(cString: (msg!.pointee.level)!)): \(String(cString: (msg!.pointee.text)!))",
                        terminator: "")
                default:
                    let eventName = mpv_event_name(event!.pointee.event_id)
                    print("event: \(String(cString: (eventName)!))")
                }
            }
        }
    }

    private func checkError(_ status: CInt) {
        if status < 0 {
            print("MPV API error: \(String(cString: mpv_error_string(status)))\n")
        }
    }

    private var machine: String {
        var systeminfo = utsname()
        uname(&systeminfo)
        return withUnsafeBytes(of: &systeminfo.machine) { bufPtr -> String in
            let data = Data(bufPtr)
            if let lastIndex = data.lastIndex(where: { $0 != 0 }) {
                return String(data: data[0...lastIndex], encoding: .isoLatin1)!
            } else {
                return String(data: data, encoding: .isoLatin1)!
            }
        }
    }

    // MARK: - GL Rendering

    override func glkView(_ view: GLKView, drawIn rect: CGRect) {
        guard let mpvGL else {
            return
        }

        // fill black background
        glClearColor(0, 0, 0, 0)
        glClear(UInt32(GL_COLOR_BUFFER_BIT))

        glGetIntegerv(UInt32(GL_FRAMEBUFFER_BINDING), &defaultFBO)

        var dims: [GLint] = [0, 0, 0, 0]
        glGetIntegerv(GLenum(GL_VIEWPORT), &dims)

        var data = mpv_opengl_fbo(
            fbo: Int32(defaultFBO),
            w: Int32(dims[2]),
            h: Int32(dims[3]),
            internal_format: 0
        )

        var flip: CInt = 1
        withUnsafeMutablePointer(to: &flip) { flip in
            withUnsafeMutablePointer(to: &data) { data in
                var params = [
                    mpv_render_param(type: MPV_RENDER_PARAM_OPENGL_FBO, data: data),
                    mpv_render_param(type: MPV_RENDER_PARAM_FLIP_Y, data: flip),
                    mpv_render_param(),
                ]
                mpv_render_context_render(mpvGL, &params)
            }
        }

    }

    private static func getProcAddress(_: UnsafeMutableRawPointer?, _ name: UnsafePointer<Int8>?)
        -> UnsafeMutableRawPointer?
    {
        let symbolName = CFStringCreateWithCString(
            kCFAllocatorDefault, name, CFStringBuiltInEncodings.ASCII.rawValue)
        let identifier = CFBundleGetBundleWithIdentifier("com.apple.opengles" as CFString)

        return CFBundleGetFunctionPointerForName(identifier, symbolName)
    }
}

private func mpvGLUpdate(_ ctx: UnsafeMutableRawPointer?) {
    let glView = unsafeBitCast(ctx, to: GLKView.self)

    DispatchQueue.main.async {
        glView.display()
    }
}
