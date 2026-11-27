@main
enum VideoToolboxRecoveryTests {
    static func main() {
        let hardware = VideoDeinterlace.zeroCopyHwdec
        let copying = VideoDeinterlace.copyHwdec
        let software = "no"
        var recovery = VideoToolboxRecovery()

        recovery.wake(.foreground, at: 0)
        precondition(recovery.retryMode(requested: hardware, active: software, at: 0) == nil,
                     "A stream that could not start on VideoToolbox stays on software")

        recovery.observe(active: hardware)
        precondition(recovery.retryMode(requested: hardware, active: software, at: 1) == nil,
                     "A wake before hardware playback must not arm a retry")
        recovery.wake(.foreground, at: 1)
        precondition(recovery.retryMode(requested: hardware, active: hardware, at: 1) == nil,
                     "A normal return from PiP must not restart a working decoder")
        precondition(recovery.retryMode(requested: hardware, active: nil, at: 1) == nil,
                     "An unavailable decoder is not a fallback")
        precondition(recovery.retryMode(requested: hardware, active: software, at: 2) != nil,
                     "Retry when software fallback arrives just after the wake event")
        recovery.wake(.foreground, at: 2)
        precondition(recovery.retryMode(requested: hardware, active: software, at: 2) == nil,
                     "Duplicate foreground events must not keep retrying a failed recovery")

        recovery.observe(active: copying)
        recovery.wake(.pictureInPicture, at: 3)
        precondition(recovery.retryMode(requested: copying, active: software, at: 3) != nil,
                     "Successful recovery rearms the retry and supports deinterlacing")
        recovery.wake(.pictureInPicture, at: 4)
        precondition(recovery.retryMode(requested: copying, active: software, at: 4) == nil,
                     "Duplicate background PiP events do not retry")
        recovery.wake(.foreground, at: 4)
        precondition(recovery.retryMode(requested: copying, active: software, at: 4) != nil,
                     "An early PiP retry must not consume the foreground retry")

        recovery.observe(active: hardware)
        recovery.wake(.foreground, at: 5)
        precondition(recovery.retryMode(requested: software, active: software, at: 5) == nil,
                     "Respect a renderer that explicitly requested software decoding")
        precondition(recovery.retryMode(requested: hardware, active: software, at: 30) == nil,
                     "An old wake must not trigger recovery on an unrelated fallback")
        recovery.wake(.foreground, at: 30)
        recovery.cancelWake()
        precondition(recovery.retryMode(requested: hardware, active: software, at: 30) == nil,
                     "Leaving the foreground cancels the pending wake")

        recovery = VideoToolboxRecovery()
        recovery.wake(.foreground, at: 31)
        precondition(recovery.retryMode(requested: hardware, active: software, at: 31) == nil,
                     "New files must prove that their own hardware decoder worked")

        recovery.observe(active: hardware)
        recovery.wake(.foreground, at: 32, paused: true)
        precondition(recovery.retryMode(requested: hardware, active: software, at: 60) == nil,
                     "Do not reset the decoder while waiting for the user to resume")
        recovery.playbackPauseChanged(false, at: 60)
        precondition(recovery.retryMode(requested: hardware, active: software, deinterlacing: true, at: 61) == copying,
                     "A paused wake survives until resume and keeps the deinterlace filter compatible")

        recovery.observe(active: hardware)
        recovery.wake(.pictureInPicture, at: 70)
        recovery.displayResetStarted(at: 71)
        precondition(recovery.retryMode(requested: hardware, active: software, at: 71) == nil,
                     "The display layer reset already handled this PiP wake")
        recovery.wake(.foreground, at: 72)
        precondition(recovery.retryMode(requested: hardware, active: software, at: 72) != nil,
                     "A failed display recovery in PiP still allows a foreground retry")

        recovery.observe(active: hardware)
        recovery.wake(.pictureInPicture, at: 80)
        recovery.playbackPauseChanged(true, at: 81)
        recovery.cancelWake(.foreground)
        recovery.playbackPauseChanged(false, at: 100)
        precondition(recovery.retryMode(requested: hardware, active: software, at: 101) == hardware,
                     "Pausing after wake and leaving the foreground do not discard a visible PiP retry")

        recovery.observe(active: hardware)
        recovery.wake(.pictureInPicture, at: 110, paused: true)
        recovery.cancelWake(.pictureInPicture)
        recovery.playbackPauseChanged(false, at: 130)
        precondition(recovery.retryMode(requested: hardware, active: software, at: 131) == nil,
                     "Hidden PiP must not keep an old recovery armed")

        print("VideoToolboxRecoveryTests passed")
    }
}
