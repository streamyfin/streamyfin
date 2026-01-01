import ExpoModulesCore
import MediaPlayer

public class MediaControlsModule: Module {
  private var currentArtworkTask: URLSessionDataTask?

  public func definition() -> ModuleDefinition {
    Name("MediaControls")

    Events("play", "pause", "stop", "next", "previous", "seekTo")

    OnCreate {
      setupRemoteCommandCenter()
    }

    OnDestroy {
      teardownRemoteCommandCenter()
    }

    AsyncFunction("updateNowPlaying") { (metadata: [String: Any]) in
      updateNowPlaying(metadata: metadata)
    }

    AsyncFunction("clearNowPlaying") {
      clearNowPlaying()
    }
  }

  private func setupRemoteCommandCenter() {
    let commandCenter = MPRemoteCommandCenter.shared()

    // Play command
    commandCenter.playCommand.isEnabled = true
    commandCenter.playCommand.addTarget { [weak self] event in
      self?.sendEvent("play", [:])
      return .success
    }

    // Pause command
    commandCenter.pauseCommand.isEnabled = true
    commandCenter.pauseCommand.addTarget { [weak self] event in
      self?.sendEvent("pause", [:])
      return .success
    }

    // Stop command
    commandCenter.stopCommand.isEnabled = true
    commandCenter.stopCommand.addTarget { [weak self] event in
      self?.sendEvent("stop", [:])
      return .success
    }

    // Next track command
    commandCenter.nextTrackCommand.isEnabled = true
    commandCenter.nextTrackCommand.addTarget { [weak self] event in
      self?.sendEvent("next", [:])
      return .success
    }

    // Previous track command
    commandCenter.previousTrackCommand.isEnabled = true
    commandCenter.previousTrackCommand.addTarget { [weak self] event in
      self?.sendEvent("previous", [:])
      return .success
    }

    // Seek command
    commandCenter.changePlaybackPositionCommand.isEnabled = true
    commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
      if let seekEvent = event as? MPChangePlaybackPositionCommandEvent {
        self?.sendEvent("seekTo", ["position": seekEvent.positionTime])
      }
      return .success
    }
  }

  private func teardownRemoteCommandCenter() {
    let commandCenter = MPRemoteCommandCenter.shared()

    commandCenter.playCommand.removeTarget(nil)
    commandCenter.pauseCommand.removeTarget(nil)
    commandCenter.stopCommand.removeTarget(nil)
    commandCenter.nextTrackCommand.removeTarget(nil)
    commandCenter.previousTrackCommand.removeTarget(nil)
    commandCenter.changePlaybackPositionCommand.removeTarget(nil)

    commandCenter.playCommand.isEnabled = false
    commandCenter.pauseCommand.isEnabled = false
    commandCenter.stopCommand.isEnabled = false
    commandCenter.nextTrackCommand.isEnabled = false
    commandCenter.previousTrackCommand.isEnabled = false
    commandCenter.changePlaybackPositionCommand.isEnabled = false
  }

  private func updateNowPlaying(metadata: [String: Any]) {
    let title = metadata["title"] as? String ?? ""
    let artist = metadata["artist"] as? String ?? ""
    let album = metadata["album"] as? String ?? ""
    let artworkUrl = metadata["artwork"] as? String
    let duration = metadata["duration"] as? Double ?? 0.0
    let position = metadata["position"] as? Double ?? 0.0
    let isPlaying = metadata["isPlaying"] as? Bool ?? false

    // Cancel any pending artwork loading to prevent stale metadata from overwriting
    currentArtworkTask?.cancel()
    currentArtworkTask = nil

    var nowPlayingInfo: [String: Any] = [
      MPMediaItemPropertyTitle: title,
      MPMediaItemPropertyArtist: artist,
      MPMediaItemPropertyAlbumTitle: album,
      MPMediaItemPropertyPlaybackDuration: duration,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
      MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
    ]

    // Set metadata immediately without artwork (so track info updates right away)
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo

    // Load artwork asynchronously and update when ready
    if let artworkUrl = artworkUrl, let url = URL(string: artworkUrl) {
      let task = URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
        // Check if this task was cancelled (i.e., a new track was set)
        guard self?.currentArtworkTask != nil else { return }

        if let data = data, let image = UIImage(data: data) {
          let artwork = MPMediaItemArtwork(boundsSize: image.size) { size in
            return image
          }
          // Get current info and only add artwork (preserve any updates made since)
          if var currentInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo {
            currentInfo[MPMediaItemPropertyArtwork] = artwork
            MPNowPlayingInfoCenter.default().nowPlayingInfo = currentInfo
          }
        }
        // If artwork loading fails, metadata is already set without it
      }
      currentArtworkTask = task
      task.resume()
    }
  }

  private func clearNowPlaying() {
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }
}
