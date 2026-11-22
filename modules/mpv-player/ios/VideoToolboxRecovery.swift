import Foundation

/// Retry a decoder that already worked for this file when iOS makes video
/// visible again. mpv can publish the software fallback after the wake event.
struct VideoToolboxRecovery {
    enum Wake {
        case pictureInPicture
        case foreground
    }

    /// Time for mpv to finish switching decoders and produce a software frame.
    private static let fallbackWindow: TimeInterval = 3

    private var hasUsedVideoToolbox = false
    private var pendingWake: (context: Wake, deadline: TimeInterval)?
    private var attemptedWake: Wake?

    mutating func observe(active: String?) {
        if Self.isVideoToolbox(active) {
            hasUsedVideoToolbox = true
            attemptedWake = nil
        }
    }

    mutating func wake(_ context: Wake, at now: TimeInterval) {
        guard hasUsedVideoToolbox, canRetry(in: context) else { return }
        pendingWake = (context, now + Self.fallbackWindow)
    }

    mutating func cancelWake() {
        pendingWake = nil
    }

    mutating func shouldRetry(requested: String?, active: String?, at now: TimeInterval) -> Bool {
        guard let wake = pendingWake,
              now <= wake.deadline,
              active == "no", Self.isVideoToolbox(requested)
        else { return false }

        pendingWake = nil
        attemptedWake = wake.context
        return true
    }

    private func canRetry(in context: Wake) -> Bool {
        // A background attempt can run before hardware becomes available.
        attemptedWake == nil || (attemptedWake == .pictureInPicture && context == .foreground)
    }

    private static func isVideoToolbox(_ mode: String?) -> Bool {
        mode == VideoDeinterlace.zeroCopyHwdec || mode == VideoDeinterlace.copyHwdec
    }
}
