import Foundation

/// The hardware keyboard in the native iOS player: what each key does for what
/// is on screen. The cases pin the review findings on #2344: a held arrow
/// seeking into the next episode while it loads, the subtitle size panel taking
/// the space bar although it is not modal, keys fighting a scrub, and
/// shortcuts with a modifier reaching the player.
@main
enum PlayerKeyboardPolicyTests {
    static func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
        precondition(condition, message())
    }

    static let idle = PlayerKeyboardState()

    static func with(_ change: (inout PlayerKeyboardState) -> Void) -> PlayerKeyboardState {
        var state = idle
        change(&state)
        return state
    }

    static func press(_ key: PlayerKey, modified: Bool = false, _ state: PlayerKeyboardState) -> PlayerKeyAction? {
        PlayerKeyboardPolicy.pressAction(for: key, modified: modified, in: state)
    }

    static func command(_ key: PlayerKey, _ state: PlayerKeyboardState) -> PlayerKeyAction? {
        PlayerKeyboardPolicy.commandAction(for: key, in: state)
    }

    static func registers(_ state: PlayerKeyboardState) -> Bool {
        PlayerKeyboardPolicy.registersArrowCommands(in: state)
    }

    static func main() {
        // Space
        expect(press(.space, idle) == .togglePlayPause, "space toggles playback")
        expect(press(.space, modified: true, idle) == nil, "a space with a modifier is a shortcut, not ours")
        expect(press(.space, with { $0.overlayOwnsInput = true }) == nil, "space goes to the overlay that owns the input")
        expect(
            press(.space, with { $0.subtitleScaleShown = true }) == .togglePlayPause,
            "the subtitle size panel is not modal: space still toggles, as the play button under it does"
        )
        expect(press(.space, with { $0.isScrubbing = true }) == nil, "space does not toggle under a scrub")
        expect(
            press(.space, with { $0.canSeek = false }) == .togglePlayPause,
            "space toggles while the stream loads, as the play button does"
        )
        expect(command(.space, idle) == nil, "space is never a key command: a held one would flip play and pause")

        // Arrow commands: registered with priority, they repeat while held
        expect(registers(idle), "the arrows are key commands")
        expect(!registers(with { $0.syncPlayActive = true }), "no repeating arrows in SyncPlay")
        expect(!registers(with { $0.overlayOwnsInput = true }), "an overlay keeps its arrows")
        expect(!registers(with { $0.subtitleScaleShown = true }), "the subtitle size slider keeps its arrows")
        expect(!registers(with { $0.isScrubbing = true }), "no arrow command under a scrub")
        expect(!registers(with { $0.canSeek = false }), "no arrow command while nothing can be seeked")

        expect(command(.leftArrow, idle) == .seekBackward, "left seeks back")
        expect(command(.rightArrow, idle) == .seekForward, "right seeks forward")
        // A repeat fires from the command the arrow went down with, so it is
        // checked again against the state of each repeat.
        expect(command(.rightArrow, with { $0.canSeek = false }) == nil, "a held arrow stops seeking when the next episode loads")
        expect(command(.rightArrow, with { $0.isScrubbing = true }) == nil, "a held arrow stops seeking under a scrub")
        expect(command(.rightArrow, with { $0.overlayOwnsInput = true }) == nil, "a held arrow stops seeking under an overlay")
        expect(command(.rightArrow, with { $0.subtitleScaleShown = true }) == nil, "a held arrow stops seeking under the size panel")
        expect(command(.rightArrow, with { $0.syncPlayActive = true }) == nil, "a held arrow stops repeating once SyncPlay starts")

        // Arrow presses: the SyncPlay path, one seek per press
        expect(press(.leftArrow, idle) == nil, "outside SyncPlay an arrow press is left to the key command")
        expect(press(.rightArrow, idle) == nil, "outside SyncPlay an arrow press is left to the key command")
        let syncPlay = with { $0.syncPlayActive = true }
        expect(press(.leftArrow, syncPlay) == .seekBackward, "in SyncPlay a left press seeks back once")
        expect(press(.rightArrow, syncPlay) == .seekForward, "in SyncPlay a right press seeks forward once")
        expect(press(.rightArrow, modified: true, syncPlay) == nil, "a modified arrow is a shortcut, not ours")
        expect(
            press(.rightArrow, with { $0.syncPlayActive = true; $0.canSeek = false }) == nil,
            "no SyncPlay seek request while nothing can be seeked"
        )
        expect(
            press(.rightArrow, with { $0.syncPlayActive = true; $0.subtitleScaleShown = true }) == nil,
            "the size slider keeps its arrows in SyncPlay too"
        )
        expect(
            press(.rightArrow, with { $0.syncPlayActive = true; $0.overlayOwnsInput = true }) == nil,
            "the SyncPlay queue sheet keeps its arrows"
        )
        expect(
            press(.rightArrow, with { $0.syncPlayActive = true; $0.isScrubbing = true }) == nil,
            "no SyncPlay seek request under a scrub"
        )

        print("PlayerKeyboardPolicy tests passed")
    }
}
