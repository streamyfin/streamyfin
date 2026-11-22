@main
enum VideoToolboxRecoveryTests {
    static func main() {
        let hardware = VideoDeinterlace.zeroCopyHwdec
        let copying = VideoDeinterlace.copyHwdec
        let software = "no"
        var recovery = VideoToolboxRecovery()

        recovery.wake(.foreground, at: 0)
        precondition(!recovery.shouldRetry(requested: hardware, active: software, at: 0),
                     "A stream that could not start on VideoToolbox stays on software")

        recovery.observe(active: hardware)
        precondition(!recovery.shouldRetry(requested: hardware, active: software, at: 1),
                     "A wake before hardware playback must not arm a retry")
        recovery.wake(.foreground, at: 1)
        precondition(!recovery.shouldRetry(requested: hardware, active: hardware, at: 1),
                     "A normal return from PiP must not restart a working decoder")
        precondition(!recovery.shouldRetry(requested: hardware, active: nil, at: 1),
                     "An unavailable decoder is not a fallback")
        precondition(recovery.shouldRetry(requested: hardware, active: software, at: 2),
                     "Retry when software fallback arrives just after the wake event")
        recovery.wake(.foreground, at: 2)
        precondition(!recovery.shouldRetry(requested: hardware, active: software, at: 2),
                     "Duplicate foreground events must not keep retrying a failed recovery")

        recovery.observe(active: copying)
        recovery.wake(.pictureInPicture, at: 3)
        precondition(recovery.shouldRetry(requested: copying, active: software, at: 3),
                     "Successful recovery rearms the retry and supports deinterlacing")
        recovery.wake(.pictureInPicture, at: 4)
        precondition(!recovery.shouldRetry(requested: copying, active: software, at: 4),
                     "Duplicate background PiP events do not retry")
        recovery.wake(.foreground, at: 4)
        precondition(recovery.shouldRetry(requested: copying, active: software, at: 4),
                     "An early PiP retry must not consume the foreground retry")

        recovery.observe(active: hardware)
        recovery.wake(.foreground, at: 5)
        precondition(!recovery.shouldRetry(requested: software, active: software, at: 5),
                     "Respect a renderer that explicitly requested software decoding")
        precondition(!recovery.shouldRetry(requested: hardware, active: software, at: 30),
                     "An old wake must not trigger recovery on an unrelated fallback")
        recovery.wake(.foreground, at: 30)
        recovery.cancelWake()
        precondition(!recovery.shouldRetry(requested: hardware, active: software, at: 30),
                     "Leaving the foreground cancels the pending wake")

        recovery = VideoToolboxRecovery()
        recovery.wake(.foreground, at: 31)
        precondition(!recovery.shouldRetry(requested: hardware, active: software, at: 31),
                     "New files must prove that their own hardware decoder worked")

        print("VideoToolboxRecoveryTests passed")
    }
}
