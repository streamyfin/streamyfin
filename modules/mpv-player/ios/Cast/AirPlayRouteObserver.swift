#if os(iOS) && !targetEnvironment(macCatalyst)
import AVFoundation

/// The AirPlay output in use, for the sheet's AirPlay row: read at start and on every route change, through
/// PlayerAudioSession, since every AVAudioSession getter is a synchronous call to the audio server.
/// Main thread only.
final class AirPlayRouteObserver {
  private(set) var activeRoute: String?
  var onChange: ((String?) -> Void)?
  private var token: NSObjectProtocol?

  func start() {
    guard token == nil else { return }
    token = NotificationCenter.default.addObserver(
      forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.read()
    }
    read()
  }

  func stop() {
    if let token { NotificationCenter.default.removeObserver(token) }
    token = nil
    onChange = nil
  }

  private func read() {
    PlayerAudioSession.shared.airPlayOutputName { [weak self] name in
      guard let self, token != nil, name != activeRoute else { return }
      activeRoute = name
      onChange?(name)
    }
  }
}
#endif
