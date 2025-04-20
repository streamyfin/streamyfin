import ExpoModulesCore
import Libmpv
import SwiftUI
import UIKit

// MARK: - Metal Layer
class MetalLayer: CAMetalLayer {
    // workaround for a MoltenVK that sets the drawableSize to 1x1 to forcefully complete
    // the presentation, this causes flicker and the drawableSize possibly staying at 1x1
    // https://github.com/mpv-player/mpv/pull/13651
    override var drawableSize: CGSize {
        get { return super.drawableSize }
        set {
            if Int(newValue.width) > 1 && Int(newValue.height) > 1 {
                super.drawableSize = newValue
            }
        }
    }

    // Hack for fix [target-colorspace-hint] option:
    // Update wantsExtendedDynamicRangeContent only available in iOS 16.0+
    @available(iOS 16.0, *)
    override var wantsExtendedDynamicRangeContent: Bool {
        get {
            return super.wantsExtendedDynamicRangeContent
        }
        set {
            if Thread.isMainThread {
                super.wantsExtendedDynamicRangeContent = newValue
            } else {
                DispatchQueue.main.sync {
                    super.wantsExtendedDynamicRangeContent = newValue
                }
            }
        }
    }

    // Helper function to conditionally set HDR content
    func setHDRContent(_ enabled: Bool) {
        if #available(iOS 16.0, *) {
            if Thread.isMainThread {
                self.wantsExtendedDynamicRangeContent = enabled
            } else {
                DispatchQueue.main.sync {
                    self.wantsExtendedDynamicRangeContent = enabled
                }
            }
        }
    }
}

// MARK: - MPV Player View
class MpvPlayerView: ExpoView {
    private var mpvViewController: MpvMetalViewController?
    private var coordinator: MpvMetalPlayerView.Coordinator?

    private var source: [String: Any]?

    // Event emitters
    @objc var onVideoStateChange: RCTDirectEventBlock?
    @objc var onVideoLoadStart: RCTDirectEventBlock?
    @objc var onVideoLoadEnd: RCTDirectEventBlock?
    @objc var onVideoProgress: RCTDirectEventBlock?
    @objc var onVideoError: RCTDirectEventBlock?
    @objc var onPlaybackStateChanged: RCTDirectEventBlock?
    @objc var onPipStarted: RCTDirectEventBlock?

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        setupView()
    }

    private func setupView() {
        backgroundColor = .black

        // Create coordinator
        let coordinator = MpvMetalPlayerView.Coordinator()
        coordinator.onPropertyChange = { [weak self] _, propertyName, data in
            self?.handlePropertyChange(propertyName: propertyName, data: data)
        }
        self.coordinator = coordinator

        // Create MPV controller
        let mpvController = MpvMetalViewController()
        mpvController.playDelegate = coordinator
        coordinator.player = mpvController

        mpvViewController = mpvController

        // Add to view hierarchy
        let hostingController = UIHostingController(
            rootView: MpvMetalPlayerView(coordinator: coordinator)
        )

        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        hostingController.view.backgroundColor = .clear

        addSubview(hostingController.view)
        NSLayoutConstraint.activate([
            hostingController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
            hostingController.view.topAnchor.constraint(equalTo: topAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    // MARK: - Public Methods

    func setSource(_ source: [String: Any]) {
        self.source = source

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            self.onVideoLoadStart?(["target": self.reactTag as Any])

            if let uri = source["uri"] as? String, let url = URL(string: uri) {
                self.coordinator?.playUrl = url
                self.coordinator?.play(url)
                self.onVideoLoadEnd?(["target": self.reactTag as Any])
            } else {
                self.onVideoError?(["error": "Invalid or empty URI"])
            }
        }
    }

    func startPictureInPicture() {
        self.onPipStarted?(["pipStarted": false, "target": self.reactTag as Any])
    }

    func play() {
        mpvViewController?.play()
    }

    func pause() {
        mpvViewController?.pause()
    }

    func stop() {
        mpvViewController?.command("stop", args: [])
    }

    func seekTo(_ time: Int32) {
        let seconds = Double(time) / 1000.0
        mpvViewController?.command("seek", args: ["\(seconds)"])
    }

    func setAudioTrack(_ trackIndex: Int) {
        mpvViewController?.command("set", args: ["aid", "\(trackIndex)"])
    }

    func getAudioTracks() -> [[String: Any]]? {
        return []
    }

    func setSubtitleTrack(_ trackIndex: Int) {
        mpvViewController?.command("set", args: ["sid", "\(trackIndex)"])
    }

    func getSubtitleTracks() -> [[String: Any]]? {
        return []
    }

    func setSubtitleURL(_ subtitleURL: String, name: String) {
        guard let url = URL(string: subtitleURL) else { return }
        mpvViewController?.command("sub-add", args: [url.absoluteString])
    }

    // MARK: - Private Methods

    private func handlePropertyChange(propertyName: String, data: Any?) {
        switch propertyName {
        case MpvProperty.pausedForCache:
            let isBuffering = data as? Bool ?? false
            onVideoStateChange?(["isBuffering": isBuffering, "target": reactTag as Any])

        case MpvProperty.timePosition:
            if let position = data as? Double {
                let timeMs = position * 1000
                onVideoProgress?([
                    "currentTime": timeMs,
                    "duration": getVideoDuration() * 1000,
                    "isPlaying": !isPaused(),
                    "isBuffering": isBuffering(),
                    "target": reactTag as Any,
                ])
            }

        case MpvProperty.pause:
            if let isPaused = data as? Bool {
                let state = isPaused ? "Paused" : "Playing"
                onPlaybackStateChanged?([
                    "state": state,
                    "isPlaying": !isPaused,
                    "isBuffering": isBuffering(),
                    "currentTime": getCurrentTime() * 1000,
                    "duration": getVideoDuration() * 1000,
                    "target": reactTag as Any,
                ])
            }

        default:
            break
        }
    }

    private func isPaused() -> Bool {
        return mpvViewController?.getFlag(MpvProperty.pause) ?? true
    }

    private func isBuffering() -> Bool {
        return mpvViewController?.getFlag(MpvProperty.pausedForCache) ?? false
    }

    private func getCurrentTime() -> Double {
        return mpvViewController?.getDouble(MpvProperty.timePosition) ?? 0
    }

    private func getVideoDuration() -> Double {
        return mpvViewController?.getDouble(MpvProperty.duration) ?? 0
    }
}

// MARK: - MPV Properties and Protocol
enum MpvProperty {
    static let timePosition = "time-pos"
    static let duration = "duration"
    static let pause = "pause"
    static let pausedForCache = "paused-for-cache"
    static let videoParamsSigPeak = "video-params/sig-peak"
}

protocol MpvPlayerDelegate: AnyObject {
    func propertyChange(mpv: OpaquePointer, propertyName: String, data: Any?)
}

// MARK: - SwiftUI Wrapper
struct MpvMetalPlayerView: UIViewControllerRepresentable {
    @ObservedObject var coordinator: Coordinator

    func makeUIViewController(context: Context) -> some UIViewController {
        let mpv = MpvMetalViewController()
        mpv.playDelegate = coordinator
        mpv.playUrl = coordinator.playUrl

        context.coordinator.player = mpv
        return mpv
    }

    func updateUIViewController(_ uiViewController: UIViewControllerType, context: Context) {
    }

    public func makeCoordinator() -> Coordinator {
        coordinator
    }

    func play(_ url: URL) -> Self {
        coordinator.playUrl = url
        return self
    }

    func onPropertyChange(_ handler: @escaping (MpvMetalViewController, String, Any?) -> Void)
        -> Self
    {
        coordinator.onPropertyChange = handler
        return self
    }

    @MainActor
    public final class Coordinator: MpvPlayerDelegate, ObservableObject {
        weak var player: MpvMetalViewController?

        var playUrl: URL?
        var onPropertyChange: ((MpvMetalViewController, String, Any?) -> Void)?

        func play(_ url: URL) {
            player?.loadFile(url)
        }

        func propertyChange(mpv: OpaquePointer, propertyName: String, data: Any?) {
            guard let player = player else { return }

            self.onPropertyChange?(player, propertyName, data)
        }
    }
}

// MARK: - MPV Metal View Controller
final class MpvMetalViewController: UIViewController {
    var metalLayer = MetalLayer()
    var mpv: OpaquePointer!
    weak var playDelegate: MpvPlayerDelegate?
    lazy var queue = DispatchQueue(label: "mpv", qos: .userInitiated)

    var playUrl: URL?
    var hdrAvailable: Bool {
        if #available(iOS 16.0, *) {
            let maxEDRRange = view.window?.screen.potentialEDRHeadroom ?? 1.0
            let sigPeak = getDouble(MpvProperty.videoParamsSigPeak)
            // display screen support HDR and current playing HDR video
            return maxEDRRange > 1.0 && sigPeak > 1.0
        } else {
            return false  // HDR not available on iOS < 16.0
        }
    }
    var hdrEnabled = false {
        didSet {
            // FIXME: target-colorspace-hint does not support being changed at runtime.
            // this option should be set as early as possible otherwise can cause issues
            // not recommended to use this way.
            if hdrEnabled {
                checkError(mpv_set_option_string(mpv, "target-colorspace-hint", "yes"))
                metalLayer.setHDRContent(true)
            } else {
                checkError(mpv_set_option_string(mpv, "target-colorspace-hint", "no"))
                metalLayer.setHDRContent(false)
            }
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        metalLayer.frame = view.frame
        metalLayer.contentsScale = UIScreen.main.nativeScale
        metalLayer.framebufferOnly = true
        metalLayer.backgroundColor = UIColor.black.cgColor

        view.layer.addSublayer(metalLayer)

        setupMpv()

        if let url = playUrl {
            loadFile(url)
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()

        metalLayer.frame = view.frame
    }

    func setupMpv() {
        mpv = mpv_create()
        if mpv == nil {
            print("failed creating context\n")
            exit(1)
        }

        // https://mpv.io/manual/stable/#options
        #if DEBUG
            checkError(mpv_request_log_messages(mpv, "debug"))
        #else
            checkError(mpv_request_log_messages(mpv, "no"))
        #endif

        checkError(mpv_set_option(mpv, "wid", MPV_FORMAT_INT64, &metalLayer))
        checkError(mpv_set_option_string(mpv, "subs-match-os-language", "yes"))
        checkError(mpv_set_option_string(mpv, "subs-fallback", "yes"))
        checkError(mpv_set_option_string(mpv, "vo", "gpu-next"))
        checkError(mpv_set_option_string(mpv, "gpu-api", "vulkan"))
        checkError(mpv_set_option_string(mpv, "hwdec", "videotoolbox"))
        checkError(mpv_set_option_string(mpv, "video-rotate", "no"))
        checkError(mpv_set_option_string(mpv, "ytdl", "no"))

        checkError(mpv_initialize(mpv))

        mpv_observe_property(mpv, 0, MpvProperty.videoParamsSigPeak, MPV_FORMAT_DOUBLE)
        mpv_observe_property(mpv, 0, MpvProperty.pausedForCache, MPV_FORMAT_FLAG)
        mpv_observe_property(mpv, 0, MpvProperty.timePosition, MPV_FORMAT_DOUBLE)
        mpv_observe_property(mpv, 0, MpvProperty.duration, MPV_FORMAT_DOUBLE)
        mpv_observe_property(mpv, 0, MpvProperty.pause, MPV_FORMAT_FLAG)

        mpv_set_wakeup_callback(
            self.mpv,
            { (ctx) in
                let client = unsafeBitCast(ctx, to: MpvMetalViewController.self)
                client.readEvents()
            }, UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque()))
    }

    func loadFile(_ url: URL) {
        var args = [url.absoluteString]
        args.append("replace")

        command("loadfile", args: args)
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
        guard mpv != nil else { return 0.0 }
        var data = Double()
        mpv_get_property(mpv, name, MPV_FORMAT_DOUBLE, &data)
        return data
    }

    func getString(_ name: String) -> String? {
        guard mpv != nil else { return nil }
        let cstr = mpv_get_property_string(mpv, name)
        let str: String? = cstr == nil ? nil : String(cString: cstr!)
        mpv_free(cstr)
        return str
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

    func readEvents() {
        queue.async { [weak self] in
            guard let self = self else { return }

            while self.mpv != nil {
                let event = mpv_wait_event(self.mpv, 0)
                if event?.pointee.event_id == MPV_EVENT_NONE {
                    break
                }

                switch event!.pointee.event_id {
                case MPV_EVENT_PROPERTY_CHANGE:
                    let dataOpaquePtr = OpaquePointer(event!.pointee.data)
                    if let property = UnsafePointer<mpv_event_property>(dataOpaquePtr)?.pointee {
                        let propertyName = String(cString: property.name)

                        switch propertyName {
                        case MpvProperty.pausedForCache:
                            let buffering =
                                UnsafePointer<Bool>(OpaquePointer(property.data))?.pointee ?? true
                            DispatchQueue.main.async {
                                self.playDelegate?.propertyChange(
                                    mpv: self.mpv, propertyName: propertyName, data: buffering)
                            }
                        case MpvProperty.timePosition:
                            if let data = property.data,
                                let position = UnsafePointer<Double>(OpaquePointer(data))?.pointee
                            {
                                DispatchQueue.main.async {
                                    self.playDelegate?.propertyChange(
                                        mpv: self.mpv, propertyName: propertyName, data: position)
                                }
                            }
                        case MpvProperty.pause:
                            if let data = property.data,
                                let paused = UnsafePointer<Bool>(OpaquePointer(data))?.pointee
                            {
                                DispatchQueue.main.async {
                                    self.playDelegate?.propertyChange(
                                        mpv: self.mpv, propertyName: propertyName, data: paused)
                                }
                            }
                        case MpvProperty.duration:
                            if let data = property.data,
                                let duration = UnsafePointer<Double>(OpaquePointer(data))?.pointee
                            {
                                DispatchQueue.main.async {
                                    self.playDelegate?.propertyChange(
                                        mpv: self.mpv, propertyName: propertyName, data: duration)
                                }
                            }
                        default:
                            break
                        }
                    }
                case MPV_EVENT_SHUTDOWN:
                    print("event: shutdown\n")
                    mpv_terminate_destroy(mpv)
                    mpv = nil
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

    deinit {
        if mpv != nil {
            mpv_terminate_destroy(mpv)
            mpv = nil
        }
    }
}
