import Foundation

/// Decides when the iOS player runs a deinterlacing filter, independent of mpv.
///
/// The avfoundation video output draws what the decoder hands it, so mpv's own
/// `deinterlace` does nothing here and interlaced video shows combing. A filter
/// needs software frames, which means leaving the zero-copy VideoToolbox path.
/// That copy is cheap for standard definition and costly for 4K or HDR, so only
/// standard definition video takes it. The filter itself only touches frames
/// flagged interlaced, so progressive standard definition video is unchanged.
enum VideoDeinterlace {
    /// The tallest picture, in lines, that gets the filter. 576 is PAL.
    static let maxHeight = 576

    /// Keeps frames that are not flagged interlaced as they are.
    static let filter = "lavfi=[bwdif=mode=send_frame:deint=interlaced]"

    /// The decoder mode that lets software filters see the frames.
    static let copyHwdec = "videotoolbox-copy"

    static func isEligible(height: Int) -> Bool {
        height > 0 && height <= maxHeight
    }

    /// The decoder to use for a picture of this height, given the one the
    /// renderer was configured with. Software decoding stays as it is, and
    /// only VideoToolbox is switched to its copying variant.
    static func hwdec(forHeight height: Int, configured: String) -> String {
        guard configured == "videotoolbox", isEligible(height: height) else { return configured }
        return copyHwdec
    }
}
