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

        print("Setting up direct MPV view")

        // Create player controller
        let controller = MpvMetalViewController()

        // Configure player delegate
        controller.delegate = self
        playerController = controller

        // Add the controller's view to our view hierarchy
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        controller.view.backgroundColor = .clear

        addSubview(controller.view)
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: topAnchor),
            controller.view.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
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
                self.playerController?.loadFile(url)

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
        print("isPaused: \(playerController?.getFlag(MpvProperty.pause) ?? true)")
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
        guard playerController != nil else { return }

        // First stop playback
        stop()

        // Break reference cycles
        playerController?.delegate = nil

        // Remove from view hierarchy
        playerController?.view.removeFromSuperview()

        // Release references
        playerController = nil
    }

    deinit {
        cleanup()
    }

    // Reset the player when experiencing black screen or other issues
    func resetPlayer() {
        // Store current source
        let currentSource = source

        // Clean up existing player
        cleanup()

        // Create a new player
        setupView()

        // If we had a source, reload it
        if let source = currentSource {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.setSource(source)
            }
        }
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
    func propertyChanged(mpv: OpaquePointer, propertyName: String, value: Any?) {
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
        // Flag that we're being deinitialized to prevent new callbacks
        isBeingDeallocated = true

        // Remove the wakeup callback first to prevent any new callbacks
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
            // Unobserve all properties
            mpv_unobserve_property(mpv, 0)
            mpv_terminate_destroy(mpv)
            self.mpv = nil
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

        // Force a proper window setup to prevent black screens
        mpv_set_option_string(mpvHandle, "force-window", "yes")
        mpv_set_option_string(mpvHandle, "reset-on-next-file", "all")

        // Set rendering options
        mpv_set_option(mpvHandle, "wid", MPV_FORMAT_INT64, &metalLayer)
        mpv_set_option_string(mpvHandle, "vo", "gpu-next")
        mpv_set_option_string(mpvHandle, "gpu-api", "vulkan")
        mpv_set_option_string(mpvHandle, "gpu-context", "auto")
        mpv_set_option_string(mpvHandle, "hwdec", "videotoolbox")

        // Set subtitle options
        mpv_set_option_string(mpvHandle, "subs-match-os-language", "yes")
        mpv_set_option_string(mpvHandle, "subs-fallback", "yes")

        // Set video options
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

        // Set up weak reference for callback
        let container = WeakContainer(value: self)
        contextPointer = Unmanaged.passRetained(container).toOpaque()

        // Set wakeup callback
        mpv_set_wakeup_callback(
            mpvHandle,
            { pointer in
                guard let ptr = pointer else { return }
                let container = Unmanaged<WeakContainer<MpvMetalViewController>>.fromOpaque(ptr)
                    .takeUnretainedValue()

                DispatchQueue.main.async {
                    if let controller = container.value, !controller.isBeingDeallocated {
                        controller.processEvents()
                    }
                }
            }, contextPointer)
    }

    // MARK: - MPV Methods

    func loadFile(_ url: URL) {
        guard let mpv = mpv else { return }

        print("Loading file: \(url.absoluteString)")

        var args = [url.absoluteString, "replace"]
        command("loadfile", args: args)
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

    func getNode(_ name: String) -> String? {
        guard let mpv = mpv else { return nil }

        guard let cString = mpv_get_property_string(mpv, name) else { return nil }
        let string = String(cString: cString)
        mpv_free(UnsafeMutableRawPointer(mutating: cString))
        return string
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
        // Exit if we're being deallocated
        if isBeingDeallocated {
            return
        }

        guard let mpv = mpv else { return }

        // Process a limited number of events to avoid infinite loops
        let maxEvents = 10
        var eventCount = 0

        while !isBeingDeallocated && eventCount < maxEvents {
            guard let event = mpv_wait_event(mpv, 0) else { break }
            if event.pointee.event_id == MPV_EVENT_NONE { break }

            handleEvent(event)
            eventCount += 1
        }
    }

    private func handleEvent(_ event: UnsafePointer<mpv_event>) {
        // Exit early if we're being deallocated
        if isBeingDeallocated {
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
            // Let the deinit handle cleanup - just mark as deallocating
            isBeingDeallocated = true

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
