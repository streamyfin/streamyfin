import Foundation

/// Decides when the iOS player runs a deinterlacing filter, independent of mpv.
///
/// The avfoundation video output draws what the decoder hands it, so mpv's own
/// `deinterlace` does nothing here and interlaced video shows combing. The filter
/// itself needs software frames. VideoToolbox frames only reach it through its
/// copying variant, which is cheap for standard definition and costly for 4K or
/// HDR, so only standard definition video takes it. The filter only touches
/// frames flagged interlaced, so progressive standard definition video is unchanged.
enum VideoDeinterlace {
    /// The tallest picture, in lines, that gets the filter. 576 is PAL.
    static let maxHeight = 576

    /// Keeps frames that are not flagged interlaced as they are.
    static let filter = "lavfi=[bwdif=mode=send_frame:deint=interlaced]"

    static let zeroCopyHwdec = "videotoolbox"

    /// The decoder mode that lets software filters see VideoToolbox frames.
    static let copyHwdec = "videotoolbox-copy"

    static func isEligible(height: Int) -> Bool {
        height > 0 && height <= maxHeight
    }

    struct Plan: Equatable {
        /// Whether the filter should be installed.
        var filterOn: Bool
        /// The decoder mode to switch to, or nil to leave the decoder alone.
        var hwdec: String?
    }

    /// What to do for a picture of this height.
    ///
    /// `configured` is the decoder the renderer asked for, and `active` is the one
    /// mpv is using now (`hwdec-current`). They differ when VideoToolbox cannot
    /// take a stream and mpv falls back to software, which already hands the
    /// filter software frames, so there is nothing to switch.
    static func plan(height: Int, configured: String, active: String?) -> Plan {
        let eligible = isEligible(height: height)
        // The filter does not depend on the decoder: software frames work as they are.
        var plan = Plan(filterOn: eligible, hwdec: nil)
        // Only VideoToolbox needs to switch between zero-copy and copying.
        guard configured == zeroCopyHwdec else { return plan }

        if eligible, active == zeroCopyHwdec {
            plan.hwdec = copyHwdec
        } else if !eligible, active == copyHwdec {
            plan.hwdec = zeroCopyHwdec
        }
        return plan
    }
}
