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

  /// Whether the receiver's Jellyfin identity is this sender's: it keeps the one of the first message
  /// since its app started, and nothing on iOS says who started it. Media there at the binding means
  /// another sender spoke first; otherwise it is not known (spec §5.4).
  private(set) var receiverIdentityIsOurs: Bool?

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

  private final class PendingLoad {
    let tracker: ReceiverLoadTracker
    let completion: (CastLoadResult) -> Void
    var cancelTimer: () -> Void = {}

    init(tracker: ReceiverLoadTracker, completion: @escaping (CastLoadResult) -> Void) {
      self.tracker = tracker
      self.completion = completion
    }
  }

  private var pendingLoad: PendingLoad?

  // Set once a load went out: the receiver sends its bus to the last sender that spoke, so after a
  // resume this engine speaks first to hear it again (spec §8, risk 6).
  private var busClaimed = false
  private var suspended = false

  // After IDLE + FINISHED the receiver fetches the next item before it buffers: the end waits.
  private var cancelEndWait: (() -> Void)?

  // A failed PlaybackInfo comes as a connection error, then a NoCompatibleStream playbackerror that
  // belongs to the same failure.
  private var noCompatibleStreamFollows = false

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
    if let status = session.media?.status, status.hasMedia || status.customData != nil { receiverIdentityIsOurs = false }
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
    if let load = pendingLoad, let outcome = load.tracker.supersede() { settleLoad(load, outcome) }
    endWait(false)
    suspended = false
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

  // The SDK reports every session: only the bound one's suspend or end concerns the engine.
  private func isBound(_ sessionId: String?) -> Bool { sessionId == nil || sessionId == session?.sessionId }

  // A suspended session keeps the state and the pending load, whose deadline runs on (spec §2.4).
  fileprivate func suspendBinding(sessionId: String?) {
    guard isBound(sessionId), let bound = session, !suspended else { return }
    suspended = true
    stopTicking()
    setLoading(true)
    log("session \(bound.sessionId ?? "?") suspended")
  }

  // A resume hands a new session object under the same id, with a new media client.
  fileprivate func resumeBinding(_ resumed: CastSessionPort) {
    guard let bound = session else { return }
    guard resumed.sessionId == bound.sessionId else {
      loseBinding(Self.sessionReplacedError)
      return
    }
    suspended = false
    session = resumed
    volume = resumed.volume
    attachMedia(resumed.media)
    publishState()
    log("session \(resumed.sessionId ?? "?") resumed")
  }

  fileprivate func endBinding(sessionId: String?, error: String?) {
    guard isBound(sessionId) else { return }
    loseBinding(error)
  }

  fileprivate func loseBinding(_ error: String?) {
    guard let sessionId = session?.sessionId else { return }
    detach()
    bindingListener?.castEngineDidLoseBinding(sessionId: sessionId, error: error)
  }

  fileprivate func onBusReady(sessionId: String) {
    guard let bound = session else { return }
    guard sessionId == bound.sessionId else {
      loseBinding(Self.sessionReplacedError)
      return
    }
    // An inert command: SetVolume without a level changes nothing on the receiver.
    if busClaimed { send("SetVolume", [:]) }
  }

  // MARK: - Loading

  // VideoLoadConfig carries a URL only, and the receiver plays Jellyfin items.
  func loadVideo(config: VideoLoadConfig, force: Bool) {
    onMain()
    log("refused a URL load")
    delegate?.engine(self, didFailWithError: Self.urlLoadError)
  }

  /// Plays `request` on the receiver, the way JS does (spec §5.2): one PlayNow, settled by what the
  /// receiver reports, the first event winning, or never sent. A newer load supersedes this one.
  func load(server: ReceiverServer, request: ReceiverPlayRequest, completion: @escaping (CastLoadResult) -> Void) {
    onMain()
    guard session?.isConnected == true else {
      completion(.notSent(Self.noSessionError))
      return
    }
    let message: [String: Any]
    do {
      message = try ReceiverProtocol.playNow(server: server, request: request)
    } catch {
      completion(.notSent(String(describing: error)))
      return
    }
    self.server = server
    reload?.cancelTimer()
    reload = nil
    endWait(false)
    noCompatibleStreamFollows = false
    // The media on the TV now, read at the send: a status of its play session is never this load.
    let load = PendingLoad(tracker: ReceiverLoadTracker(request: request, previousPlaySessionId: ours?.playSessionId), completion: completion)
    let previous = pendingLoad
    // The new load is pending before the old one settles, so loading never blinks off between them.
    pendingLoad = load
    if let previous, let outcome = previous.tracker.supersede() { settleLoad(previous, outcome) }
    load.cancelTimer = deliver(CastEngineConstants.loadTimeoutMs) { [weak self] in
      guard let self, self.pendingLoad === load, let outcome = load.tracker.timeOut() else { return }
      self.settleLoad(load, outcome)
    }
    setLoading(true)
    sendMessage("PlayNow", message, sent: { [weak self] in self?.busClaimed = true }) { [weak self] error in
      guard let self, self.pendingLoad === load else { return }
      load.cancelTimer()
      self.pendingLoad = nil
      self.setLoading(self.isBuffering())
      load.completion(.notSent(error))
    }
  }

  /// The item again where it is, with the tracks it plays: also how a quality change applies the
  /// envelope's new cap.
  func reloadCurrentItem() {
    onMain()
    guard let data = loadedItem() else { return }
    let state = read { $0 }
    playAgain(data, audio: state.audio >= 0 ? state.audio : nil, subtitle: state.subtitle)
  }

  private func settleLoad(_ load: PendingLoad, _ outcome: ReceiverLoadOutcome) {
    load.cancelTimer()
    if pendingLoad === load { pendingLoad = nil }
    if case .loaded = outcome {} else { setLoading(isBuffering()) }
    load.completion(.settled(outcome))
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

  // The queue lives on the receiver, which the sender does not see; it announces no QUEUE_NEXT, so
  // the bus carries these.

  func skipToNext() {
    onMain()
    if loadedItem() != nil { send("NextTrack", [:]) }
  }

  // The receiver never goes back to the start of the item it plays: past the chrome's threshold, the
  // engine seeks there instead.
  func skipToPrevious() {
    onMain()
    guard loadedItem() != nil else { return }
    if position > CastEngineConstants.previousRestartSeconds { seek(0) } else { send("PreviousTrack", [:]) }
  }

  // A Cast message holds 64 KB: the items go a window at a time.
  func enqueue(itemIds: [String]) {
    onMain()
    guard session != nil else { return }
    stride(from: 0, to: itemIds.count, by: CastEngineConstants.maxQueueItems).forEach { start in
      let window = Array(itemIds[start..<min(start + CastEngineConstants.maxQueueItems, itemIds.count)])
      sendMessage("PlayLast", ReceiverProtocol.playLast(server: server, itemIds: window))
    }
  }

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
      let finished = port.status?.playerState == State.idle && port.status?.idleReason == Reason.finished
      if finished, !(playerState == State.idle && idleReason == Reason.finished) { endWait(true) }
      clearMedia(port.status?.playerState ?? State.idle)
      idleReason = port.status?.idleReason
      return
    }
    let data = status.customData.map(ReceiverProtocol.parseCustomData)
    if let load = pendingLoad, let outcome = load.tracker.onMediaStatus(customData: data, playerState: status.playerState) {
      settleLoad(load, outcome)
    }
    if let pending = reload, let outcome = pending.tracker.onMediaStatus(customData: data, playerState: status.playerState) {
      settleReload(pending, outcome, recompute: false)
    }
    if data?.playSessionId != playSessionId {
      playSessionId = data?.playSessionId
      chosenAudio = nil
      chosenSubtitle = nil
      // The next item: what ended was not the end.
      if data?.playSessionId != nil { endWait(false) }
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
    guard let error = ReceiverProtocol.loadErrorOf(message) else { return }
    if let load = pendingLoad, let outcome = load.tracker.onMessage(message) {
      noCompatibleStreamFollows = error == .playbackInfoFailed
      settleLoad(load, outcome)
      return
    }
    if let pending = reload, let outcome = pending.tracker.onMessage(message) {
      noCompatibleStreamFollows = error == .playbackInfoFailed
      settleReload(pending, outcome, recompute: true)
      return
    }
    if noCompatibleStreamFollows, error == .playbackFailed {
      noCompatibleStreamFollows = false
      return
    }
    delegate?.engine(self, didFailWithError: error.rawValue)
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
    let wasFinished = playerState == State.idle && idleReason == Reason.finished
    playerState = state
    idleReason = reason
    switch state {
    case State.playing:
      intendedPlayState = true
      setPause(false)
      setLoading(awaitingReceiver())
    case State.paused:
      intendedPlayState = false
      setPause(true)
      setLoading(awaitingReceiver())
    case State.buffering, State.loading:
      setLoading(true)
    case State.idle:
      setPause(true)
      if reason == Reason.error, !wasError { delegate?.engine(self, didFailWithError: Self.playbackError) }
      // A stream change for the same item: a new play session follows.
      if reason == Reason.interrupted { setLoading(true) }
      if reason == Reason.finished, !wasFinished { endWait(true) }
    default:
      break
    }
    if data?.canSeek == true, let playSession = data?.playSessionId, playSession != readyToSeekFor {
      readyToSeekFor = playSession
      delegate?.engine(self, didBecomeReadyToSeek: true)
    }
  }

  private func awaitingReceiver() -> Bool { reload != nil || pendingLoad != nil || suspended }

  private func isBuffering() -> Bool { playerState == State.buffering || playerState == State.loading || awaitingReceiver() }

  /// Arms the wait for the next item, or cancels it.
  private func endWait(_ armed: Bool) {
    cancelEndWait?()
    cancelEndWait = nil
    guard armed else { return }
    cancelEndWait = deliver(CastEngineConstants.nextItemWaitMs) { [weak self] in
      guard let self else { return }
      self.cancelEndWait = nil
      self.delegate?.engineDidReachEnd(self)
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
    setLoading(isBuffering())
    publishState()
    delegate?.engine(self, didUpdateProgress: position, duration: itemDuration, cacheSeconds: 0)
  }

  // MARK: - Sending, never logged: every message carries the access token

  private func send(_ command: String, _ options: [String: Any], failed: @escaping (String) -> Void = { _ in }) {
    sendMessage(command, ReceiverProtocol.message(command: command, server: server, options: options), failed: failed)
  }

  private func sendMessage(
    _ command: String, _ message: [String: Any], sent: @escaping () -> Void = {}, failed: @escaping (String) -> Void = { _ in }
  ) {
    guard
      let data = try? JSONSerialization.data(withJSONObject: message, options: [.sortedKeys, .withoutEscapingSlashes]),
      let text = String(data: data, encoding: .utf8)
    else {
      log("\(command) could not be encoded")
      return
    }
    log("send \(command)")
    hub.send(namespace: ReceiverProtocol.namespace, text: text) { [weak self] error in
      guard let error else {
        sent()
        return
      }
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
    static let finished = "finished"
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
  func receiverBusDidBecomeReady(sessionId: String) { engine?.onBusReady(sessionId: sessionId) }

  // The session listener ends the binding, with the SDK's reason: the hub's end carries none.
  func receiverBusDidLose(sessionId: String?, ended: Bool) {
    if !ended { engine?.suspendBinding(sessionId: sessionId) }
  }
}

private final class SessionEar: CastSessionListener {
  private weak var engine: CastEngine?

  init(engine: CastEngine) { self.engine = engine }

  func castSessionDidSuspend(sessionId: String?) { engine?.suspendBinding(sessionId: sessionId) }
  func castSessionDidResume(_ session: CastSessionPort) { engine?.resumeBinding(session) }
  func castSessionDidEnd(sessionId: String?, error: String?) { engine?.endBinding(sessionId: sessionId, error: error) }
  func castSessionDidReceiveVolume(_ volume: Double, muted: Bool) { engine?.onVolume(volume) }
}
