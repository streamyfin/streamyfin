import AVFoundation
import ExpoModulesCore
import UIKit

/**
 Read-only view of the system output volume, for iOS and tvOS.

 Deliberately never calls `setCategory` or `setActive`: the player owns the
 audio session (`.playback` / `.moviePlayback` / `.longFormAudio`, see
 `MpvPlayerView.configureAudioSession`). Both npm alternatives force `.ambient`
 when observation starts, which silently breaks background playback and makes
 the silent switch cut video audio. Nothing here touches the session.

 No `MediaPlayer` import either: `MPVolumeView` does not exist on tvOS, and
 reading the volume never needs it.
 */
public class SystemVolumeModule: Module {
  private var observation: NSKeyValueObservation?
  private var foregroundObserver: NSObjectProtocol?
  private var lastEmitted = Double.nan

  // OnDestroy is not guaranteed on every teardown path, and a block-based
  // NotificationCenter observer is never removed automatically.
  deinit {
    stopObserving()
  }

  public func definition() -> ModuleDefinition {
    Name("SystemVolume")

    Events("onVolumeChange")

    Function("getVolume") { () -> Double in
      Double(AVAudioSession.sharedInstance().outputVolume)
    }

    // Apple platforms expose no equivalent of Android's fixed-volume policy.
    // Kept so the JS API is identical on both sides.
    Function("isVolumeFixed") { () -> Bool in false }

    OnStartObserving { self.startObserving() }

    OnStopObserving { self.stopObserving() }

    OnDestroy { self.stopObserving() }
  }

  private func startObserving() {
    lastEmitted = Double.nan

    let session = AVAudioSession.sharedInstance()
    observation = session.observe(\.outputVolume, options: [.new]) {
      [weak self] session, change in
      self?.emit(Double(change.newValue ?? session.outputVolume))
    }

    // iOS 18 stops delivering KVO for volume changes made while backgrounded,
    // so re-read on the way back in. Apple developer forums thread 813242.
    foregroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.emit(Double(AVAudioSession.sharedInstance().outputVolume))
    }
  }

  private func stopObserving() {
    observation?.invalidate()
    observation = nil
    if let observer = foregroundObserver {
      NotificationCenter.default.removeObserver(observer)
      foregroundObserver = nil
    }
    lastEmitted = Double.nan
  }

  /// KVO fires on an arbitrary thread; hop to main so both the dedupe state and
  /// the event emitter are only ever touched from one thread.
  private func emit(_ volume: Double) {
    DispatchQueue.main.async { [weak self] in
      guard let self, volume != self.lastEmitted else { return }
      self.lastEmitted = volume
      self.sendEvent("onVolumeChange", ["volume": volume])
    }
  }
}
