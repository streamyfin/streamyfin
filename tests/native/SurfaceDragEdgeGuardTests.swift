import CoreGraphics

/// Pulling Notification Centre down over the native player turned the volume
/// or the brightness down, because the surface drag took a swipe that began
/// at the top screen edge. These cases pin the strips at both edges where a
/// drag is left to the system.
@main
enum SurfaceDragEdgeGuardTests {
    static func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
        precondition(condition, message())
    }

    static func main() {
        // An iPhone in landscape: no top safe area, so the surface starts at
        // the screen edge.
        let height: CGFloat = 372

        expect(
            surfaceDragStartsAtScreenEdge(startY: 0, surfaceHeight: height),
            "a drag from the very top edge is the system's"
        )
        expect(
            surfaceDragStartsAtScreenEdge(startY: 20, surfaceHeight: height),
            "a finger coming in over the top bezel lands a little inside the edge"
        )
        expect(
            surfaceDragStartsAtScreenEdge(startY: surfaceDragEdgeInset - 1, surfaceHeight: height),
            "the last point of the top strip is still ignored"
        )
        expect(
            !surfaceDragStartsAtScreenEdge(startY: surfaceDragEdgeInset, surfaceHeight: height),
            "the first point below the top strip drags"
        )
        expect(
            !surfaceDragStartsAtScreenEdge(startY: height / 2, surfaceHeight: height),
            "a drag from the middle of the video drags"
        )
        expect(
            !surfaceDragStartsAtScreenEdge(
                startY: height - surfaceDragEdgeInset - 1, surfaceHeight: height
            ),
            "the last point above the bottom strip drags"
        )
        expect(
            surfaceDragStartsAtScreenEdge(startY: height - surfaceDragEdgeInset, surfaceHeight: height),
            "the first point of the bottom strip is ignored"
        )
        expect(
            surfaceDragStartsAtScreenEdge(startY: height, surfaceHeight: height),
            "a home indicator swipe from the bottom edge is the system's"
        )

        // The bottom strip replaced a guard as tall as the home indicator
        // inset: 34 pt in portrait, 21 pt in landscape. It must still cover it.
        for homeIndicatorInset: CGFloat in [21, 34] {
            expect(
                surfaceDragStartsAtScreenEdge(
                    startY: height - homeIndicatorInset, surfaceHeight: height
                ),
                "the strip covers a \(homeIndicatorInset) pt home indicator inset"
            )
        }

        // A surface shorter than the two strips has nowhere left to drag from.
        expect(
            surfaceDragStartsAtScreenEdge(startY: 40, surfaceHeight: 80),
            "a surface shorter than both strips ignores every drag"
        )
        print("SurfaceDragEdgeGuard tests passed")
    }
}
