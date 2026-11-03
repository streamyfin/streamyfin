import Foundation

// The device proof of the Cast engine (e2e/suites/cast/README.md, "Cast engine probe"): a launch
// argument arms it in debug builds, it waits for the first PlayNow JS sends, binds an engine to that
// session and drives each face of it on the TV, while the console shows what the receiver did.
// Nothing it logs carries a message: the access token rides on every one.

/// The steps, each at its offset from the first playing of the item.
final class CastEngineProbeScript {
  static let cappedBitrate: Int64 = 192_000
  static let launchArgument = "CastEngineProbe"
  static let steps: [(Double, String)] = [
    (5_000, "pause"), (8_000, "play"), (12_000, "seek+30"), (20_000, "volume-0.1"),
    (23_000, "volume-back"), (26_000, "audio-reload"), (40_000, "subtitles-off"),
    (45_000, "capped-reload"), (60_000, "seek+30"), (70_000, "next"), (80_000, "detach"),
  ]
  private static let seekSeconds = 30.0
  private static let volumeStep = 0.1

  private let engine: CastEngine
  private let server: ReceiverServer
  private let deliver: CastEngine.Delivery
  private let log: (String) -> Void
  private var timers: [() -> Void] = []
  private var volumeBefore: Double?

  init(engine: CastEngine, server: ReceiverServer, deliver: @escaping CastEngine.Delivery, log: @escaping (String) -> Void) {
    self.engine = engine
    self.server = server
    self.deliver = deliver
    self.log = log
  }

  func run() {
    cancel()
    timers = Self.steps.map { at, step in deliver(at) { [weak self] in self?.perform(step) } }
  }

  func cancel() {
    timers.forEach { $0() }
    timers = []
  }

  private func perform(_ step: String) {
    log("step \(step)")
    switch step {
    case "pause": engine.pause()
    case "play": engine.play()
    case "seek+30": engine.seekBy(offset: Self.seekSeconds)
    case "volume-0.1":
      guard let volume = engine.targetVolume else { return }
      volumeBefore = volume
      engine.setTargetVolume(volume - Self.volumeStep)
    case "volume-back":
      if let volumeBefore { engine.setTargetVolume(volumeBefore) }
    case "audio-reload":
      // The same track: the receiver reloads for any audio change, under a new play session.
      engine.getCurrentAudioTrack { [engine] in engine.setAudioTrack($0) }
    case "subtitles-off": engine.disableSubtitles()
    case "capped-reload": reloadCapped()
    case "next": engine.skipToNext()
    case "detach": engine.shutdown()
    default: break
    }
  }

  // A quality change as the engine applies it: the item again where it is, with its source, tracks
  // and queue, under a lower cap.
  private func reloadCapped() {
    var capped = server
    capped.maxBitrate = Self.cappedBitrate
    engine.reloadCurrentItem(server: capped)
  }
}

/// Arms on the hub: the first PlayNow JS sends names the server and the item, an engine binds to the
/// session, and the script starts at the first playing of that item. One run per arming, which the
/// detach step or a lost binding ends.
final class CastEngineProbe: PlayerEngineDelegate, CastBindingListener {
  private static let detachAt = CastEngineProbeScript.steps.first { $0.1 == "detach" }?.0 ?? 0

  private let hub: ReceiverChannelHub
  private let makeEngine: (ReceiverServer) -> CastEngine?
  private let deliver: CastEngine.Delivery
  private let log: (String) -> Void
  private(set) var isActive = false
  private var captured = false
  private var itemId: String?
  private var engine: CastEngine?
  private var script: CastEngineProbeScript?
  private var busLogger: BusLogger?
  private var bus: ReceiverSubscription?
  private var cancelEnd: (() -> Void)?
  private var paused = true
  private var loading = false
  private var started = false

  init(
    hub: ReceiverChannelHub, makeEngine: @escaping (ReceiverServer) -> CastEngine?,
    deliver: @escaping CastEngine.Delivery, log: @escaping (String) -> Void
  ) {
    self.hub = hub
    self.makeEngine = makeEngine
    self.deliver = deliver
    self.log = log
  }

  func arm() {
    isActive = true
    hub.sendObserver = { [weak self] namespace, text in self?.onSend(namespace: namespace, text: text) }
    log("armed")
  }

  private func onSend(namespace: String, text: String) {
    guard namespace == ReceiverProtocol.namespace,
      let message = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
    else { return }
    let command = message["command"] as? String ?? ""
    log("bus sent \(command)")
    guard !captured, command == "PlayNow" else { return }
    guard let server = Self.server(of: message) else {
      log("PlayNow without a server")
      return
    }
    captured = true
    itemId = Self.firstItem(of: message)
    // Once the message went: the engine binds to the session JS loads on.
    _ = deliver(0) { [weak self] in self?.bind(server) }
  }

  private func bind(_ server: ReceiverServer) {
    guard let engine = makeEngine(server) else {
      log("no Cast engine on this device")
      disarm()
      return
    }
    self.engine = engine
    engine.delegate = self
    engine.bindingListener = self
    script = CastEngineProbeScript(engine: engine, server: server, deliver: deliver, log: log)
    do {
      try engine.start()
    } catch {
      log("error \(CastEngine.noSessionError)")
      disarm()
      return
    }
    let busLogger = BusLogger(log: log)
    self.busLogger = busLogger
    bus = hub.subscribe(namespace: ReceiverProtocol.namespace, listener: busLogger)
    log("engine bound, waiting for the item to play")
  }

  // The TV may still show what it played before: the script waits for the item JS loaded.
  private func startWhenPlaying() {
    guard let engine, !started, !paused, !loading, itemId != nil, engine.currentItemId == itemId else { return }
    started = true
    log("item playing, running the script")
    script?.run()
    cancelEnd = deliver(Self.detachAt) { [weak self] in self?.disarm() }
  }

  private func disarm() {
    guard isActive else { return }
    isActive = false
    script?.cancel()
    cancelEnd?()
    cancelEnd = nil
    bus?.remove()
    bus = nil
    busLogger = nil
    hub.sendObserver = nil
    log("disarmed")
  }

  func engine(_ engine: TransportEngine, didLoad config: VideoLoadConfig) {}

  func engine(_ engine: TransportEngine, didUpdateProgress position: Double, duration: Double, cacheSeconds: Double) {
    log(String(format: "position %.1f/%.1f", position, duration))
    startWhenPlaying()
  }

  func engine(_ engine: TransportEngine, didChangePause isPaused: Bool) {
    paused = isPaused
    log(isPaused ? "paused" : "playing")
    startWhenPlaying()
  }

  func engine(_ engine: TransportEngine, didChangeLoading isLoading: Bool) {
    loading = isLoading
    log("loading \(isLoading)")
    startWhenPlaying()
  }

  func engine(_ engine: TransportEngine, didBecomeReadyToSeek ready: Bool) {
    if ready { log("ready to seek") }
  }

  func engine(_ engine: TransportEngine, didBecomeTracksReady ready: Bool) {}
  func engine(_ engine: TransportEngine, didChangePictureInPicture isActive: Bool) {}

  func engine(_ engine: TransportEngine, didFailWithError message: String) {
    log("error \(message)")
  }

  func engine(_ engine: TransportEngine, didDetectHDRMode mode: HDRMode, fps: Double) {}

  func engineDidReachEnd(_ engine: TransportEngine) {
    log("ended")
  }

  func castEngineDidLoseBinding(sessionId: String?, error: String?) {
    disarm()
  }

  // The envelope every message carries, rebuilt and never logged.
  private static func server(of message: [String: Any]) -> ReceiverServer? {
    guard let address = message["serverAddress"] as? String, !address.isEmpty,
      let token = message["accessToken"] as? String, !token.isEmpty,
      let userId = message["userId"] as? String, !userId.isEmpty
    else { return nil }
    let name = message["receiverName"] as? String
    let bitrate = (message["maxBitrate"] as? NSNumber)?.int64Value ?? 0
    return ReceiverServer(
      serverAddress: address, accessToken: token, userId: userId,
      receiverName: name?.isEmpty == false ? name : nil, maxBitrate: bitrate > 0 ? bitrate : nil
    )
  }

  private static func firstItem(of message: [String: Any]) -> String? {
    guard let options = message["options"] as? [String: Any], let items = options["items"] as? [[String: Any]] else { return nil }
    let index = options["startIndex"] as? Int ?? 0
    guard items.indices.contains(index), let id = items[index]["Id"] as? String, !id.isEmpty else { return nil }
    return id
  }
}

/// The receiver's bus as the device proof reads it: the type, and the stream picks of data.PlayState.
private final class BusLogger: ReceiverBusListener {
  private static let playStateFields = ["PlayMethod", "PositionTicks", "AudioStreamIndex", "SubtitleStreamIndex"]
  private let log: (String) -> Void

  init(log: @escaping (String) -> Void) {
    self.log = log
  }

  func receiverBusDidReceive(_ raw: String) {
    guard let message = (try? JSONSerialization.jsonObject(with: Data(raw.utf8))) as? [String: Any] else {
      log("bus message that is not JSON")
      return
    }
    let state = (message["data"] as? [String: Any])?["PlayState"] as? [String: Any]
    let fields = Self.playStateFields.map { field in "\(field)=\(state?[field].map { "\($0)" } ?? "-")" }
    log("bus type=\(message["type"] as? String ?? "") \(fields.joined(separator: " "))")
  }

  func receiverBusDidBecomeReady(sessionId: String) {}
  func receiverBusDidLose(sessionId: String?, ended: Bool) {}
}
