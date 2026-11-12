import Foundation

/// mpv's start for a load: the resume point, or the file's start. A live
/// stream gets none: start=0 is a seek to its first timestamp, which it
/// cannot do, and a resume point from a stream renegotiated for another
/// bitrate is ahead of all of the transcode the server restarts for it.
/// Kept free of mpv so `scripts/ios/test-mpv-start-option.sh` runs on macOS.
func mpvStartOption(startPosition: Double?, isLive: Bool) -> String {
    if isLive { return "none" }
    if let startPosition, startPosition > 0 {
        return String(format: "%.2f", startPosition)
    }
    return "0"
}
