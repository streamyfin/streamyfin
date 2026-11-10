import AVFoundation
import ExpoModulesCore
#if os(iOS)
import MediaPlayer
#endif
import UIKit

/**
 The system output volume, for iOS and tvOS: read and follow it, and on iOS set
 it and keep the system volume indicator away while the app shows its own.

 Deliberately never calls `setCategory` or `setActive`: the player owns the
 audio session (`.playback` / `.moviePlayback` / `.longFormAudio`, see
 `MpvPlayerView.configureAudioSession`). Both npm alternatives force `.ambient`
 when observation starts, which silently breaks background playback and makes
 the silent switch cut video audio. Nothing here touches the session.

 Setting the volume is iOS only: `MPVolumeView` does not exist on tvOS, where
 the TV or the receiver owns the volume.
 */
public class SystemVolumeModule: Module {
  private var observation: NSKeyValueObservation?
  private var foregroundObserver: NSObjectProtocol?
  private var lastEmitted = Double.nan

  #if os(iOS)
  /// The one public way to set the volume is the slider of an `MPVolumeView`,
  /// and while one is in a window iOS keeps its own volume indicator off the
  /// screen. Created on first use; only ever touched on the main queue.
  private var volumeView: MPVolumeView?
  private var indicatorHidden = false
  /// Set while a volume view that was in no window settles into one.
  private var pendingVolume: Float?
  #endif

  // OnDestroy is not guaranteed on every teardown path, and a block-based
  // NotificationCenter observer is never removed automatically.
  deinit {
    stopObserving()
    #if os(iOS)
    // A teardown that skips OnDestroy would leave the view in the window, and
    // with it the system volume indicator away.
    let view = volumeView
    DispatchQueue.main.async { view?.removeFromSuperview() }
    #endif
  }

  public func definition() -> ModuleDefinition {
    Name("SystemVolume")

    Events("onVolumeChange")

    Function("getVolume") { () -> Double in
      Double(AVAudioSession.sharedInstance().outputVolume)
    }

    // The same read on the module's own queue: `outputVolume` is a synchronous
    // round trip to the audio server, which can hold the JS thread for seconds.
    AsyncFunction("getVolumeAsync") { () -> Double in
      Double(AVAudioSession.sharedInstance().outputVolume)
    }

    // Apple platforms expose no equivalent of Android's fixed-volume policy.
    // Kept so the JS API is identical on both sides.
    Function("isVolumeFixed") { () -> Bool in false }

    AsyncFunction("setVolume") { (volume: Double) in
      #if os(iOS)
      self.setVolume(Float(min(max(volume, 0), 1)))
      #endif
    }.runOnQueue(.main)

    AsyncFunction("setVolumeIndicatorHidden") { (hidden: Bool) in
      #if os(iOS)
      self.indicatorHidden = hidden
      if !hidden {
        self.volumeView?.removeFromSuperview()
      } else if self.makeVolumeView().window == nil, let window = Self.foregroundWindow() {
        window.addSubview(self.makeVolumeView())
      }
      #endif
    }.runOnQueue(.main)

    OnStartObserving { self.startObserving() }

    OnStopObserving { self.stopObserving() }

    OnDestroy {
      self.stopObserving()
      #if os(iOS)
      // The view, not self: the module can be gone by the time this runs.
      let view = self.volumeView
      DispatchQueue.main.async { view?.removeFromSuperview() }
      #endif
    }
  }

  #if os(iOS)
  private func makeVolumeView() -> MPVolumeView {
    if let view = volumeView { return view }
    // Off screen and nearly transparent: it is there to be used, not seen.
    let view = MPVolumeView(frame: CGRect(x: -2000, y: -2000, width: 1, height: 1))
    view.alpha = 0.01
    volumeView = view
    return view
  }

  /// A volume view ignores its slider until it has been laid out in a window,
  /// so a volume set with no hold in place, a remote command for one, puts the
  /// view in the window, sets it on a later turn of the main queue instead of
  /// waiting here, and takes it out again unless a hold came in meanwhile.
  private func setVolume(_ volume: Float) {
    if pendingVolume != nil {
      pendingVolume = volume
      return
    }
    let view = makeVolumeView()
    if view.window != nil {
      volumeSlider()?.value = volume
      return
    }
    guard let window = Self.foregroundWindow() else { return }
    window.addSubview(view)
    pendingVolume = volume
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      guard let self, let volume = self.pendingVolume else { return }
      self.pendingVolume = nil
      self.volumeSlider()?.value = volume
      // Left in the window for a moment, so the change lands before it goes.
      DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
        guard let self, !self.indicatorHidden, self.pendingVolume == nil else { return }
        self.volumeView?.removeFromSuperview()
      }
    }
  }

  private func volumeSlider() -> UISlider? {
    makeVolumeView().subviews.lazy.compactMap { $0 as? UISlider }.first
  }

  private static func foregroundWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    return scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
  }
  #endif

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
