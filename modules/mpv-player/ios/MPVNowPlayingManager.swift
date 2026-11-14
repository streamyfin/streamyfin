import Foundation
import MediaPlayer
import UIKit
import AVFoundation

/// Simple manager for Now Playing info and remote commands.
/// Stores all state internally and updates Now Playing when ready.
class MPVNowPlayingManager {
    static let shared = MPVNowPlayingManager()
    
    // State
    private var title: String?
    private var artist: String?
    private var albumTitle: String?
    private var cachedArtwork: MPMediaItemArtwork?
    private var duration: TimeInterval = 0
    private var position: TimeInterval = 0
    private var isPlaying: Bool = false
    private var isCommandsSetup = false
    private var skipForwardSeconds: Double = 15
    private var skipBackwardSeconds: Double = 15
    /// A Live TV channel: no duration, no position to move to, no skip.
    private var isLive = false
    
    private var artworkTask: URLSessionDataTask?
    
    private init() {}

    /// The lock screen and Control Center skip by the interval they show, so
    /// the player's skip times go to both. Values that are not a positive
    /// number keep the previous interval.
    func setSkipIntervals(forward: Double, backward: Double) {
        if forward.isFinite, forward > 0 { skipForwardSeconds = forward }
        if backward.isFinite, backward > 0 { skipBackwardSeconds = backward }
        let cc = MPRemoteCommandCenter.shared()
        cc.skipForwardCommand.preferredIntervals = [NSNumber(value: skipForwardSeconds)]
        cc.skipBackwardCommand.preferredIntervals = [NSNumber(value: skipBackwardSeconds)]
    }
    
    /// A live stream offers play and pause only, on the lock screen, in
    /// Control Center and to a headset, and shows as live rather than as a
    /// timeline of what was read so far.
    func setLive(_ live: Bool) {
        isLive = live
        applySeekCommandsEnabled()
        refresh()
    }

    private func applySeekCommandsEnabled() {
        let cc = MPRemoteCommandCenter.shared()
        cc.skipForwardCommand.isEnabled = !isLive
        cc.skipBackwardCommand.isEnabled = !isLive
        cc.changePlaybackPositionCommand.isEnabled = !isLive
    }

    // MARK: - Remote Commands
    
    func setupRemoteCommands(
        playHandler: @escaping () -> Void,
        pauseHandler: @escaping () -> Void,
        toggleHandler: @escaping () -> Void,
        seekHandler: @escaping (TimeInterval) -> Void,
        skipForward: @escaping (TimeInterval) -> Void,
        skipBackward: @escaping (TimeInterval) -> Void
    ) {
        guard !isCommandsSetup else { return }
        isCommandsSetup = true
        
        DispatchQueue.main.async {
            UIApplication.shared.beginReceivingRemoteControlEvents()
        }
        
        let cc = MPRemoteCommandCenter.shared()
        
        cc.playCommand.isEnabled = true
        cc.playCommand.addTarget { _ in playHandler(); return .success }
        
        cc.pauseCommand.isEnabled = true
        cc.pauseCommand.addTarget { _ in pauseHandler(); return .success }
        
        cc.togglePlayPauseCommand.isEnabled = true
        cc.togglePlayPauseCommand.addTarget { _ in toggleHandler(); return .success }
        
        cc.skipForwardCommand.preferredIntervals = [NSNumber(value: skipForwardSeconds)]
        cc.skipForwardCommand.addTarget { e in
            if let ev = e as? MPSkipIntervalCommandEvent { skipForward(ev.interval) }
            return .success
        }
        
        cc.skipBackwardCommand.preferredIntervals = [NSNumber(value: skipBackwardSeconds)]
        cc.skipBackwardCommand.addTarget { e in
            if let ev = e as? MPSkipIntervalCommandEvent { skipBackward(ev.interval) }
            return .success
        }
        
        cc.changePlaybackPositionCommand.addTarget { e in
            if let ev = e as? MPChangePlaybackPositionCommandEvent { seekHandler(ev.positionTime) }
            return .success
        }
        applySeekCommandsEnabled()
        
        print("[NowPlaying] Remote commands ready")
    }
    
    func cleanupRemoteCommands() {
        guard isCommandsSetup else { return }
        
        let cc = MPRemoteCommandCenter.shared()
        cc.playCommand.removeTarget(nil)
        cc.pauseCommand.removeTarget(nil)
        cc.togglePlayPauseCommand.removeTarget(nil)
        cc.skipForwardCommand.removeTarget(nil)
        cc.skipBackwardCommand.removeTarget(nil)
        cc.changePlaybackPositionCommand.removeTarget(nil)
        
        DispatchQueue.main.async {
            UIApplication.shared.endReceivingRemoteControlEvents()
        }
        
        isCommandsSetup = false
        print("[NowPlaying] Remote commands cleaned up")
    }
    
    // MARK: - State Updates (call these whenever data changes)
    
    /// Set metadata (title, artist, artwork URL)
    func setMetadata(title: String?, artist: String?, albumTitle: String?, artworkUrl: String?, artworkHeaders: [String: String]? = nil) {
        self.title = title
        self.artist = artist
        self.albumTitle = albumTitle
        
        print("[NowPlaying] Metadata: \(title ?? "nil")")
        
        // Load artwork async
        artworkTask?.cancel()
        if let urlString = artworkUrl, let url = URL(string: urlString) {
            var request = URLRequest(url: url)
            artworkHeaders?.forEach { key, value in
                request.setValue(value, forHTTPHeaderField: key)
            }
            artworkTask = URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
                if let data = data, let image = UIImage(data: data) {
                    self?.cachedArtwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                    print("[NowPlaying] Artwork loaded")
                    DispatchQueue.main.async { self?.refresh() }
                }
            }
            artworkTask?.resume()
        }
        
        refresh()
    }
    
    /// Update playback state (position, duration, playing)
    func updatePlayback(position: TimeInterval, duration: TimeInterval, isPlaying: Bool) {
        self.position = position
        self.duration = duration
        self.isPlaying = isPlaying
        refresh()
    }
    
    /// Clear everything
    func clear() {
        artworkTask?.cancel()
        title = nil
        artist = nil
        albumTitle = nil
        cachedArtwork = nil
        duration = 0
        position = 0
        isPlaying = false
        // The command center is shared with the music player: leave its
        // seek commands as a film leaves them.
        isLive = false
        applySeekCommandsEnabled()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        print("[NowPlaying] Cleared")
    }
    
    // MARK: - Private
    
    /// Refresh Now Playing info if we have enough data
    private func refresh() {
        var info: [String: Any]
        if isLive {
            // mpv's duration for a live stream is how far it has read. With
            // none, the lock screen shows LIVE instead of a bar to drag.
            info = [
                MPNowPlayingInfoPropertyIsLiveStream: true,
                MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
            ]
        } else {
            guard duration > 0 else {
                print("[NowPlaying] refresh skipped - duration is 0")
                return
            }
            info = [
                MPMediaItemPropertyPlaybackDuration: duration,
                MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
                MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
            ]
        }
        
        if let title { info[MPMediaItemPropertyTitle] = title }
        if let artist { info[MPMediaItemPropertyArtist] = artist }
        if let albumTitle { info[MPMediaItemPropertyAlbumTitle] = albumTitle }
        if let cachedArtwork { info[MPMediaItemPropertyArtwork] = cachedArtwork }
        
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        print("[NowPlaying] ✅ Set info: title=\(title ?? "nil"), live=\(isLive), dur=\(Int(duration))s, pos=\(Int(position))s, rate=\(isPlaying ? 1.0 : 0.0)")
    }
}
