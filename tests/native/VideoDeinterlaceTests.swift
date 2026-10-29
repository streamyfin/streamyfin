import Foundation

@main
enum VideoDeinterlaceTests {
    static func expect(_ actual: Bool, _ expected: Bool, _ label: String) {
        precondition(actual == expected, "\(label): got \(actual), expected \(expected)")
    }

    static func expect(_ actual: String, _ expected: String, _ label: String) {
        precondition(actual == expected, "\(label): got \(actual), expected \(expected)")
    }

    static func main() {
        // NTSC and PAL standard definition are filtered.
        expect(VideoDeinterlace.isEligible(height: 480), true, "NTSC")
        expect(VideoDeinterlace.isEligible(height: 576), true, "PAL")
        // The next step up is not, and neither is anything larger.
        expect(VideoDeinterlace.isEligible(height: 577), false, "just above PAL")
        expect(VideoDeinterlace.isEligible(height: 720), false, "720p")
        expect(VideoDeinterlace.isEligible(height: 2160), false, "4K")
        // No picture yet, or a bad value, never selects the filter.
        expect(VideoDeinterlace.isEligible(height: 0), false, "no height")
        expect(VideoDeinterlace.isEligible(height: -1), false, "negative height")

        // VideoToolbox switches to its copying variant for standard definition only.
        expect(VideoDeinterlace.hwdec(forHeight: 480, configured: "videotoolbox"),
               "videotoolbox-copy", "SD on VideoToolbox")
        expect(VideoDeinterlace.hwdec(forHeight: 1080, configured: "videotoolbox"),
               "videotoolbox", "HD keeps zero-copy")
        // Software decoding (the simulator) is left alone, and so is a mode we do not know.
        expect(VideoDeinterlace.hwdec(forHeight: 480, configured: "no"), "no", "software decoding")
        expect(VideoDeinterlace.hwdec(forHeight: 480, configured: "videotoolbox-copy"),
               "videotoolbox-copy", "already copying")

        print("VideoDeinterlaceTests passed")
    }
}
