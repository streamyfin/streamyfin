import CoreGraphics
import Foundation

@main
enum SubtitleLayoutTests {
    static func near(_ actual: Double, _ expected: Double) {
        precondition(abs(actual - expected) < 0.000001, "\(actual) != \(expected)")
    }

    static func main() {
        let style = SubtitleLayout(scale: 1.3, position: 100, marginX: 25, marginY: 30)
        let cases: [(CGSize, CGSize)] = [
            (CGSize(width: 1920, height: 800), CGSize(width: 852, height: 393)),
            (CGSize(width: 1920, height: 1080), CGSize(width: 852, height: 393)),
            (CGSize(width: 1440, height: 1080), CGSize(width: 1920, height: 1080)),
            (CGSize(width: 1920, height: 800), CGSize(width: 393, height: 852)),
            (CGSize(width: 1080, height: 1920), CGSize(width: 852, height: 393)),
        ]
        for (video, viewport) in cases {
            let fit = min(viewport.width / video.width, viewport.height / video.height)
            let fill = max(viewport.width / video.width, viewport.height / video.height)
            let canvas = CGSize(width: video.width * fill, height: video.height * fill)
            let fitted = CGSize(width: video.width * fit, height: video.height * fit)
            // Exercise both source-sized composites and display-sized overlays.
            for reference in [fitted, viewport] {
                let result = style.fitting(canvas: canvas, viewport: viewport, reference: reference)
                let cropX = (canvas.width - viewport.width) / 2
                let cropY = (canvas.height - viewport.height) / 2
                near(result.scale * canvas.height, style.scale * reference.height)
                near(result.marginX / 960 * canvas.width - cropX, style.marginX / 960 * reference.width)
                // Project libass's bottom anchor back through the video crop.
                let margin = result.marginY / 720 * canvas.height * result.scale
                let bottom = (canvas.height - margin) * result.position / 100 - cropY
                near(viewport.height - bottom, style.marginY / 720 * reference.height * style.scale)
                var topStyle = style
                topStyle.alignmentY = "top"
                let top = topStyle.fitting(canvas: canvas, viewport: viewport, reference: reference)
                near(top.marginY / 720 * canvas.height * top.scale - cropY,
                     style.marginY / 720 * reference.height * style.scale)
                // A subsequent fit or PiP layout must restore the saved style.
                let restored = style.fitting(canvas: viewport, viewport: viewport, reference: viewport)
                near(restored.scale, style.scale)
                near(restored.position, style.position)
                near(restored.marginX, style.marginX)
                near(restored.marginY, style.marginY)
            }
        }
        let centered = SubtitleLayout(position: 50).fitting(
            canvas: CGSize(width: 1000, height: 2000),
            viewport: CGSize(width: 1000, height: 1000),
            reference: CGSize(width: 1000, height: 1000)
        )
        near(centered.position, 50)
        let unknown = style.fitting(canvas: .zero, viewport: .zero, reference: .zero)
        near(unknown.scale, style.scale)
        near(unknown.position, style.position)
        testASSMargins()
        print("PASS: subtitle font size, visible margins, wrapping bounds and fit restoration for both canvas types")
    }

    static func testASSMargins() {
        let header = try! String(contentsOfFile: "tests/native/Fixtures/viewport.ass", encoding: .utf8)
        let ass = ASSSubtitleLayout(extradata: header)!
        precondition(ass.resolution == CGSize(width: 1920, height: 1080))
        precondition(ass.styles.count == 2)
        // 4:3 video filling a 16:9 screen: 180px cropped at top and bottom.
        let canvas = CGSize(width: 1920, height: 1440)
        let viewport = CGSize(width: 1920, height: 1080)
        let reference = CGSize(width: 1440, height: 1080)
        let overrides = ass.overrides(canvas: canvas, viewport: viewport, reference: reference, position: 100)
        precondition(overrides == ["Dialogue.MarginL=60", "Dialogue.MarginR=90", "Dialogue.MarginV=36",
                                   "Top.MarginL=30", "Top.MarginR=45", "Top.MarginV=153"])
        // Project ASS's authored (unscaled) margins through crop and sub-pos.
        let mappedPosition = 87.5
        let bottom = (1440.0 - 36.0 / 1080 * 1440) * mappedPosition / 100 - 180
        near(1080 - bottom, 42)
        near(153.0 / 1080 * 1440 - 180, 24)
        // Wide video in portrait: text must wrap within the visible sides.
        let portrait = ass.overrides(canvas: CGSize(width: 1920, height: 1080),
                                     viewport: CGSize(width: 480, height: 1080),
                                     reference: CGSize(width: 480, height: 270), position: 100)
        precondition(portrait.contains("Dialogue.MarginL=740"))
        precondition(portrait.contains("Dialogue.MarginR=750"))
        precondition(ass.overrides(canvas: viewport, viewport: viewport, reference: viewport, position: 100).isEmpty)
        precondition(ASSSubtitleLayout(extradata: header)!.overrides(
            canvas: canvas, viewport: viewport, reference: reference, position: 100) == overrides)
        precondition(ASSSubtitleLayout(extradata: "[Script Info]\nPlayResX: nan\n") == nil)
        print("PASS: ASS script-coordinate margins, top/bottom dialogue, wrapping and fit restoration")
    }
}
