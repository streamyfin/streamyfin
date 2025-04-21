import ExpoModulesCore
import Libmpv
import SwiftUI
import UIKit

// MARK: - Metal Layer
class MetalLayer: CAMetalLayer {
    // Workaround for MoltenVK issue that sets drawableSize to 1x1
    override var drawableSize: CGSize {
        get { return super.drawableSize }
        set {
            if Int(newValue.width) > 1 && Int(newValue.height) > 1 {
                super.drawableSize = newValue
            }
        }
    }

    // Handle extended dynamic range content on iOS 16+
    @available(iOS 16.0, *)
    override var wantsExtendedDynamicRangeContent: Bool {
        get { return super.wantsExtendedDynamicRangeContent }
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

    // Helper to set HDR content safely
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

    private var playerController: MpvMetalViewController?
    private var coordinator: MpvMetalPlayerView.Coordinator?
    private var hostingController: UIHostingController<MpvMetalPlayerView>?
    private var source: [String: Any]?

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

        // Create coordinator and configure property change handling
        let coordinator = MpvMetalPlayerView.Coordinator()
        coordinator.onPropertyChange = { [weak self] _, propertyName, value in
            DispatchQueue.main.async {
                self?.handlePropertyChange(propertyName: propertyName, value: value)
            }
        }
        self.coordinator = coordinator

        // Create player controller
        let controller = MpvMetalViewController()
        controller.delegate = coordinator
        coordinator.player = controller
        playerController = controller

        // Create and add SwiftUI hosting controller
        let hostController = UIHostingController(
            rootView: MpvMetalPlayerView(coordinator: coordinator, existingController: controller)
        )
        self.hostingController = hostController

        hostController.view.translatesAutoresizingMaskIntoConstraints = false
        hostController.view.backgroundColor = .clear

        addSubview(hostController.view)
        NSLayoutConstraint.activate([
            hostController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            hostController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
            hostController.view.topAnchor.constraint(equalTo: topAnchor),
            hostController.view.bottomAnchor.constraint(equalTo: bottomAnchor),
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
        // Implementation would go here
        return []
    }

    func setSubtitleTrack(_ trackIndex: Int) {
        playerController?.command("set", args: ["sid", "\(trackIndex)"])
    }

    func getSubtitleTracks() -> [[String: Any]] {
        // Implementation would go here
        return []
    }

    func setSubtitleURL(_ subtitleURL: String, name: String) {
        guard let url = URL(string: subtitleURL) else { return }
        playerController?.command("sub-add", args: [url.absoluteString])
    }

    // MARK: - Private Methods

    private func handlePropertyChange(propertyName: String, value: Any?) {
        guard let playerController = playerController else { return }

        switch propertyName {
        case MpvProperty.pausedForCache:
            let isBuffering = value as? Bool ?? false
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.onVideoStateChange?([
                    "isBuffering": isBuffering, "target": self.reactTag as Any,
                ])
            }

        case MpvProperty.timePosition:
            if let position = value as? Double {
                let timeMs = position * 1000
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.onVideoProgress?([
                        "currentTime": timeMs,
                        "duration": self.getVideoDuration() * 1000,
                        "isPlaying": !self.isPaused(),
                        "isBuffering": self.isBuffering(),
                        "target": self.reactTag as Any,
                    ])
                }
            }

        case MpvProperty.pause:
            print("MpvProperty.pause: \(value)")
            if let isPaused = value as? Bool {
                let state = isPaused ? "Paused" : "Playing"
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
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
        // Ensure everything completes before cleanup
        playerController?.mpvQueue.sync {}

        // Stop playback
        stop()

        // Break reference cycles
        coordinator?.player = nil
        coordinator?.onPropertyChange = nil
        playerController?.delegate = nil

        // Remove from view hierarchy
        hostingController?.view.removeFromSuperview()
        hostingController = nil
        coordinator = nil
        playerController = nil
    }

    deinit {
        cleanup()
    }
}

// MARK: - SwiftUI Wrapper
struct MpvMetalPlayerView: UIViewControllerRepresentable {
    @ObservedObject var coordinator: Coordinator
    let existingController: MpvMetalViewController

    init(coordinator: Coordinator, existingController: MpvMetalViewController) {
        self.coordinator = coordinator
        self.existingController = existingController
    }

    func makeUIViewController(context: Context) -> UIViewController {
        return existingController
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        // Updates if needed
    }

    func makeCoordinator() -> Coordinator {
        coordinator
    }

    // Method for playing media
    func play(_ url: URL) -> Self {
        coordinator.playUrl = url
        return self
    }

    // Method for handling property changes
    func onPropertyChange(_ handler: @escaping (MpvMetalViewController, String, Any?) -> Void)
        -> Self
    {
        coordinator.onPropertyChange = handler
        return self
    }

    @MainActor
    final class Coordinator: MpvPlayerDelegate, ObservableObject {
        weak var player: MpvMetalViewController?
        var playUrl: URL?
        var onPropertyChange: ((MpvMetalViewController, String, Any?) -> Void)?

        func play(_ url: URL) {
            player?.loadFile(url)
        }

        func propertyChanged(mpv: OpaquePointer, propertyName: String, value: Any?) {
            guard let player = player else { return }
            onPropertyChange?(player, propertyName, value)
        }
    }
}

// MARK: - Player Controller
final class MpvMetalViewController: UIViewController {
    // MARK: - Properties

    var metalLayer = MetalLayer()
    var mpv: OpaquePointer?
    weak var delegate: MpvPlayerDelegate?
    let mpvQueue = DispatchQueue(label: "mpv.queue", qos: .userInitiated)

    private var isBeingDeallocated = false
    private var contextPointer: UnsafeMutableRawPointer?

    var playUrl: URL?

    var hdrAvailable: Bool {
        if #available(iOS 16.0, *) {
            let maxEDRRange = view.window?.screen.potentialEDRHeadroom ?? 1.0
            let sigPeak = getDouble(MpvProperty.videoParamsSigPeak)
            return maxEDRRange > 1.0 && sigPeak > 1.0
        } else {
            return false
        }
    }

    var hdrEnabled = false {
        didSet {
            guard let mpv = mpv else { return }

            if hdrEnabled {
                mpv_set_option_string(mpv, "target-colorspace-hint", "yes")
                metalLayer.setHDRContent(true)
            } else {
                mpv_set_option_string(mpv, "target-colorspace-hint", "no")
                metalLayer.setHDRContent(false)
            }
        }
    }

    // Add a new property to track shutdown state
    private var isShuttingDown = false
    private let syncQueue = DispatchQueue(label: "com.mpv.sync", qos: .userInitiated)

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()

        setupMetalLayer()
        setupMPV()

        if let url = playUrl {
            loadFile(url)
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        metalLayer.frame = view.bounds
    }

    deinit {
        // Use syncQueue to ensure thread safety during shutdown
        syncQueue.sync {
            // Mark as shutting down to prevent new callbacks from running
            isShuttingDown = true
            isBeingDeallocated = true

            // Make sure to handle this on the mpv queue
            mpvQueue.sync {
                // First remove the wakeup callback to prevent any new callbacks
                if let mpv = self.mpv {
                    mpv_set_wakeup_callback(mpv, nil, nil)
                }

                // Release the container
                if let contextPtr = contextPointer {
                    let container = Unmanaged<WeakContainer<MpvMetalViewController>>.fromOpaque(
                        contextPtr
                    ).takeUnretainedValue()
                    container.invalidate()
                    Unmanaged<WeakContainer<MpvMetalViewController>>.fromOpaque(contextPtr)
                        .release()
                    contextPointer = nil
                }

                // Terminate and destroy mpv as the final step
                if let mpv = self.mpv {
                    mpv_terminate_destroy(mpv)
                    self.mpv = nil
                }
            }
        }
    }

    // MARK: - Setup

    private func setupMetalLayer() {
        metalLayer.frame = view.bounds
        metalLayer.contentsScale = UIScreen.main.nativeScale
        metalLayer.framebufferOnly = true
        metalLayer.backgroundColor = UIColor.black.cgColor

        view.layer.addSublayer(metalLayer)
    }

    private func setupMPV() {
        guard let mpvHandle = mpv_create() else {
            print("Failed to create MPV instance")
            return
        }

        mpv = mpvHandle

        // Configure mpv options
        #if DEBUG
            // mpv_request_log_messages(mpvHandle, "debug")
        #else
            mpv_request_log_messages(mpvHandle, "no")
        #endif

        mpv_set_option(mpvHandle, "wid", MPV_FORMAT_INT64, &metalLayer)
        mpv_set_option_string(mpvHandle, "subs-match-os-language", "yes")
        mpv_set_option_string(mpvHandle, "subs-fallback", "yes")
        mpv_set_option_string(mpvHandle, "vo", "gpu-next")
        mpv_set_option_string(mpvHandle, "gpu-api", "vulkan")
        mpv_set_option_string(mpvHandle, "hwdec", "videotoolbox")
        mpv_set_option_string(mpvHandle, "video-rotate", "no")
        mpv_set_option_string(mpvHandle, "ytdl", "no")

        // Initialize mpv
        let status = mpv_initialize(mpvHandle)
        if status < 0 {
            print("Failed to initialize MPV: \(String(cString: mpv_error_string(status)))")
            mpv_terminate_destroy(mpvHandle)
            mpv = nil
            return
        }

        // Observe properties
        mpv_observe_property(mpvHandle, 0, MpvProperty.videoParamsSigPeak, MPV_FORMAT_DOUBLE)
        mpv_observe_property(mpvHandle, 0, MpvProperty.pausedForCache, MPV_FORMAT_FLAG)
        mpv_observe_property(mpvHandle, 0, MpvProperty.timePosition, MPV_FORMAT_DOUBLE)
        mpv_observe_property(mpvHandle, 0, MpvProperty.duration, MPV_FORMAT_DOUBLE)
        mpv_observe_property(mpvHandle, 0, MpvProperty.pause, MPV_FORMAT_FLAG)

        // Set up weak reference for callback with improved safety
        let container = WeakContainer(value: self)
        contextPointer = Unmanaged.passRetained(container).toOpaque()

        // Set wakeup callback with safer checking
        mpv_set_wakeup_callback(
            mpvHandle,
            { pointer in
                guard let ptr = pointer else { return }

                // Get the container safely
                let container = Unmanaged<WeakContainer<MpvMetalViewController>>.fromOpaque(ptr)
                    .takeUnretainedValue()

                // Access the value with additional safety checks
                DispatchQueue.main.async {
                    if let controller = container.value {
                        if !controller.isBeingDeallocated {
                            controller.processEvents()
                        } else {
                            // If the controller is being deallocated, invalidate the container
                            container.invalidate()
                        }
                    }
                }
            }, contextPointer)
    }

    // MARK: - MPV Methods

    func loadFile(_ url: URL) {
        guard let mpv = mpv else { return }

        var args = [url.absoluteString, "replace"]
        command("loadfile", args: args)
    }

    func togglePause() {
        getFlag(MpvProperty.pause) ? play() : pause()
    }

    func play() {
        setFlag(MpvProperty.pause, false)
    }

    func pause() {
        print("Pausing")
        setFlag(MpvProperty.pause, true)
    }

    func getDouble(_ name: String) -> Double {
        guard let mpv = mpv else { return 0.0 }

        var data = 0.0
        mpv_get_property(mpv, name, MPV_FORMAT_DOUBLE, &data)
        return data
    }

    func getString(_ name: String) -> String? {
        guard let mpv = mpv else { return nil }

        guard let cString = mpv_get_property_string(mpv, name) else { return nil }
        let string = String(cString: cString)
        mpv_free(UnsafeMutableRawPointer(mutating: cString))
        return string
    }

    func getFlag(_ name: String) -> Bool {
        guard let mpv = mpv else { return false }

        var data: Int64 = 0
        mpv_get_property(mpv, name, MPV_FORMAT_FLAG, &data)
        return data > 0
    }

    func setFlag(_ name: String, _ value: Bool) {
        guard let mpv = mpv else { return }

        var data: Int = value ? 1 : 0
        print("Setting flag \(name) to \(value)")
        mpv_set_property(mpv, name, MPV_FORMAT_FLAG, &data)
    }

    func command(
        _ command: String,
        args: [String] = [],
        checkErrors: Bool = true,
        completion: ((Int32) -> Void)? = nil
    ) {
        guard let mpv = mpv else {
            completion?(-1)
            return
        }

        // Create the C-style command array manually with the correct type
        let cStrings = [command] + args

        // Create array of C string pointers with the correct type
        let count = cStrings.count
        let cArray = UnsafeMutablePointer<UnsafePointer<CChar>?>.allocate(capacity: count + 1)

        // Fill the array
        for i in 0..<count {
            let cString = (cStrings[i] as NSString).utf8String
            cArray[i] = cString
        }

        // Set last element to nil
        cArray[count] = nil

        // Execute the command with the properly typed array
        let status = mpv_command(mpv, cArray)

        // Clean up
        cArray.deallocate()

        if checkErrors && status < 0 {
            print("MPV command error: \(String(cString: mpv_error_string(status)))")
        }

        completion?(status)
    }

    // MARK: - Event Processing

    private func processEvents() {
        // Check shutdown state first before proceeding
        if syncQueue.sync(execute: { isShuttingDown }) {
            return
        }

        mpvQueue.async { [weak self] in
            guard let self = self,
                let mpv = self.mpv,
                !self.isBeingDeallocated,
                !self.syncQueue.sync(execute: { self.isShuttingDown })
            else {
                return
            }

            while self.mpv != nil && !self.isBeingDeallocated
                && !self.syncQueue.sync(execute: { self.isShuttingDown })
            {
                guard let event = mpv_wait_event(mpv, 0) else { break }
                if event.pointee.event_id == MPV_EVENT_NONE { break }

                self.handleEvent(event)
            }
        }
    }

    private func handleEvent(_ event: UnsafePointer<mpv_event>) {
        // Exit early if we're shutting down
        if syncQueue.sync(execute: { isShuttingDown }) || isBeingDeallocated {
            return
        }

        guard let mpv = mpv else { return }

        switch event.pointee.event_id {
        case MPV_EVENT_PROPERTY_CHANGE:
            guard let propertyData = event.pointee.data else { break }
            let property = UnsafePointer<mpv_event_property>(OpaquePointer(propertyData)).pointee
            let propertyName = String(cString: property.name)

            var value: Any?

            switch propertyName {
            case MpvProperty.pausedForCache, MpvProperty.pause:
                if let data = property.data,
                    let boolValue = UnsafePointer<Bool>(OpaquePointer(data))?.pointee
                {
                    value = boolValue
                }

            case MpvProperty.timePosition, MpvProperty.duration:
                if let data = property.data,
                    let doubleValue = UnsafePointer<Double>(OpaquePointer(data))?.pointee
                {
                    value = doubleValue
                }

            default:
                break
            }

            // Notify delegate on main thread
            if let value = value {
                DispatchQueue.main.async { [weak self] in
                    guard let self = self, !self.isBeingDeallocated else { return }
                    self.delegate?.propertyChanged(
                        mpv: mpv, propertyName: propertyName, value: value)
                }
            }

        case MPV_EVENT_SHUTDOWN:
            print("MPV shutdown event received")
            mpvQueue.async { [weak self] in
                guard let self = self, self.mpv != nil else { return }
                mpv_terminate_destroy(self.mpv)
                self.mpv = nil
            }
        case MPV_EVENT_LOG_MESSAGE:
            return
        default:
            if let eventName = mpv_event_name(event.pointee.event_id) {
                print("MPV event: \(String(cString: eventName))")
            }
        }
    }
}

// MARK: - Improved WeakContainer
class WeakContainer<T: AnyObject> {
    private weak var _value: T?
    private var _isValid = true

    var value: T? {
        guard _isValid else { return nil }
        return _value
    }

    func invalidate() {
        _isValid = false
        _value = nil
    }

    init(value: T) {
        self._value = value
    }
}
