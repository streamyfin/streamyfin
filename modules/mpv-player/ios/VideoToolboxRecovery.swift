import Foundation

/// Retry a decoder that already worked for this file when iOS makes video
/// visible again. mpv can publish the software fallback after the wake event.
struct VideoToolboxRecovery {
    enum Wake {
        case pictureInPicture
        case foreground
    }

    /// Time for mpv to finish switching decoders after playback can advance.
    private static let fallbackWindow: TimeInterval = 3

    private var hasUsedVideoToolbox = false
    // A nil deadline holds the wake while the user has playback paused.
    private var pendingWake: (context: Wake, deadline: TimeInterval?)?
    private var attemptedWake: Wake?

    mutating func observe(active: String?) {
        if Self.isVideoToolbox(active) {
            hasUsedVideoToolbox = true
            attemptedWake = nil
        }
    }

    mutating func wake(_ context: Wake, at now: TimeInterval, paused: Bool = false) {
        guard hasUsedVideoToolbox, canRetry(in: context) else { return }
        pendingWake = (context, paused ? nil : now + Self.fallbackWindow)
    }

    mutating func cancelWake(_ context: Wake? = nil) {
        if context == nil || pendingWake?.context == context {
            pendingWake = nil
        }
    }

    mutating func playbackPauseChanged(_ paused: Bool, at now: TimeInterval) {
        guard let wake = pendingWake else { return }
        if paused, let deadline = wake.deadline {
            pendingWake = now <= deadline ? (wake.context, nil) : nil
        } else if !paused, wake.deadline == nil {
            pendingWake = (wake.context, now + Self.fallbackWindow)
        }
    }

    mutating func displayResetStarted(at now: TimeInterval) {
        guard let wake = pendingWake else { return }
        if wake.deadline.map({ now <= $0 }) ?? true {
            attemptedWake = wake.context
        }
        pendingWake = nil
    }

    mutating func retryMode(
        requested: String?, active: String?, deinterlacing: Bool = false, at now: TimeInterval
    ) -> String? {
        guard let wake = pendingWake, let deadline = wake.deadline, now <= deadline,
              active == "no", let requested, Self.isVideoToolbox(requested)
        else { return nil }

        pendingWake = nil
        attemptedWake = wake.context
        return VideoDeinterlace.hwdecForReset(requested, filterOn: deinterlacing)
    }

    private func canRetry(in context: Wake) -> Bool {
        // A background attempt can run before hardware becomes available.
        attemptedWake == nil || (attemptedWake == .pictureInPicture && context == .foreground)
    }

    private static func isVideoToolbox(_ mode: String?) -> Bool {
        mode == VideoDeinterlace.zeroCopyHwdec || mode == VideoDeinterlace.copyHwdec
    }
}
