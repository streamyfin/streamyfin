import Foundation

enum CastEngineError: Error {
  case noSession
}

/// Plays Jellyfin items on the Cast receiver behind the TransportEngine and QueueEngine faces: the
/// media channel carries play, pause and the seeks the receiver does in place, the receiver's bus the
/// rest. It decodes nothing and reaches the SDK only through its ports (spec §4.2).
///
/// It runs on the main thread, as its port and hub callbacks do; the getters read a copy of the state
/// under a lock, so a host may call them from anywhere.
final class CastEngine: TransportEngine, QueueEngine {
  /// Runs a block after a delay in milliseconds and returns what cancels it: the progress tick, the
  /// reload deadline. The main queue in the app, a manual clock in the checks.
  typealias Delivery = (Double, @escaping () -> Void) -> (() -> Void)

  static let noSessionError = "No connected Cast session"
  static let urlLoadError = "The Cast engine plays Jellyfin items, not URLs"
  static let playbackError = "The receiver stopped on a playback error"
  static let sessionReplacedError = "The Cast session was replaced"

  weak var delegate: PlayerEngineDelegate?
  weak var bindingListener: CastBindingListener?
  private(set) var intendedPlayState = false

  private var server: ReceiverServer
  private let sessions: CastSessionSource
  private let hub: ReceiverChannelHub
  private let deliver: Delivery
  private let log: (String) -> Void

  private var session: CastSessionPort?
  private var media: CastMediaPort?
  private var bus: ReceiverSubscription?
  // The hub, the session source and the media client hold their listeners weakly: the engine keeps them.
  private var mediaEar: MediaEar?
  private var busEar: BusEar?
  private var sessionEar: SessionEar?

  // What the last status said. `ours` is nil without media, and for media another sender loaded,
  // which carries no customData.
  private var ours: ReceiverCustomData?
  private var hasMedia = false
  private var playerState = State.unknown
  private var idleReason: String?
  private var position = 0.0
  private var itemDuration = 0.0
  private var volume: Double?
  private var playSessionId: String?

  // The customData does not follow a track change (spec §3.3): the latest of what the bus reported
  // and what was sent wins, until the next play session brings its own.
  private var chosenAudio: Int?
  private var chosenSubtitle: Int?

  private var reportedPause: Bool?
  private var reportedLoading: Bool?
  private var readyToSeekFor: String?
  private var cancelTick: (() -> Void)?

  // A reload the receiver runs for a Seek it cannot do in place or a track change. The position stays
  // on its target until the new play session reports: the old customData with the new currentTime
  // would land on the old start plus the new time.
  private struct Reload {
    let tracker: ReceiverLoadTracker
    let cancelTimer: () -> Void
  }

  private var reload: Reload?

  // The state the getters read, copied after each change.
  private struct Published {
    var position = 0.0
    var duration = 0.0
    var paused = true
    var itemId: String?
    var volume: Double?
    var audio = -1
    var subtitle = -1
  }

  private let lock = NSLock()
  private var published = Published()

  init(
    server: ReceiverServer, sessions: CastSessionSource, hub: ReceiverChannelHub,
    deliver: @escaping Delivery, log: @escaping (String) -> Void = { _ in }
  ) {
    self.server = server
    self.sessions = sessions
    self.hub = hub
    self.deliver = deliver
    self.log = log
  }

  // MARK: - Lifecycle

  func start() throws {
    onMain()
    guard let current = sessions.current, current.isConnected else { throw CastEngineError.noSession }
    bind(current)
  }

  // The TV plays on: detaching sends nothing, and never ends the session.
  func shutdown() {
    onMain()
    detach()
  }

  // Forgets the item and keeps the binding, where the mpv engine rebuilds its handle to be loaded again.
  func destroy() {
    onMain()
    reload?.cancelTimer()
    reload = nil
    stopTicking()
    ours = nil
    hasMedia = false
    playSessionId = nil
    chosenAudio = nil
    chosenSubtitle = nil
    position = 0
    itemDuration = 0
    readyToSeekFor = nil
    publishState()
  }

  private func bind(_ session: CastSessionPort) {
    self.session = session
    volume = session.volume
    let sessionEar = SessionEar(engine: self)
    self.sessionEar = sessionEar
    sessions.listener = sessionEar
    let busEar = BusEar(engine: self)
    self.busEar = busEar
    bus = hub.subscribe(namespace: ReceiverProtocol.namespace, listener: busEar)
    attachMedia(session.media)
    publishState()
    log("bound to session \(session.sessionId ?? "?")")
  }

  private func attachMedia(_ port: CastMediaPort?) {
    media?.listener = nil
    media = port
    guard let port else {
      mediaEar = nil
      return
    }
    let ear = MediaEar(engine: self, port: port)
    mediaEar = ear
    port.listener = ear
    port.requestStatus()
  }

  private func detach() {
    media?.listener = nil
    media = nil
    mediaEar = nil
    bus?.remove()
    bus = nil
    busEar = nil
    sessions.listener = nil
    sessionEar = nil
    stopTicking()
    reload?.cancelTimer()
    reload = nil
    if let session { log("detached from session \(session.sessionId ?? "?")") }
    session = nil
  }

  // MARK: - Loading

  // VideoLoadConfig carries a URL only, and the receiver plays Jellyfin items.
  func loadVideo(config: VideoLoadConfig, force: Bool) {
    onMain()
    log("refused a URL load")
    delegate?.engine(self, didFailWithError: Self.urlLoadError)
  }

  // MARK: - Transport

  func play() {
    onMain()
    guard let media else { return }
    intendedPlayState = true
    media.play()
  }

  func pause() {
    onMain()
    guard let media else { return }
    intendedPlayState = false
    media.pause()
  }

  func seekTo(position: Double, exact: Bool) {
    onMain()
    seek(position)
  }

  func seekBy(offset: Double) {
    onMain()
    seek(position + offset)
  }

  // The system's requests (lock screen, Control Center) go to the host, which keeps its own
  // position bookkeeping and seeks like every other seek.
  func requestSeek(to position: Double) {
    delegate?.engine(self, requestsSeekTo: position)
  }

  func requestSeek(by offset: Double) {
    delegate?.engine(self, requestsSeekBy: offset)
  }

  func requestPlaying(_ playing: Bool) {
    delegate?.engine(self, requestsPlaying: playing)
  }

  private func seek(_ seconds: Double) {
    guard let port = media else { return }
    let data = ours
    // Nothing loaded, stopped, or live: a Seek by reload would restart a stopped item.
    guard hasMedia, playerState != State.idle, data?.canSeek != false else { return }
    let target = itemDuration > 0 ? min(max(seconds, 0), itemDuration) : max(seconds, 0)
    guard let data, data.canClientSeek == false else {
      port.seek(to: target) { [weak self] succeeded in
        guard let self, !succeeded else { return }
        self.delegate?.engine(self, didUpdateProgress: self.position, duration: self.itemDuration, cacheSeconds: 0)
      }
      return
    }
    // The receiver cannot seek in this stream (transcoded music, live TV): Seek reloads it there.
    startReload(target: target, data: data) { failed in self.send("Seek", ["position": target], failed: failed) }
  }

  func setSpeed(speed: Double) {}

  // The receiver announces no PLAYBACK_RATE.
  func getSpeed() -> Double { 1 }

  func setMute(_ muted: Bool) {
    onMain()
    session?.setMute(muted)
  }

  func isPaused() -> Bool { read { $0.paused } }

  func getCurrentPosition() -> Double { read { $0.position } }

  func getDuration() -> Double { read { $0.duration } }

  // The lock screen is a later step.
  func setNowPlayingMetadata(_ metadata: [String: String], artworkHeaders: [String: String]?) {}

  // MARK: - Tracks: the ids are Jellyfin MediaStream indexes, the menus come from JS

  func getSubtitleTracks(completion: @escaping ([[String: Any]]) -> Void) { completion([]) }

  func setSubtitleTrack(_ trackId: Int) {
    onMain()
    selectSubtitle(trackId)
  }

  func disableSubtitles() {
    onMain()
    selectSubtitle(-1)
  }

  func getCurrentSubtitleTrack(completion: @escaping (Int) -> Void) { completion(read { $0.subtitle }) }

  // No receiver command takes a URL.
  func addSubtitleFile(url: String, select: Bool) {}

  func getAudioTracks(completion: @escaping ([[String: Any]]) -> Void) { completion([]) }

  func setAudioTrack(_ trackId: Int) {
    onMain()
    guard let data = loadedItem() else { return }
    chosenAudio = trackId
    publishState()
    // The receiver always reloads for an audio change, under a new play session.
    startReload(target: position, data: data) { failed in
      self.send("SetAudioStreamIndex", ["index": trackId], failed: failed)
    }
  }

  func getCurrentAudioTrack(completion: @escaping (Int) -> Void) { completion(read { $0.audio }) }

  private func selectSubtitle(_ index: Int) {
    guard let data = loadedItem() else { return }
    chosenSubtitle = index
    publishState()
    if index >= 0, media?.status?.hasTextTracks == false {
      // No text track loaded: the receiver would name the index in its reports and show nothing,
      // so the item plays again where it is with that subtitle.
      let audio = read { $0.audio }
      playAgain(data, audio: audio >= 0 ? audio : nil, subtitle: index)
      return
    }
    send("SetSubtitleStreamIndex", ["index": index])
  }

  private func playAgain(_ data: ReceiverCustomData, audio: Int?, subtitle: Int?) {
    let request = ReceiverPlayRequest(
      items: [ReceiverItem(id: data.itemId)],
      startPositionTicks: Int64((position * ReceiverProtocol.ticksPerSecond).rounded()),
      mediaSourceId: data.mediaSourceId,
      audioStreamIndex: audio,
      subtitleStreamIndex: subtitle,
      liveStreamId: data.liveStreamId
    )
    guard let message = try? ReceiverProtocol.playNow(server: server, request: request) else { return }
    startReload(target: position, data: data) { failed in self.sendMessage("PlayNow", message, failed: failed) }
  }

  // Local-only processing: the receiver has no such controls.
  func setAudioDelay(_ seconds: Double) {}
  func setVolumeBoost(_ percent: Int) {}
  func setDialogueBoost(_ enabled: Bool) {}
  func setMonoDownmix(_ enabled: Bool) {}

  // MARK: - Queue face

  var currentItemId: String? { read { $0.itemId } }

  var targetVolume: Double? { read { $0.volume } }

  func setTargetVolume(_ level: Double) {
    onMain()
    session?.setVolume(min(max(level, 0), 1))
  }

  // MARK: - What the receiver reports

  fileprivate func onStatus(from port: CastMediaPort) {
    guard port === media else { return }
    guard let status = port.status, status.hasMedia else {
      clearMedia(port.status?.playerState ?? State.idle)
      return
    }
    let data = status.customData.map(ReceiverProtocol.parseCustomData)
    if let pending = reload, let outcome = pending.tracker.onMediaStatus(customData: data, playerState: status.playerState) {
      settleReload(pending, outcome, recompute: false)
    }
    if data?.playSessionId != playSessionId {
      playSessionId = data?.playSessionId
      chosenAudio = nil
      chosenSubtitle = nil
    }
    ours = data
    hasMedia = true
    itemDuration = Self.duration(of: data, streamDuration: status.streamDuration)
    if reload == nil { position = currentPosition(of: status, port: port, data: data) }
    reportState(status.playerState, reason: status.idleReason, data: data)
    publishState()
    delegate?.engine(self, didUpdateProgress: position, duration: itemDuration, cacheSeconds: 0)
    if cancelTick == nil { scheduleTick() }
  }

  private func scheduleTick() {
    cancelTick = deliver(CastEngineConstants.progressIntervalMs) { [weak self] in
      self?.cancelTick = nil
      self?.tick()
    }
  }

  // No progress listener on iOS: the engine reads the media channel every second while it has media.
  private func tick() {
    guard hasMedia, let port = media, let status = port.status, status.hasMedia else { return }
    if reload == nil { position = currentPosition(of: status, port: port, data: ours) }
    publishState()
    delegate?.engine(self, didUpdateProgress: position, duration: itemDuration, cacheSeconds: 0)
    scheduleTick()
  }

  private func stopTicking() {
    cancelTick?()
    cancelTick = nil
  }

  // The SDK extrapolates the approximate position while playing only: otherwise the status has it.
  private func currentPosition(of status: CastMediaSnapshot, port: CastMediaPort, data: ReceiverCustomData?) -> Double {
    let currentTime = status.playerState == State.playing ? port.approximatePosition : status.streamPosition
    return ReceiverProtocol.positionInItem(currentTime: currentTime, customData: data ?? ReceiverCustomData())
  }

  fileprivate func onBusMessage(_ message: ReceiverMessage) {
    if let state = Self.playState(of: message) {
      if let value = state["AudioStreamIndex"] { chosenAudio = (value as? NSNumber)?.intValue }
      if let value = state["SubtitleStreamIndex"] { chosenSubtitle = (value as? NSNumber)?.intValue }
      publishState()
    }
    if let pending = reload, let outcome = pending.tracker.onMessage(message) {
      settleReload(pending, outcome, recompute: true)
    }
  }

  fileprivate func onVolume(_ volume: Double) {
    self.volume = volume
    publishState()
  }

  private func clearMedia(_ state: String) {
    hasMedia = false
    ours = nil
    playerState = state
    playSessionId = nil
    chosenAudio = nil
    chosenSubtitle = nil
    stopTicking()
    setPause(true)
    publishState()
  }

  private func reportState(_ state: String, reason: String, data: ReceiverCustomData?) {
    let wasError = playerState == State.idle && idleReason == Reason.error
    playerState = state
    idleReason = reason
    switch state {
    case State.playing:
      intendedPlayState = true
      setPause(false)
      setLoading(reload != nil)
    case State.paused:
      intendedPlayState = false
      setPause(true)
      setLoading(reload != nil)
    case State.buffering, State.loading:
      setLoading(true)
    case State.idle:
      setPause(true)
      if reason == Reason.error, !wasError { delegate?.engine(self, didFailWithError: Self.playbackError) }
      // A stream change for the same item: a new play session follows.
      if reason == Reason.interrupted { setLoading(true) }
    default:
      break
    }
    if data?.canSeek == true, let playSession = data?.playSessionId, playSession != readyToSeekFor {
      readyToSeekFor = playSession
      delegate?.engine(self, didBecomeReadyToSeek: true)
    }
  }

  private func setPause(_ paused: Bool) {
    guard paused != reportedPause else { return }
    reportedPause = paused
    delegate?.engine(self, didChangePause: paused)
  }

  private func setLoading(_ loading: Bool) {
    guard loading != reportedLoading else { return }
    reportedLoading = loading
    delegate?.engine(self, didChangeLoading: loading)
  }

  // MARK: - Reloads

  private func startReload(target: Double, data: ReceiverCustomData, send: (@escaping (String) -> Void) -> Void) {
    reload?.cancelTimer()
    let tracker = ReceiverLoadTracker(request: ReceiverPlayRequest(items: [ReceiverItem(id: data.itemId)]), previousPlaySessionId: data.playSessionId)
    let cancelTimer = deliver(CastEngineConstants.loadTimeoutMs) { [weak self] in
      guard let self, let pending = self.reload, pending.tracker === tracker, let outcome = tracker.timeOut() else { return }
      self.settleReload(pending, outcome, recompute: true)
    }
    reload = Reload(tracker: tracker, cancelTimer: cancelTimer)
    position = target
    setLoading(true)
    publishState()
    delegate?.engine(self, didUpdateProgress: position, duration: itemDuration, cacheSeconds: 0)
    send { [weak self] error in
      // Never sent: nothing will reload, so the position goes back to what the receiver reports.
      guard let self, let pending = self.reload, pending.tracker === tracker else { return }
      pending.cancelTimer()
      self.reload = nil
      self.delegate?.engine(self, didFailWithError: error)
      self.recomputePosition()
    }
  }

  private func settleReload(_ pending: Reload, _ outcome: ReceiverLoadOutcome, recompute: Bool) {
    pending.cancelTimer()
    reload = nil
    switch outcome {
    case .failed(let error, _): delegate?.engine(self, didFailWithError: error.rawValue)
    case .timedOut: delegate?.engine(self, didFailWithError: outcome.wireName)
    case .loaded, .superseded: break
    }
    if recompute { recomputePosition() }
  }

  // Outside a status: back to the formula of the last one, with the media channel's own estimate.
  private func recomputePosition() {
    guard hasMedia, let port = media, let status = port.status else { return }
    position = currentPosition(of: status, port: port, data: ours)
    setLoading(playerState == State.buffering || playerState == State.loading)
    publishState()
    delegate?.engine(self, didUpdateProgress: position, duration: itemDuration, cacheSeconds: 0)
  }

  // MARK: - Sending, never logged: every message carries the access token

  private func send(_ command: String, _ options: [String: Any], failed: @escaping (String) -> Void = { _ in }) {
    sendMessage(command, ReceiverProtocol.message(command: command, server: server, options: options), failed: failed)
  }

  private func sendMessage(_ command: String, _ message: [String: Any], failed: @escaping (String) -> Void = { _ in }) {
    guard
      let data = try? JSONSerialization.data(withJSONObject: message, options: [.sortedKeys, .withoutEscapingSlashes]),
      let text = String(data: data, encoding: .utf8)
    else {
      log("\(command) could not be encoded")
      return
    }
    log("send \(command)")
    hub.send(namespace: ReceiverProtocol.namespace, text: text) { [weak self] error in
      guard let error else { return }
      self?.log("\(command) not sent: \(error)")
      failed(error)
    }
  }

  // MARK: - Helpers

  // Our item, loaded and not stopped: the receiver's commands need one (spec §4).
  private func loadedItem() -> ReceiverCustomData? {
    guard hasMedia, playerState != State.idle, let data = ours, data.itemId != nil else { return nil }
    return data
  }

  private func publishState() {
    let data = ours
    let update = Published(
      position: position,
      duration: itemDuration,
      paused: playerState == State.paused || playerState == State.idle || playerState == State.unknown,
      itemId: data?.itemId,
      volume: volume,
      audio: data == nil ? -1 : chosenAudio ?? data?.audioStreamIndex ?? -1,
      subtitle: data == nil ? -1 : chosenSubtitle ?? data?.subtitleStreamIndex ?? -1
    )
    lock.lock()
    published = update
    lock.unlock()
  }

  private func read<T>(_ value: (Published) -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return value(published)
  }

  private func onMain() {
    #if DEBUG
      dispatchPrecondition(condition: .onQueue(.main))
    #endif
  }

  private static func duration(of data: ReceiverCustomData?, streamDuration: TimeInterval) -> Double {
    if let ticks = data?.runtimeTicks, ticks > 0 { return Double(ticks) / ReceiverProtocol.ticksPerSecond }
    if streamDuration.isFinite, streamDuration > 0 { return streamDuration }
    return 0
  }

  // The reporting messages carry data.PlayState, as an object or as the JSON text of one.
  private static func playState(of message: ReceiverMessage) -> [String: Any]? {
    guard case .parsed(let json) = message else { return nil }
    let data: [String: Any]?
    if let object = json["data"] as? [String: Any] {
      data = object
    } else if let text = json["data"] as? String {
      data = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
    } else {
      data = nil
    }
    return data?["PlayState"] as? [String: Any]
  }

  // CastMapping's names for the player state and the idle reason.
  private enum State {
    static let playing = "playing"
    static let paused = "paused"
    static let buffering = "buffering"
    static let loading = "loading"
    static let idle = "idle"
    static let unknown = "unknown"
  }

  private enum Reason {
    static let error = "error"
    static let interrupted = "interrupted"
  }
}

// A listener per media client: a status the replaced client still had queued must not count.
private final class MediaEar: CastMediaListener {
  private weak var engine: CastEngine?
  private weak var port: CastMediaPort?

  init(engine: CastEngine, port: CastMediaPort) {
    self.engine = engine
    self.port = port
  }

  func castMediaDidUpdateStatus() {
    guard let port else { return }
    engine?.onStatus(from: port)
  }
}

private final class BusEar: ReceiverBusListener {
  private weak var engine: CastEngine?

  init(engine: CastEngine) { self.engine = engine }

  func receiverBusDidReceive(_ raw: String) { engine?.onBusMessage(ReceiverProtocol.parseMessage(raw)) }
  func receiverBusDidBecomeReady(sessionId: String) {}
  func receiverBusDidLose(sessionId: String?, ended: Bool) {}
}

private final class SessionEar: CastSessionListener {
  private weak var engine: CastEngine?

  init(engine: CastEngine) { self.engine = engine }

  func castSessionDidSuspend(sessionId: String?) {}
  func castSessionDidResume(_ session: CastSessionPort) {}
  func castSessionDidEnd(sessionId: String?, error: String?) {}
  func castSessionDidReceiveVolume(_ volume: Double, muted: Bool) { engine?.onVolume(volume) }
}
