import Foundation

/// Holds the remote engine for as long as the connection to the TV lasts, not as long as a screen: one is
/// born when a session is connected and JS gave a server, lives through a suspension of the session (iOS
/// suspends it each time the app leaves the foreground) and through closed screens, and goes with the
/// session or the server, sending nothing to the TV.
///
/// The holder is the engine's permanent delegate: it keeps pause, loading, position and duration, relays
/// every call to the screen attached, and publishes a snapshot on each change but the position. Main
/// thread only; `snapshot` can be read from any thread.
final class RemotePlayback: PlayerEngineDelegate {
  /// The one the module, the remote screen and the debug probe share; installDefault gives it its factory.
  static let shared = RemotePlayback()
  static let noEngineError = "No remote engine: no Cast session, or no server from JS"

  /// A load's answer as JS reads it (RemoteLoadResult in Cast.types.ts): a failure names its code.
  static func resultForJs(_ result: CastLoadResult) -> [String: Any] {
    switch result {
    case .notSent(let error): return ["outcome": "notSent", "error": error]
    case .settled(.loaded): return ["outcome": "loaded"]
    case .settled(.superseded): return ["outcome": "superseded"]
    case .settled(.timedOut): return ["outcome": "timedOut"]
    case .settled(.failed(let error, _)): return ["outcome": "failed", "error": error.rawValue]
    }
  }

  private(set) var engine: RemoteEngine?

  private var engineFactory: (ReceiverServer) -> RemoteEngine?
  private let log: (String) -> Void
  private var server: ReceiverServer?
  private var sessionHolds = false
  private var suspended = false
  private weak var screen: PlayerEngineDelegate?
  private var listeners: [(token: Int, listener: (RemotePlaybackSnapshot) -> Void)] = []
  private var nextToken = 0

  // What the engine last said, for a screen that attaches later.
  private var paused = true
  private var loading = false
  private var readyToSeek = false

  private let lock = NSLock()
  private var state = RemotePlaybackSnapshot.none
  private var position = 0.0
  private var duration = 0.0

  init(engineFactory: @escaping (ReceiverServer) -> RemoteEngine? = { _ in nil }, log: @escaping (String) -> Void = { _ in }) {
    self.engineFactory = engineFactory
    self.log = log
  }

  /// The state of the moment, with the position the engine last reported.
  var snapshot: RemotePlaybackSnapshot {
    lock.lock()
    defer { lock.unlock() }
    var current = state
    current.positionSec = position
    current.durationSec = duration
    return current
  }

  /// installDefault hands the factory over once Cast is there: the SDK's engine, or the fake one with the
  /// fake receivers.
  func useFactory(_ factory: @escaping (ReceiverServer) -> RemoteEngine?) {
    engineFactory = factory
    reconcile()
  }

  /// The account's server; none, and no engine is made. Another one while an engine lives goes to it, whose next
  /// commands carry it: an open screen keeps its engine through an address switched on another network or a TV
  /// renamed.
  func setServer(_ server: ReceiverServer?) {
    guard server != self.server else { return }
    self.server = server
    if let server, let engine {
      engine.useServer(server)
      return
    }
    drop()
    reconcile()
  }

  /// Plays `request` on the TV through the session's engine, under `server`; never sent without one.
  func load(server: ReceiverServer, request: ReceiverPlayRequest, completion: @escaping (CastLoadResult) -> Void) {
    guard let engine else { return completion(.notSent(Self.noEngineError)) }
    engine.load(server: server, request: request, completion: completion)
  }

  /// The TV's item again where it is, under `server`, with `subtitleStreamIndex` when named; nothing without an engine.
  func reload(server: ReceiverServer, subtitleStreamIndex: Int? = nil, completion: @escaping (CastLoadResult) -> Void = { _ in }) {
    guard let engine else { return completion(.notSent(Self.noEngineError)) }
    engine.reloadCurrentItem(server: server, subtitleStreamIndex: subtitleStreamIndex, completion: completion)
  }

  /// The audio track the remote player's menu chose, by Jellyfin index; nothing without an engine.
  func setAudioTrack(_ index: Int) {
    engine?.setAudioTrack(index)
  }

  /// The subtitle the remote player's menu chose, by Jellyfin index; -1 turns them off.
  func setSubtitleTrack(_ index: Int) {
    guard let engine else { return }
    if index < 0 {
      engine.disableSubtitles()
    } else {
      engine.setSubtitleTrack(index)
    }
  }

  /// What the target hub says of the session: connected, or suspended while the SDK tries to resume it.
  func targetChanged(connected: Bool, suspended: Bool) {
    sessionHolds = connected
    self.suspended = connected && suspended
    reconcile()
  }

  /// Lends the engine to a screen, brought up to date at once; nil without one.
  func attachScreen(_ delegate: PlayerEngineDelegate) -> RemoteEngine? {
    guard let engine else { return nil }
    screen = delegate
    delegate.engine(engine, didChangeLoading: loading)
    delegate.engine(engine, didChangePause: paused)
    let (position, duration) = progress()
    delegate.engine(engine, didUpdateProgress: position, duration: duration, cacheSeconds: 0)
    if readyToSeek, engine.currentItemId != nil { delegate.engine(engine, didBecomeReadyToSeek: true) }
    return engine
  }

  /// The screen gives the engine back: it hears nothing more, and the engine plays on.
  func detachScreen(_ delegate: PlayerEngineDelegate) {
    if screen === delegate { screen = nil }
  }

  func addListener(_ listener: @escaping (RemotePlaybackSnapshot) -> Void) -> () -> Void {
    nextToken += 1
    let token = nextToken
    listeners.append((token, listener))
    return { [weak self] in self?.listeners.removeAll { $0.token == token } }
  }

  /// The engine a session gets: the fake one for a tier 1 build's fake receivers, which have no TV behind them.
  static func factory(
    fake: Bool, real: @escaping (ReceiverServer) -> RemoteEngine?, fakeEngine: @escaping () -> RemoteEngine
  ) -> (ReceiverServer) -> RemoteEngine? {
    fake ? { _ in fakeEngine() } : real
  }

  /// The hub's state as a session: connected, or suspended. Connecting without reconnecting is no session yet.
  static func session(of snapshot: RemoteTargetSnapshot) -> (connected: Bool, suspended: Bool) {
    switch snapshot.phase {
    case .connected: return (true, false)
    case .connecting where snapshot.reconnecting: return (true, true)
    default: return (false, false)
    }
  }

  // A session that is connected and a server make an engine; a suspended session keeps the one it had but
  // makes none, as the engine binds only to a connected session.
  private func reconcile() {
    if !sessionHolds || server == nil {
      drop()
    } else if engine == nil, !suspended, let server, let made = engineFactory(server) {
      engine = made
      made.delegate = self
      made.onStateChanged = { [weak self] in self?.publish() }
      log("engine made for the session")
      do {
        try made.start()
      } catch {
        log("engine could not start: \(error)")
      }
    }
    publish()
  }

  // Detaching sends nothing: the TV plays on.
  private func drop() {
    guard let engine else { return }
    self.engine = nil
    engine.onStateChanged = nil
    engine.delegate = nil
    engine.shutdown()
    paused = true
    loading = false
    readyToSeek = false
    setProgress(0, 0)
    log("engine dropped")
  }

  private func publish() {
    var audio = -1
    var subtitle = -1
    // The Cast engine answers both at once, from its published state.
    engine?.getCurrentAudioTrack { audio = $0 }
    engine?.getCurrentSubtitleTrack { subtitle = $0 }
    let next = RemotePlaybackSnapshot(
      connected: sessionHolds && server != nil, phase: engine?.phase ?? RemotePhase.none,
      reconnecting: suspended || engine?.reconnecting == true, itemId: engine?.currentItemId, positionSec: 0,
      durationSec: 0, audioIndex: audio, subtitleIndex: subtitle, queueItemIds: engine?.queueItemIds ?? [],
      playingIndex: engine?.playingIndex ?? -1, foreign: engine?.foreign == true, title: engine?.mediaTitle,
      imageUrl: engine?.mediaImageUrl,
      playMethod: engine?.playMethod, stopRequested: engine?.stopRequested == true
    )
    if next.itemId == nil { readyToSeek = false }
    lock.lock()
    let changed = next != state
    if changed { state = next }
    lock.unlock()
    guard changed else { return }
    let published = snapshot
    listeners.map(\.listener).forEach { $0(published) }
  }

  private func progress() -> (Double, Double) {
    lock.lock()
    defer { lock.unlock() }
    return (position, duration)
  }

  private func setProgress(_ position: Double, _ duration: Double) {
    lock.lock()
    self.position = position
    self.duration = duration
    lock.unlock()
  }

  // MARK: - PlayerEngineDelegate: kept, then relayed to the screen attached

  func engine(_ engine: TransportEngine, didLoad config: VideoLoadConfig) {
    screen?.engine(engine, didLoad: config)
  }

  func engine(_ engine: TransportEngine, didUpdateProgress position: Double, duration: Double, cacheSeconds: Double) {
    setProgress(position, duration)
    screen?.engine(engine, didUpdateProgress: position, duration: duration, cacheSeconds: cacheSeconds)
  }

  func engine(_ engine: TransportEngine, didChangePause isPaused: Bool) {
    paused = isPaused
    screen?.engine(engine, didChangePause: isPaused)
  }

  func engine(_ engine: TransportEngine, didChangeLoading isLoading: Bool) {
    loading = isLoading
    screen?.engine(engine, didChangeLoading: isLoading)
  }

  func engine(_ engine: TransportEngine, didBecomeReadyToSeek ready: Bool) {
    if ready { readyToSeek = true }
    screen?.engine(engine, didBecomeReadyToSeek: ready)
  }

  func engine(_ engine: TransportEngine, didBecomeTracksReady ready: Bool) {
    screen?.engine(engine, didBecomeTracksReady: ready)
  }

  func engine(_ engine: TransportEngine, didChangePictureInPicture isActive: Bool) {
    screen?.engine(engine, didChangePictureInPicture: isActive)
  }

  func engine(_ engine: TransportEngine, didFailWithError message: String) {
    screen?.engine(engine, didFailWithError: message)
  }

  func engine(_ engine: TransportEngine, didDetectHDRMode mode: HDRMode, fps: Double) {
    screen?.engine(engine, didDetectHDRMode: mode, fps: fps)
  }

  func engineDidReachEnd(_ engine: TransportEngine) {
    screen?.engineDidReachEnd(engine)
  }

  // A remote playback takes no system controls: only a screen's own requests reach the engine.
  func engine(_ engine: TransportEngine, requestsSeekTo position: Double) {
    screen?.engine(engine, requestsSeekTo: position)
  }

  func engine(_ engine: TransportEngine, requestsSeekBy offset: Double) {
    screen?.engine(engine, requestsSeekBy: offset)
  }

  func engine(_ engine: TransportEngine, requestsPlaying playing: Bool) {
    screen?.engine(engine, requestsPlaying: playing)
  }
}
