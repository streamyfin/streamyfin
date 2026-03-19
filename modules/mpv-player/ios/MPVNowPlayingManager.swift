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
    
    private var artworkTask: URLSessionDataTask?
    
    private init() {}
    
    // MARK: - Audio Session
    
    func activateAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
            print("[NowPlaying] Audio session activated")
        } catch {
            print("[NowPlaying] Audio session error: \(error)")
        }
    }
    
    func deactivateAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            print("[NowPlaying] Audio session deactivated")
        } catch {
            print("[NowPlaying] Deactivation error: \(error)")
        }
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
        
        cc.skipForwardCommand.isEnabled = true
        cc.skipForwardCommand.preferredIntervals = [15]
        cc.skipForwardCommand.addTarget { e in
            if let ev = e as? MPSkipIntervalCommandEvent { skipForward(ev.interval) }
            return .success
        }
        
        cc.skipBackwardCommand.isEnabled = true
        cc.skipBackwardCommand.preferredIntervals = [15]
        cc.skipBackwardCommand.addTarget { e in
            if let ev = e as? MPSkipIntervalCommandEvent { skipBackward(ev.interval) }
            return .success
        }
        
        cc.changePlaybackPositionCommand.isEnabled = true
        cc.changePlaybackPositionCommand.addTarget { e in
            if let ev = e as? MPChangePlaybackPositionCommandEvent { seekHandler(ev.positionTime) }
            return .success
        }
        
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
    func setMetadata(title: String?, artist: String?, albumTitle: String?, artworkUrl: String?) {
        self.title = title
        self.artist = artist
        self.albumTitle = albumTitle
        
        print("[NowPlaying] Metadata: \(title ?? "nil")")
        
        // Load artwork async
        artworkTask?.cancel()
        if let urlString = artworkUrl, let url = URL(string: urlString) {
            artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
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
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        print("[NowPlaying] Cleared")
    }
    
    // MARK: - Private
    
    /// Refresh Now Playing info if we have enough data
    private func refresh() {
        guard duration > 0 else {
            print("[NowPlaying] refresh skipped - duration is 0")
            return
        }
        
        var info: [String: Any] = [
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]
        
        if let title { info[MPMediaItemPropertyTitle] = title }
        if let artist { info[MPMediaItemPropertyArtist] = artist }
        if let albumTitle { info[MPMediaItemPropertyAlbumTitle] = albumTitle }
        if let cachedArtwork { info[MPMediaItemPropertyArtwork] = cachedArtwork }
        
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        print("[NowPlaying] ✅ Set info: title=\(title ?? "nil"), dur=\(Int(duration))s, pos=\(Int(position))s, rate=\(isPlaying ? 1.0 : 0.0)")
    }
}
