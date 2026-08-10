import AVKit
import AVFoundation

protocol PiPControllerDelegate: AnyObject {
    func pipController(_ controller: PiPController, willStartPictureInPicture: Bool)
    func pipController(_ controller: PiPController, didStartPictureInPicture: Bool)
    func pipController(_ controller: PiPController, willStopPictureInPicture: Bool)
    func pipController(_ controller: PiPController, didStopPictureInPicture: Bool)
    func pipController(_ controller: PiPController, restoreUserInterfaceForPictureInPictureStop completionHandler: @escaping (Bool) -> Void)
    func pipControllerPlay(_ controller: PiPController)
    func pipControllerPause(_ controller: PiPController)
    func pipController(_ controller: PiPController, skipByInterval interval: CMTime)
    func pipControllerIsPlaying(_ controller: PiPController) -> Bool
    func pipControllerDuration(_ controller: PiPController) -> Double
    func pipControllerCurrentPosition(_ controller: PiPController) -> Double
}

final class PiPController: NSObject {
    private static weak var automaticStartOwner: PiPController?

    private var pipController: AVPictureInPictureController?
    private weak var sampleBufferDisplayLayer: AVSampleBufferDisplayLayer?
    
    weak var delegate: PiPControllerDelegate?
    
    // Timebase for PiP progress tracking
    private var timebase: CMTimebase?
    
    // Track current time for PiP progress
    private var currentTime: CMTime = .zero
    private var currentDuration: Double = 0
    
    var isPictureInPictureSupported: Bool {
        return AVPictureInPictureController.isPictureInPictureSupported()
    }
    
    var isPictureInPictureActive: Bool {
        return pipController?.isPictureInPictureActive ?? false
    }
    
    var isPictureInPicturePossible: Bool {
        return pipController?.isPictureInPicturePossible ?? false
    }
    
    init(sampleBufferDisplayLayer: AVSampleBufferDisplayLayer) {
        self.sampleBufferDisplayLayer = sampleBufferDisplayLayer
        super.init()
        setupTimebase()
        setupPictureInPicture()
    }
    
    private func setupTimebase() {
        // Create a timebase for tracking playback time
        var newTimebase: CMTimebase?
        let status = CMTimebaseCreateWithSourceClock(
            allocator: kCFAllocatorDefault,
            sourceClock: CMClockGetHostTimeClock(),
            timebaseOut: &newTimebase
        )
        
        if status == noErr, let tb = newTimebase {
            timebase = tb
            CMTimebaseSetTime(tb, time: .zero)
            CMTimebaseSetRate(tb, rate: 0) // Start paused
            
            // Set the control timebase on the display layer
            sampleBufferDisplayLayer?.controlTimebase = tb
        }
    }
    
    private func setupPictureInPicture() {
        guard isPictureInPictureSupported else {
            Logger.shared.log(
                "PiP: setup skipped — AVPictureInPictureController.isPictureInPictureSupported() == false",
                type: "Warn")
            return
        }
        guard let displayLayer = sampleBufferDisplayLayer else {
            Logger.shared.log("PiP: setup skipped — no sample buffer display layer", type: "Warn")
            return
        }

        let contentSource = AVPictureInPictureController.ContentSource(
            sampleBufferDisplayLayer: displayLayer,
            playbackDelegate: self
        )
        
        pipController = AVPictureInPictureController(contentSource: contentSource)
        pipController?.delegate = self
        pipController?.requiresLinearPlayback = false
        Logger.shared.log(
            "PiP: controller created (possible=\(pipController?.isPictureInPicturePossible ?? false))",
            type: "Info")
    }

    /// Enable/disable auto-PiP ("swipe up while playing").
    ///
    /// Arming transfers eligibility from the outgoing controller and also
    /// re-arms a reused controller. This keeps source changes independent of
    /// which UI path initiated them.
    func setAutoStartEnabled(_ enabled: Bool) {
        #if !os(tvOS)
        guard let pipController else { return }
        if enabled {
            Self.automaticStartOwner?.pipController?.canStartPictureInPictureAutomaticallyFromInline = false
            Self.automaticStartOwner = self
        } else if Self.automaticStartOwner === self {
            Self.automaticStartOwner = nil
        }
        pipController.canStartPictureInPictureAutomaticallyFromInline = enabled
        #endif
    }

    func startPictureInPicture() {
        guard let pipController = pipController else {
            Logger.shared.log("PiP: start refused — controller was never created", type: "Error")
            return
        }
        Logger.shared.log(
            "PiP: start requested — supported=\(isPictureInPictureSupported) "
                + "possible=\(pipController.isPictureInPicturePossible) "
                + "active=\(pipController.isPictureInPictureActive) "
                + "layerReady=\(sampleBufferDisplayLayer?.isReadyForMoreMediaData ?? false) "
                + "hasTimebase=\(sampleBufferDisplayLayer?.controlTimebase != nil)",
            type: "Info")
        // The silent one: AVKit only lets PiP begin once it considers the
        // source eligible, and there is no callback for "never became
        // possible" — so log the refusal rather than returning into the void.
        guard pipController.isPictureInPicturePossible else {
            Logger.shared.log(
                "PiP: start aborted — isPictureInPicturePossible == false", type: "Error")
            return
        }

        pipController.startPictureInPicture()
    }
    
    func stopPictureInPicture() {
        pipController?.stopPictureInPicture()
    }
    
    func invalidate() {
        if Thread.isMainThread {
            pipController?.invalidatePlaybackState()
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.pipController?.invalidatePlaybackState()
            }
        }
    }
    
    func updatePlaybackState() {
        // Only invalidate when PiP is active to avoid "no context menu visible" warnings
        guard isPictureInPictureActive else { return }
        
        if Thread.isMainThread {
            pipController?.invalidatePlaybackState()
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.pipController?.invalidatePlaybackState()
            }
        }
    }
    
    /// Updates the current playback time for PiP progress display
    func setCurrentTime(_ time: CMTime) {
        currentTime = time
        
        // Update the timebase to reflect current position
        if let tb = timebase {
            CMTimebaseSetTime(tb, time: time)
        }
        
        // Only invalidate when PiP is active to avoid unnecessary updates
        if isPictureInPictureActive {
            updatePlaybackState()
        }
    }
    
    /// Updates the current playback time from seconds
    func setCurrentTimeFromSeconds(_ seconds: Double, duration: Double) {
        guard seconds >= 0 else { return }
        currentDuration = duration
        let time = CMTime(seconds: seconds, preferredTimescale: 1000)
        setCurrentTime(time)
    }
    
    /// Updates the playback rate on the timebase (1.0 = playing, 0.0 = paused)
    func setPlaybackRate(_ rate: Float) {
        if let tb = timebase {
            CMTimebaseSetRate(tb, rate: Float64(rate))
        }
    }
    
    deinit {
        if let tb = timebase {
            CMTimebaseSetRate(tb, rate: 0)
        }
        sampleBufferDisplayLayer?.controlTimebase = nil
        timebase = nil
        pipController?.delegate = nil
        pipController = nil
    }
}

// MARK: - AVPictureInPictureControllerDelegate

extension PiPController: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        delegate?.pipController(self, willStartPictureInPicture: true)
    }
    
    func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        delegate?.pipController(self, didStartPictureInPicture: true)
    }
    
    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
        Logger.shared.log("PiP: failed to start — \(error.localizedDescription)", type: "Error")
        delegate?.pipController(self, didStartPictureInPicture: false)
    }
    
    func pictureInPictureControllerWillStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        delegate?.pipController(self, willStopPictureInPicture: true)
    }
    
    func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        delegate?.pipController(self, didStopPictureInPicture: true)
    }
    
    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
        delegate?.pipController(self, restoreUserInterfaceForPictureInPictureStop: completionHandler)
    }
}

// MARK: - AVPictureInPictureSampleBufferPlaybackDelegate

extension PiPController: AVPictureInPictureSampleBufferPlaybackDelegate {
    
    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, setPlaying playing: Bool) {
        if playing {
            delegate?.pipControllerPlay(self)
        } else {
            delegate?.pipControllerPause(self)
        }
    }
    
    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, didTransitionToRenderSize newRenderSize: CMVideoDimensions) {
    }
    
    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, skipByInterval skipInterval: CMTime, completion completionHandler: @escaping () -> Void) {
        delegate?.pipController(self, skipByInterval: skipInterval)
        completionHandler()
    }
    
    var isPlaying: Bool {
        return delegate?.pipControllerIsPlaying(self) ?? false
    }
    
    var timeRangeForPlayback: CMTimeRange {
        let duration = delegate?.pipControllerDuration(self) ?? 0
        if duration > 0 {
            let cmDuration = CMTime(seconds: duration, preferredTimescale: 1000)
            return CMTimeRange(start: .zero, duration: cmDuration)
        }
        return CMTimeRange(start: .zero, duration: .positiveInfinity)
    }
    
    func pictureInPictureControllerTimeRangeForPlayback(_ pictureInPictureController: AVPictureInPictureController) -> CMTimeRange {
        return timeRangeForPlayback
    }
    
    func pictureInPictureControllerIsPlaybackPaused(_ pictureInPictureController: AVPictureInPictureController) -> Bool {
        return !isPlaying
    }
    
    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, setPlaying playing: Bool, completion: @escaping () -> Void) {
        if playing {
            delegate?.pipControllerPlay(self)
        } else {
            delegate?.pipControllerPause(self)
        }
        completion()
    }
}