import Foundation

@main
enum VideoDeinterlaceTests {
    typealias Plan = VideoDeinterlace.Plan

    static func expect(_ actual: Bool, _ expected: Bool, _ label: String) {
        precondition(actual == expected, "\(label): got \(actual), expected \(expected)")
    }

    static func expect(_ actual: Plan, _ expected: Plan, _ label: String) {
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

        let vt = VideoDeinterlace.zeroCopyHwdec
        let copy = VideoDeinterlace.copyHwdec

        // Standard definition on VideoToolbox: filter on, and leave zero-copy for the copying mode.
        expect(VideoDeinterlace.plan(height: 480, configured: vt, active: vt),
               Plan(filterOn: true, hwdec: copy), "SD on VideoToolbox")
        // Already copying: nothing more to do, so the switch cannot loop.
        expect(VideoDeinterlace.plan(height: 480, configured: vt, active: copy),
               Plan(filterOn: true, hwdec: nil), "SD already copying")
        // VideoToolbox could not take the stream and mpv fell back to software (MPEG-2, some
        // interlaced H.264): software frames reach the filter, so keep the decoder as it is.
        expect(VideoDeinterlace.plan(height: 480, configured: vt, active: "no"),
               Plan(filterOn: true, hwdec: nil), "SD fell back to software")
        // The active decoder is not known yet: filter on, no decoder switch.
        expect(VideoDeinterlace.plan(height: 480, configured: vt, active: nil),
               Plan(filterOn: true, hwdec: nil), "SD decoder not known")

        // Software decoding by configuration (the simulator): the filter still goes on.
        expect(VideoDeinterlace.plan(height: 480, configured: "no", active: "no"),
               Plan(filterOn: true, hwdec: nil), "SD software by configuration")
        expect(VideoDeinterlace.plan(height: 1080, configured: "no", active: "no"),
               Plan(filterOn: false, hwdec: nil), "HD software by configuration")

        // Larger video stays zero-copy and gets no filter.
        expect(VideoDeinterlace.plan(height: 1080, configured: vt, active: vt),
               Plan(filterOn: false, hwdec: nil), "HD stays zero-copy")
        expect(VideoDeinterlace.plan(height: 2160, configured: vt, active: vt),
               Plan(filterOn: false, hwdec: nil), "4K stays zero-copy")
        // Moving from a copying standard definition file to an HD one restores zero-copy.
        expect(VideoDeinterlace.plan(height: 1080, configured: vt, active: copy),
               Plan(filterOn: false, hwdec: vt), "HD after SD")

        print("VideoDeinterlaceTests passed")
    }
}
