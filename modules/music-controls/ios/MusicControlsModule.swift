import AVFoundation
import ExpoModulesCore
import Foundation
import MediaPlayer
import UIKit

public class MusicControlsModule: Module {
  private var enabled = false

  private var nowPlayingMetadata: [String: Any] = [:]
  private var artworkUri: String?
  private var artworkImage: UIImage?

  private var isPlaying: Bool = false
  private var positionSeconds: Double = 0
  private var durationSeconds: Double = 0

  private var artworkDownloadTask: URLSessionDataTask?

  public func definition() -> ModuleDefinition {
    Name("MusicControls")

    Events(
      "onPlay",
      "onPause",
      "onTogglePlayPause",
      "onNext",
      "onPrevious",
      "onSeekTo"
    )

    OnCreate {
      // Lazy enable: JS calls enable() when playback starts
    }

    OnDestroy {
      self.disable()
    }

    Function("enable") {
      self.enable()
    }

    Function("disable") {
      self.disable()
    }

    Function("setNowPlaying") { (metadata: [String: Any]) in
      self.setNowPlaying(metadata)
    }

    Function("setPlaybackState") { (state: [String: Any]) in
      self.setPlaybackState(state)
    }
  }

  private func enable() {
    if enabled { return }
    enabled = true

    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
    try? AVAudioSession.sharedInstance().setActive(true)

    setupRemoteCommandCenter()
    updateNowPlayingInfo()
  }

  private func disable() {
    if !enabled { return }
    enabled = false

    cleanupRemoteCommandCenter()
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil

    artworkDownloadTask?.cancel()
    artworkDownloadTask = nil
    artworkImage = nil
    artworkUri = nil

    nowPlayingMetadata = [:]
    isPlaying = false
    positionSeconds = 0
    durationSeconds = 0

    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func setupRemoteCommandCenter() {
    #if !os(tvOS)
    let commandCenter = MPRemoteCommandCenter.shared()

    commandCenter.playCommand.isEnabled = true
    commandCenter.playCommand.addTarget { [weak self] _ in
      self?.sendEvent("onPlay", [:])
      return .success
    }

    commandCenter.pauseCommand.isEnabled = true
    commandCenter.pauseCommand.addTarget { [weak self] _ in
      self?.sendEvent("onPause", [:])
      return .success
    }

    commandCenter.togglePlayPauseCommand.isEnabled = true
    commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.sendEvent("onTogglePlayPause", [:])
      return .success
    }

    commandCenter.nextTrackCommand.isEnabled = true
    commandCenter.nextTrackCommand.addTarget { [weak self] _ in
      self?.sendEvent("onNext", [:])
      return .success
    }

    commandCenter.previousTrackCommand.isEnabled = true
    commandCenter.previousTrackCommand.addTarget { [weak self] _ in
      self?.sendEvent("onPrevious", [:])
      return .success
    }

    commandCenter.changePlaybackPositionCommand.isEnabled = true
    commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
      let position = (event as? MPChangePlaybackPositionCommandEvent)?.positionTime ?? 0
      self?.sendEvent("onSeekTo", ["position": position])
      return .success
    }
    #endif
  }

  private func cleanupRemoteCommandCenter() {
    #if !os(tvOS)
    let commandCenter = MPRemoteCommandCenter.shared()
    commandCenter.playCommand.removeTarget(nil)
    commandCenter.pauseCommand.removeTarget(nil)
    commandCenter.togglePlayPauseCommand.removeTarget(nil)
    commandCenter.nextTrackCommand.removeTarget(nil)
    commandCenter.previousTrackCommand.removeTarget(nil)
    commandCenter.changePlaybackPositionCommand.removeTarget(nil)
    #endif
  }

  private func setNowPlaying(_ metadata: [String: Any]) {
    nowPlayingMetadata = metadata

    if let duration = metadata["duration"] as? Double {
      durationSeconds = duration
    } else if let duration = metadata["duration"] as? Int {
      durationSeconds = Double(duration)
    }

    let nextArtworkUri = metadata["artworkUri"] as? String
    if nextArtworkUri != artworkUri {
      artworkUri = nextArtworkUri
      artworkImage = nil
      artworkDownloadTask?.cancel()
      artworkDownloadTask = nil
      if let uri = nextArtworkUri {
        downloadArtwork(uri)
      } else {
        updateNowPlayingInfo()
      }
    } else {
      updateNowPlayingInfo()
    }
  }

  private func setPlaybackState(_ state: [String: Any]) {
    if let playing = state["isPlaying"] as? Bool {
      isPlaying = playing
    }
    if let position = state["position"] as? Double {
      positionSeconds = position
    } else if let position = state["position"] as? Int {
      positionSeconds = Double(position)
    }
    if let duration = state["duration"] as? Double {
      durationSeconds = duration
    } else if let duration = state["duration"] as? Int {
      durationSeconds = Double(duration)
    }

    updateNowPlayingInfo()
  }

  private func downloadArtwork(_ uri: String) {
    guard let url = URL(string: uri) else {
      updateNowPlayingInfo()
      return
    }

    artworkDownloadTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let self else { return }
      if let data = data, let image = UIImage(data: data) {
        self.artworkImage = image
      }
      self.updateNowPlayingInfo()
    }
    artworkDownloadTask?.resume()
  }

  private func updateNowPlayingInfo() {
    guard enabled else { return }

    var info: [String: Any] = [:]

    if let title = nowPlayingMetadata["title"] as? String {
      info[MPMediaItemPropertyTitle] = title
    }
    if let artist = nowPlayingMetadata["artist"] as? String {
      info[MPMediaItemPropertyArtist] = artist
    }
    if let albumTitle = nowPlayingMetadata["albumTitle"] as? String {
      info[MPMediaItemPropertyAlbumTitle] = albumTitle
    }

    if durationSeconds > 0 {
      info[MPMediaItemPropertyPlaybackDuration] = durationSeconds
    }

    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = positionSeconds
    info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0

    if let artwork = artworkImage {
      let mediaArtwork = MPMediaItemArtwork(boundsSize: artwork.size) { _ in artwork }
      info[MPMediaItemPropertyArtwork] = mediaArtwork
    }

    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }
}


