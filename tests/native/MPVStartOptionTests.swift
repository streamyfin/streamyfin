import Foundation

/// mpv's start option for a load. A live stream cannot seek: start=0 is a
/// seek to its first timestamp ("Cannot seek in this stream" on every
/// channel), and a resume point from a bitrate change left the player
/// waiting for the restarted transcode to get there.
@main
enum MPVStartOptionTests {
    static func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
        precondition(condition, message())
    }

    static func main() {
        expect(mpvStartOption(startPosition: nil, isLive: true) == "none", "a channel opens where it airs")
        expect(mpvStartOption(startPosition: 0, isLive: true) == "none", "a channel at 0 still gets no start")
        expect(
            mpvStartOption(startPosition: 56, isLive: true) == "none",
            "a channel renegotiated at 56 s gets no start, gave \(mpvStartOption(startPosition: 56, isLive: true))"
        )
        expect(mpvStartOption(startPosition: nil, isLive: false) == "0", "a film without a resume point starts at 0")
        expect(mpvStartOption(startPosition: 0, isLive: false) == "0", "a film at 0 starts at 0")
        expect(mpvStartOption(startPosition: 90.5, isLive: false) == "90.50", "a film resumes at its position")
        print("MPVStartOption tests passed")
    }
}
