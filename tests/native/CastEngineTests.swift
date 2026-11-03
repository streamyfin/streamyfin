import Foundation

// The Cast engine on fake ports, the cases of CastEngineTest.kt under the same names where iOS has
// the call, plus the ones only iOS has: the engine ticks itself, and a paused status reads its
// stream position. The SDK never runs here.

final class FakeMedia: CastMediaPort {
  var status: CastMediaSnapshot?
  var approximatePosition: TimeInterval = 0
  // The SDK's remote media client holds its listeners weakly.
  weak var listener: CastMediaListener?
  private(set) var calls: [String] = []
  private(set) var seeks: [Double] = []
  private(set) var statusRequests = 0
  private var seeksInFlight: [(Bool) -> Void] = []

  func play() { calls.append("play") }
  func pause() { calls.append("pause") }

  func seek(to position: TimeInterval, completion: @escaping (Bool) -> Void) {
    seeks.append(position)
    seeksInFlight.append(completion)
  }

  func requestStatus() { statusRequests += 1 }

  /// The receiver reporting a status: the SDK updates the media status, then calls back.
  func report(_ status: CastMediaSnapshot, position: TimeInterval? = nil) {
    self.status = status
    if let position { approximatePosition = position }
    listener?.castMediaDidUpdateStatus()
  }

  func finishSeek(_ succeeded: Bool) {
    seeksInFlight.removeFirst()(succeeded)
  }
}

final class FakeSession: CastSessionPort {
  let sessionId: String?
  let isConnected: Bool
  var media: CastMediaPort?
  var volume: Double? = 0.5
  private(set) var muted: Bool?
  private(set) var volumes: [Double] = []

  init(sessionId: String? = "session-1", isConnected: Bool = true, media: CastMediaPort? = FakeMedia()) {
    self.sessionId = sessionId
    self.isConnected = isConnected
    self.media = media
  }

  func setVolume(_ level: Double) { volumes.append(level) }
  func setMute(_ muted: Bool) { self.muted = muted }
}

final class FakeSource: CastSessionSource {
  var current: CastSessionPort?
  weak var listener: CastSessionListener?

  init(_ current: CastSessionPort?) { self.current = current }
}

/// A clock that moves only when told to, running what fell due in order, what that schedules included.
final class ManualClock {
  private struct Task {
    let id: Int
    let at: Double
    let run: () -> Void
  }

  private var now = 0.0
  private var lastId = 0
  private var tasks: [Task] = []
  private(set) var delays: [Double] = []
  private(set) var cancellations = 0

  var pending: Int { tasks.count }

  lazy var deliver: CastEngine.Delivery = { [unowned self] delay, run in
    self.lastId += 1
    let id = self.lastId
    self.delays.append(delay)
    self.tasks.append(Task(id: id, at: self.now + delay, run: run))
    return { [unowned self] in
      if let index = self.tasks.firstIndex(where: { $0.id == id }) {
        self.tasks.remove(at: index)
        self.cancellations += 1
      }
    }
  }

  func advance(_ ms: Double) {
    let target = now + ms
    while let next = tasks.filter({ $0.at <= target }).min(by: { $0.at < $1.at || ($0.at == $1.at && $0.id < $1.id) }) {
      tasks.removeAll { $0.id == next.id }
      now = next.at
      next.run()
    }
    now = target
  }
}

final class RecordingDelegate: PlayerEngineDelegate {
  var positions: [Double] = []
  var pauses: [Bool] = []
  var loadings: [Bool] = []
  var errors: [String] = []
  var readyToSeek = 0
  var ended = 0
  var seekRequests: [Double] = []
  var playingRequests: [Bool] = []

  func engine(_ engine: TransportEngine, didLoad config: VideoLoadConfig) {}
  func engine(_ engine: TransportEngine, didUpdateProgress position: Double, duration: Double, cacheSeconds: Double) {
    positions.append(position)
  }
  func engine(_ engine: TransportEngine, didChangePause isPaused: Bool) { pauses.append(isPaused) }
  func engine(_ engine: TransportEngine, didChangeLoading isLoading: Bool) { loadings.append(isLoading) }
  func engine(_ engine: TransportEngine, didBecomeReadyToSeek ready: Bool) { if ready { readyToSeek += 1 } }
  func engine(_ engine: TransportEngine, didBecomeTracksReady ready: Bool) {}
  func engine(_ engine: TransportEngine, didChangePictureInPicture isActive: Bool) {}
  func engine(_ engine: TransportEngine, didFailWithError message: String) { errors.append(message) }
  func engine(_ engine: TransportEngine, didDetectHDRMode mode: HDRMode, fps: Double) {}
  func engineDidReachEnd(_ engine: TransportEngine) { ended += 1 }
  func engine(_ engine: TransportEngine, requestsSeekTo position: Double) { seekRequests.append(position) }
  func engine(_ engine: TransportEngine, requestsSeekBy offset: Double) {}
  func engine(_ engine: TransportEngine, requestsPlaying playing: Bool) { playingRequests.append(playing) }
}

let server = ReceiverServer(
  serverAddress: "https://jellyfin.example.test", accessToken: "tok-123", userId: "user-1",
  receiverName: "Living Room TV", maxBitrate: 8_000_000
)

func ours(_ overrides: [String: Any] = [:]) -> [String: Any] {
  var data: [String: Any] = [
    "itemId": "item-1", "playSessionId": "ps-1", "mediaSourceId": "ms-1", "audioStreamIndex": 1,
    "subtitleStreamIndex": 3, "canSeek": true, "canClientSeek": true, "runtimeTicks": 60_000_000_000 as Int64,
    "startPositionTicks": 0, "playMethod": "Transcode", "liveStreamId": NSNull(),
  ]
  overrides.forEach { data[$0.key] = $0.value }
  return data
}

func snapshot(
  playerState: String = "playing", idleReason: String = "none", customData: [String: Any]? = ours(),
  streamPosition: TimeInterval = 0, streamDuration: TimeInterval = -1, hasTextTracks: Bool = true, hasMedia: Bool = true
) -> CastMediaSnapshot {
  CastMediaSnapshot(
    playerState: playerState, idleReason: idleReason, hasMedia: hasMedia, streamPosition: streamPosition,
    playbackRate: 1, customData: customData, streamDuration: streamDuration, hasTextTracks: hasTextTracks
  )
}

/// A transcoded track the receiver cannot seek in, loaded at 30 s: it reports 12.5 s from there.
let reloadable: [String: Any] = [
  "itemId": "track-1", "playSessionId": "ps-3", "canClientSeek": false,
  "startPositionTicks": 300_000_000 as Int64, "runtimeTicks": 2_400_000_000 as Int64,
]

/// One case's world: the hub with its port, the session and its media, the clock and the host.
final class Bench {
  let hub = ReceiverChannelHub()
  let port = FakeChannelPort()
  let media = FakeMedia()
  lazy var session = FakeSession(media: media)
  lazy var source = FakeSource(session)
  let clock = ManualClock()
  let delegate = RecordingDelegate()
  var logs: [String] = []
  // What a host does: it keeps its engine, which the ports and the hub only hold weakly.
  private(set) var kept: [CastEngine] = []

  func engine() -> CastEngine {
    hub.attach(port)
    let engine = CastEngine(server: server, sessions: source, hub: hub, deliver: clock.deliver, log: { [unowned self] in self.logs.append($0) })
    engine.delegate = delegate
    kept.append(engine)
    try? engine.start()
    return engine
  }

  /// A started engine whose receiver plays our item at `position`.
  func playing(_ position: TimeInterval = 42.5, _ overrides: [String: Any] = [:], hasTextTracks: Bool = true) -> CastEngine {
    let engine = engine()
    media.report(snapshot(customData: ours(overrides), hasTextTracks: hasTextTracks), position: position)
    return engine
  }

  func sentMessages() -> [[String: Any]] {
    port.sent.compactMap { try? JSONSerialization.jsonObject(with: Data($0.text.utf8)) as? [String: Any] }
  }

  /// Each sent message as its command and its options, in sorted JSON.
  func commands() -> [String] {
    sentMessages().map { message in
      let options = (try? JSONSerialization.data(withJSONObject: message["options"] ?? [:], options: [.sortedKeys])).flatMap { String(data: $0, encoding: .utf8) } ?? "?"
      return "\(message["command"] ?? "?") \(options)"
    }
  }
}

func close(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 1e-9 }

let request = ReceiverPlayRequest(items: [ReceiverItem(id: "item-1", name: "A film", type: "Movie")])

func describe(_ result: CastLoadResult) -> String {
  switch result {
  case .settled(let outcome):
    if case .failed(let error, _) = outcome { return "settled failed \(error.rawValue)" }
    return "settled \(outcome.wireName)"
  case .notSent(let error):
    return "notSent \(error)"
  }
}

final class RecordingBinding: CastBindingListener {
  var lost: [String] = []
  func castEngineDidLoseBinding(sessionId: String?, error: String?) {
    lost.append("\(sessionId ?? "nil") \(error ?? "nil")")
  }
}

extension CastEngine {
  /// Loads the common request and keeps what it settles as.
  func loadRecorded() -> () -> [String] {
    var results: [String] = []
    load(server: server, request: request) { results.append(describe($0)) }
    return { results }
  }
}

func json(_ object: [String: Any]) -> String {
  (try? JSONSerialization.data(withJSONObject: object)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
}

func playRequest(_ raw: [String: Any]) -> ReceiverPlayRequest {
  let items = (raw["items"] as? [[String: Any]] ?? []).map { item in
    ReceiverItem(
      id: item["Id"] as? String, name: item["Name"] as? String, type: item["Type"] as? String,
      isFolder: item["IsFolder"] as? Bool ?? false, channelId: item["ChannelId"] as? String,
      channelName: item["ChannelName"] as? String
    )
  }
  return ReceiverPlayRequest(items: items, startIndex: raw["startIndex"] as? Int)
}

func subtitle(_ engine: CastEngine) -> Int {
  var value = -2
  engine.getCurrentSubtitleTrack { value = $0 }
  return value
}

func audio(_ engine: CastEngine) -> Int {
  var value = -2
  engine.getCurrentAudioTrack { value = $0 }
  return value
}

@main
enum CastEngineTests {
  static var failures: [String] = []
  static var cases = 0
  static let ns = ReceiverProtocol.namespace

  static func check(_ name: String, _ ok: Bool) {
    cases += 1
    if !ok { failures.append(name) }
  }

  static func main() {
    let vectors = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "e2e/fixtures/receiver-protocol"

    // Binding and state

    do {
      let bench = Bench()
      _ = bench.engine()
      check(
        "startBindsTheConnectedSessionAndStarts",
        bench.media.listener != nil && bench.media.statusRequests == 1 && bench.hub.isReady(namespace: ns)
      )
    }

    do {
      let bench = Bench()
      bench.source.current = FakeSession(isConnected: false)
      bench.hub.attach(bench.port)
      let engine = CastEngine(server: server, sessions: bench.source, hub: bench.hub, deliver: bench.clock.deliver)
      var thrown = false
      do { try engine.start() } catch CastEngineError.noSession { thrown = true } catch {}
      check("startWithoutAConnectedSessionThrows", thrown && bench.media.listener == nil)
    }

    do {
      let bench = Bench()
      _ = bench.engine()
      ["playing", "playing", "paused", "buffering"].forEach { bench.media.report(snapshot(playerState: $0)) }
      check(
        "playingPausedAndBufferingReachTheDelegateOnce",
        bench.delegate.pauses == [false, true] && bench.delegate.loadings == [false, true]
      )
    }

    do {
      let bench = Bench()
      _ = bench.playing()
      bench.media.report(snapshot(playerState: "idle", idleReason: "error"))
      check("anIdleErrorReportsThePlaybackError", bench.delegate.errors == ["The receiver stopped on a playback error"])
    }

    do {
      let bench = Bench()
      _ = bench.engine()
      bench.media.report(snapshot())
      bench.media.report(snapshot())
      let once = bench.delegate.readyToSeek == 1
      bench.media.report(snapshot(customData: ours(["playSessionId": "ps-2"])))
      check("canSeekMakesTheEngineReadyToSeekOncePerPlaySession", once && bench.delegate.readyToSeek == 2)
    }

    // Position and duration

    do {
      let bench = Bench()
      _ = bench.engine()
      bench.clock.advance(5_000)
      check("noPositionBeforeAStatusWithMedia", bench.delegate.positions.isEmpty)
    }

    do {
      let bench = Bench()
      let engine = bench.playing()
      let runtime = engine.getDuration() == 6000
      bench.media.report(snapshot(customData: ours(["runtimeTicks": NSNull()]), streamDuration: 120))
      let stream = engine.getDuration() == 120
      bench.media.report(snapshot(customData: ours(["runtimeTicks": NSNull()]), streamDuration: .infinity))
      check("durationIsTheRuntimeThenTheStreamThenZero", runtime && stream && engine.getDuration() == 0)
    }

    do {
      let url = URL(fileURLWithPath: vectors).appendingPathComponent("media-position.json")
      let file = (try? JSONSerialization.jsonObject(with: Data(contentsOf: url))) as? [String: Any]
      let positionCases = (file?["cases"] as? [[String: Any]]) ?? []
      var all = !positionCases.isEmpty
      for positionCase in positionCases {
        guard let input = positionCase["input"] as? [String: Any], let expected = positionCase["expected"] as? Double else {
          all = false
          continue
        }
        let bench = Bench()
        let engine = bench.engine()
        bench.media.report(snapshot(customData: input["customData"] as? [String: Any]), position: (input["currentTime"] as? Double) ?? 0)
        if !close(engine.getCurrentPosition(), expected) {
          all = false
          print("media-position.json: \(positionCase["name"] ?? "?") gave \(engine.getCurrentPosition())")
        }
      }
      check("mediaPositionThroughTheEngine", all)
    }

    // Transport

    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.play()
      engine.pause()
      check("transportUsesTheMediaChannel", bench.media.calls == ["play", "pause"] && bench.port.sent.isEmpty)
    }

    do {
      let bench = Bench()
      bench.session.media = nil
      let engine = bench.engine()
      engine.play()
      engine.pause()
      check("transportWithoutAMediaSessionDoesNothing", bench.media.calls.isEmpty)
    }

    // Seeks

    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.seekTo(position: 125.6)
      check("aSeekTheReceiverCanDoGoesThroughTheMediaChannel", bench.media.seeks == [125.6] && bench.port.sent.isEmpty)
    }

    do {
      let bench = Bench()
      let engine = bench.playing(42.5, ["canSeek": false])
      engine.seekTo(position: 10)
      bench.media.report(snapshot(playerState: "idle", idleReason: "cancelled"))
      engine.seekTo(position: 10)
      check("aSeekIsIgnoredOnLiveOrIdle", bench.media.seeks.isEmpty && bench.port.sent.isEmpty)
    }

    // Vigilance 3: a Seek the receiver reloads for must not jump to the old start plus the new time.
    do {
      let bench = Bench()
      let engine = bench.playing(12.5, reloadable)
      let before = close(engine.getCurrentPosition(), 42.5)
      engine.seekTo(position: 125.6)
      let sent = bench.commands().last == #"Seek {"position":126}"#
      let held = close(engine.getCurrentPosition(), 125.6)
      bench.media.approximatePosition = 13
      bench.clock.advance(1_000)
      let stillHeld = close(engine.getCurrentPosition(), 125.6)
      var next = reloadable
      next["playSessionId"] = "ps-4"
      next["startPositionTicks"] = 1_260_000_000 as Int64
      bench.media.report(snapshot(customData: ours(next)), position: 0.5)
      check(
        "aSeekTheReceiverCannotDoHoldsTheTargetUntilTheNewPlaySession",
        before && sent && held && stillHeld && close(engine.getCurrentPosition(), 126.5) && bench.delegate.loadings.last == false
      )
    }

    // iOS has no tracked seek: a seek shows up as the position of the next status, the target's.
    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.seekTo(position: 125.6)
      bench.media.finishSeek(true)
      bench.media.report(snapshot(), position: 125.6)
      let standard = bench.delegate.positions.last.map { close($0, 125.6) } ?? false
      bench.media.report(snapshot(customData: ours(reloadable)), position: 12.5)
      engine.seekTo(position: 126.5)
      var next = reloadable
      next["playSessionId"] = "ps-4"
      next["startPositionTicks"] = 1_260_000_000 as Int64
      bench.media.report(snapshot(customData: ours(next)), position: 0.5)
      let reloaded = bench.delegate.positions.last.map { close($0, 126.5) } ?? false
      check("aSeekIsReportedAtTheStatusThatHasIt", standard && reloaded)
    }

    do {
      let bench = Bench()
      let engine = bench.playing(42.5)
      engine.seekBy(offset: 30)
      check("seekByAddsToThePositionInTheItem", bench.media.seeks.count == 1 && close(bench.media.seeks[0], 72.5))
    }

    do {
      let bench = Bench()
      let engine = bench.playing(12.5, reloadable)
      engine.seekTo(position: 125.6)
      bench.clock.advance(29_999)
      let notYet = bench.delegate.errors.isEmpty
      bench.clock.advance(1)
      // Back to what the receiver reports: 12.5 s into a stream loaded at 30 s.
      check(
        "aReloadThatNeverSettlesGivesUpAfterThirtySeconds",
        notYet && bench.delegate.errors == ["timed_out"] && close(engine.getCurrentPosition(), 42.5)
      )
    }

    // Tracks and calls that do nothing

    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.setSubtitleTrack(3)
      engine.disableSubtitles()
      check(
        "aSubtitleChangeSendsTheJellyfinIndex",
        bench.commands() == [#"SetSubtitleStreamIndex {"index":3}"#, #"SetSubtitleStreamIndex {"index":-1}"#]
      )
    }

    // No text track loaded: the receiver would name the index in its reports and show nothing.
    do {
      let bench = Bench()
      let engine = bench.playing(42.5, hasTextTracks: false)
      engine.setSubtitleTrack(3)
      let request = ReceiverPlayRequest(
        items: [ReceiverItem(id: "item-1")], startPositionTicks: 425_000_000, mediaSourceId: "ms-1",
        audioStreamIndex: 1, subtitleStreamIndex: 3
      )
      let expected = (try? ReceiverProtocol.playNow(server: server, request: request)) ?? [:]
      let sent = bench.sentMessages()
      check(
        "aSubtitleChangeWithoutTextTracksReloadsThroughPlayNow",
        sent.count == 1 && NSDictionary(dictionary: sent[0]).isEqual(to: expected)
      )
    }

    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.setAudioTrack(2)
      let sent = bench.commands() == [#"SetAudioStreamIndex {"index":2}"#]
      let loading = bench.delegate.loadings.last == true
      bench.media.report(snapshot())
      let stillLoading = bench.delegate.loadings.last == true
      bench.media.report(snapshot(customData: ours(["playSessionId": "ps-2", "audioStreamIndex": 2])))
      check(
        "anAudioChangeSendsSetAudioStreamIndexAndWaitsForTheReload",
        sent && loading && stillLoading && bench.delegate.loadings.last == false
      )
    }

    do {
      let bench = Bench()
      let engine = bench.engine()
      bench.media.report(snapshot(customData: nil))
      engine.setSubtitleTrack(3)
      engine.disableSubtitles()
      engine.setAudioTrack(2)
      check("trackCommandsWithoutOurMediaSendNothing", bench.port.sent.isEmpty)
    }

    do {
      let bench = Bench()
      let engine = bench.playing()
      let fromCustomData = subtitle(engine) == 3 && audio(engine) == 1
      bench.port.deliver(#"{"type":"playbackprogress","data":{"PlayState":{"SubtitleStreamIndex":5,"AudioStreamIndex":2,"PlaySessionId":"ps-1"}}}"#)
      let fromBus = subtitle(engine) == 5 && audio(engine) == 2
      bench.media.report(snapshot(playerState: "idle", customData: nil, hasMedia: false))
      var lists: [[[String: Any]]] = []
      engine.getSubtitleTracks { lists.append($0) }
      engine.getAudioTracks { lists.append($0) }
      check(
        "trackGettersReadTheBusThenTheCustomData",
        fromCustomData && fromBus && subtitle(engine) == -1 && audio(engine) == -1 && lists.count == 2 && lists.allSatisfy { $0.isEmpty }
      )
    }

    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.setSpeed(speed: 2)
      engine.setAudioDelay(1)
      engine.setVolumeBoost(150)
      engine.setDialogueBoost(true)
      engine.setMonoDownmix(true)
      engine.addSubtitleFile(url: "https://jellyfin.example.test/sub.vtt", select: true)
      check(
        "speedStaysAtOneAndLocalOnlyCallsDoNothing",
        engine.getSpeed() == 1 && bench.port.sent.isEmpty && bench.media.calls.isEmpty
      )
    }

    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.loadVideo(config: VideoLoadConfig(url: URL(string: "https://jellyfin.example.test/stream")!), force: false)
      check("aUrlLoadIsRefused", bench.delegate.errors == ["The Cast engine plays Jellyfin items, not URLs"])
    }

    // Volume, identity and detaching

    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.setMute(true)
      engine.setTargetVolume(0.3)
      let sent = bench.session.muted == true && bench.session.volumes == [0.3]
      bench.source.listener?.castSessionDidReceiveVolume(0.25, muted: false)
      check("muteAndTargetVolumeUseTheSession", sent && engine.targetVolume == 0.25)
    }

    do {
      let bench = Bench()
      let engine = bench.playing()
      let ours = engine.currentItemId == "item-1"
      bench.media.report(snapshot(customData: nil))
      check("currentItemIdIsOurCustomDataItem", ours && engine.currentItemId == nil)
    }

    // Shutting the engine down never stops the TV.
    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.shutdown()
      check(
        "stopDetachesAndSendsNothing",
        bench.media.listener == nil && bench.port.unregistrations == [ns] && bench.port.sent.isEmpty && !bench.media.calls.contains("stop")
      )
    }

    do {
      let bench = Bench()
      let engine = bench.playing(12.5, reloadable)
      engine.seekTo(position: 125.6)
      engine.setSubtitleTrack(3)
      engine.setAudioTrack(2)
      check(
        "noSentMessageIsLogged",
        !bench.port.sent.isEmpty && !bench.logs.isEmpty && !bench.logs.contains { $0.contains("tok-123") }
      )
    }

    // What only iOS has

    // destroy() forgets the item, as the mpv engine rebuilds its handle there, and keeps the binding.
    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.destroy()
      let forgotten = engine.currentItemId == nil && engine.getCurrentPosition() == 0 && engine.getDuration() == 0
      let bound = bench.media.listener != nil && bench.port.unregistrations.isEmpty
      bench.media.report(snapshot(), position: 10)
      check("destroyForgetsTheItemAndKeepsTheBinding", forgotten && bound && engine.currentItemId == "item-1")
    }

    // No progress listener on iOS: the engine asks for a delivery every second while media plays.
    do {
      let bench = Bench()
      let engine = bench.playing()
      let afterStatus = bench.delegate.positions.count
      bench.clock.advance(3_000)
      let ticks = bench.delegate.positions.count - afterStatus
      let everySecond = bench.clock.delays.allSatisfy { $0 == 1_000 } && bench.clock.delays.count == 4
      engine.shutdown()
      check(
        "theEngineTicksEverySecondWhileMediaPlays",
        ticks == 3 && everySecond && bench.clock.cancellations == 1 && bench.clock.pending == 0
      )
    }

    // The SDK extrapolates the approximate position while playing only: paused, the status has it.
    do {
      let bench = Bench()
      let engine = bench.engine()
      bench.media.approximatePosition = 50
      bench.media.report(snapshot(playerState: "paused", streamPosition: 42))
      check("aPausedStatusReportsItsStreamPosition", engine.getCurrentPosition() == 42)
    }

    do {
      let bench = Bench()
      let engine = bench.playing()
      bench.media.report(snapshot(playerState: "paused"))
      engine.play()
      let afterPlay = engine.intendedPlayState
      bench.media.report(snapshot(playerState: "paused"))
      check("intendedPlayStateFollowsTheCommandsAndTheStatus", afterPlay && !engine.intendedPlayState)
    }

    // The host keeps its own position bookkeeping: the system's requests go to it, untouched.
    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.requestSeek(to: 12)
      engine.requestPlaying(false)
      check(
        "requestsGoThroughTheHost",
        bench.delegate.seekRequests == [12] && bench.delegate.playingRequests == [false] && bench.media.seeks.isEmpty && bench.media.calls.isEmpty
      )
    }

    // Loading

    do {
      let bench = Bench()
      _ = bench.engine().loadRecorded()
      let expected = (try? ReceiverProtocol.playNow(server: server, request: request)) ?? [:]
      let sent = bench.sentMessages()
      check(
        "aLoadSendsOnePlayNowBuiltByTheProtocol",
        sent.count == 1 && NSDictionary(dictionary: sent[0]).isEqual(to: expected) && bench.delegate.loadings == [true]
          && !bench.logs.contains { $0.contains("tok-123") }
      )
    }

    // Each case of load-outcomes.json through the engine's own deadline, port and media channel.
    do {
      let url = URL(fileURLWithPath: vectors).appendingPathComponent("load-outcomes.json")
      let file = (try? JSONSerialization.jsonObject(with: Data(contentsOf: url))) as? [String: Any] ?? [:]
      var all = file["timeoutMs"] as? Double == CastEngineConstants.loadTimeoutMs
      for outcomeCase in file["cases"] as? [[String: Any]] ?? [] {
        let name = outcomeCase["name"] as? String ?? "?"
        let sent = playRequest(outcomeCase["request"] as? [String: Any] ?? file["request"] as? [String: Any] ?? [:])
        let bench = Bench()
        let engine = bench.engine()
        if let previous = outcomeCase["previous"] as? [String: Any] { bench.media.report(snapshot(customData: previous)) }
        var results: [CastLoadResult] = []
        engine.load(server: server, request: sent) { results.append($0) }
        let expected = outcomeCase["expected"] as? [String: Any] ?? [:]
        if expected["refused"] as? String == "container" {
          let refused: Bool
          if case .notSent = results.first { refused = results.count == 1 } else { refused = false }
          if !refused || !bench.port.sent.isEmpty {
            all = false
            print("load-outcomes.json: \(name) was not refused")
          }
          continue
        }
        for event in outcomeCase["events"] as? [[String: Any]] ?? [] {
          if let status = event["status"] as? [String: Any] {
            bench.media.report(snapshot(playerState: status["playerState"] as? String ?? "unknown", customData: status))
          } else if let message = event["message"] as? [String: Any] {
            bench.port.deliver(json(message))
          } else if event["timeout"] as? Bool == true {
            bench.clock.advance(CastEngineConstants.loadTimeoutMs)
          } else if event["supersede"] as? Bool == true {
            engine.load(server: server, request: sent) { _ in }
          }
        }
        var want = "settled \(expected["status"] as? String ?? "?")"
        if let error = expected["error"] as? String { want = "settled failed \(error)" }
        let got = results.first.map(describe) ?? "nothing"
        if got != want {
          all = false
          print("load-outcomes.json: \(name) gave \(got), expected \(want)")
        }
      }
      check("loadOutcomesThroughTheEngine", all)
    }

    do {
      let bench = Bench()
      bench.source.current = nil
      let results = bench.engine().loadRecorded()
      check("aLoadWithoutSessionIsNotSent", results() == ["notSent No connected Cast session"] && bench.port.sent.isEmpty)
    }

    do {
      let bench = Bench()
      bench.port.sendError = "receiver busy"
      let results = bench.engine().loadRecorded()
      check("aLoadTheChannelCannotSendIsNotSentAndLeavesNoTimer", results() == ["notSent receiver busy"] && bench.clock.pending == 0)
    }

    do {
      let bench = Bench()
      let results = bench.engine().loadRecorded()
      let loading = bench.delegate.loadings == [true]
      bench.media.report(snapshot())
      check(
        "aPendingLoadIsLoadingUntilItSettles",
        loading && results() == ["settled loaded"] && bench.delegate.loadings == [true, false]
      )
    }

    do {
      let bench = Bench()
      _ = bench.playing()
      bench.port.deliver(#"{"type":"playbackerror","message":"NotAllowed"}"#)
      check("aBusErrorOutsideALoadReportsItsWireName", bench.delegate.errors == ["playback_failed"])
    }

    // Reloads and the queue

    do {
      let bench = Bench()
      let engine = bench.playing(42.5)
      bench.port.deliver(#"{"type":"playbackprogress","data":{"PlayState":{"AudioStreamIndex":2,"SubtitleStreamIndex":5}}}"#)
      engine.reloadCurrentItem()
      let replay = ReceiverPlayRequest(
        items: [ReceiverItem(id: "item-1")], startPositionTicks: 425_000_000, mediaSourceId: "ms-1",
        audioStreamIndex: 2, subtitleStreamIndex: 5
      )
      let expected = (try? ReceiverProtocol.playNow(server: server, request: replay)) ?? [:]
      let sent = bench.sentMessages()
      check("reloadCurrentItemPlaysTheItemAgainWhereItIs", sent.count == 1 && NSDictionary(dictionary: sent[0]).isEqual(to: expected))
    }

    do {
      let bench = Bench()
      let engine = bench.playing(2)
      engine.skipToNext()
      engine.skipToPrevious()
      let skips = bench.commands() == ["NextTrack {}", "PreviousTrack {}"]
      engine.enqueue(itemIds: (0..<250).map { "id-\($0)" })
      let appended = Array(bench.sentMessages().dropFirst(2))
      let sizes = appended.map { (($0["options"] as? [String: Any])?["items"] as? [Any])?.count ?? -1 }
      let first = ((appended.first?["options"] as? [String: Any])?["items"] as? [[String: Any]])?.first ?? [:]
      check(
        "queueCommandsReachTheReceiver",
        skips && appended.map { $0["command"] as? String } == ["PlayLast", "PlayLast", "PlayLast"] && sizes == [100, 100, 50]
          && NSDictionary(dictionary: first).isEqual(to: ["Id": "id-0", "IsFolder": false])
      )
    }

    // The receiver never goes back to the start of the item it plays: past three seconds the engine
    // seeks there, as the chrome's own previous does.
    do {
      let bench = Bench()
      let engine = bench.playing(42.5)
      engine.skipToPrevious()
      check("aPreviousPastThreeSecondsRestartsTheItem", bench.media.seeks == [0] && bench.port.sent.isEmpty)
    }

    // The end of an item

    // Vigilance 4: after IDLE + FINISHED the receiver fetches the next item before it buffers.
    do {
      let bench = Bench()
      _ = bench.playing()
      bench.media.report(snapshot(playerState: "idle", idleReason: "finished"))
      bench.clock.advance(14_999)
      let notYet = bench.delegate.ended == 0
      bench.clock.advance(1)
      check("aFinishedItemWithNoNextEndsAfterFifteenSeconds", notYet && bench.delegate.ended == 1)
    }

    do {
      let bench = Bench()
      _ = bench.playing()
      bench.media.report(snapshot(playerState: "idle", idleReason: "finished"))
      bench.clock.advance(5_000)
      bench.media.report(snapshot(playerState: "buffering", customData: ours(["itemId": "item-2", "playSessionId": "ps-2"])))
      bench.clock.advance(15_000)
      check("aNextItemWithinTheWaitCancelsTheEnd", bench.delegate.ended == 0)
    }

    // The session's life

    do {
      let bench = Bench()
      let engine = bench.playing()
      let results = engine.loadRecorded()
      bench.source.listener?.castSessionDidSuspend(sessionId: "session-1")
      check(
        "aSuspendKeepsTheStateAndShowsLoading",
        bench.delegate.loadings.last == true && engine.currentItemId == "item-1" && results().isEmpty
      )
    }

    do {
      let bench = Bench()
      _ = bench.playing()
      bench.source.listener?.castSessionDidSuspend(sessionId: "session-1")
      let media2 = FakeMedia()
      bench.source.listener?.castSessionDidResume(FakeSession(media: media2))
      check(
        "aResumeRebindsTheNewMediaClientAndRefreshes",
        bench.media.listener == nil && media2.listener != nil && media2.statusRequests == 1
      )
    }

    // Vigilance 1: a status the replaced media client had queued arrives after the new binding.
    do {
      let bench = Bench()
      let engine = bench.playing()
      let pausesBefore = bench.delegate.pauses
      let stale = bench.media.listener
      bench.source.listener?.castSessionDidResume(FakeSession(media: FakeMedia()))
      bench.media.status = snapshot(playerState: "paused", customData: ours(["playSessionId": "ps-9"]))
      stale?.castMediaDidUpdateStatus()
      check(
        "aStatusFromTheMediaClientBeforeTheResumeIsIgnored",
        stale != nil && bench.delegate.pauses == pausesBefore && engine.currentItemId == "item-1"
      )
    }

    // The receiver sends its bus to the last sender that spoke: after a resume, a load's engine has
    // to speak first to hear the receiver again (spec §8, risk 6).
    do {
      let bench = Bench()
      _ = bench.engine().loadRecorded()
      bench.hub.suspend()
      let port2 = FakeChannelPort()
      bench.hub.attach(port2)
      let sent = port2.sent.compactMap { try? JSONSerialization.jsonObject(with: Data($0.text.utf8)) as? [String: Any] }
      check(
        "aResumeAfterALoadReclaimsTheBusWithAnInertCommand",
        sent.count == 1 && sent[0]["command"] as? String == "SetVolume" && (sent[0]["options"] as? [String: Any])?.isEmpty == true
      )
    }

    do {
      let bench = Bench()
      _ = bench.playing()
      bench.hub.suspend()
      let port2 = FakeChannelPort()
      bench.hub.attach(port2)
      check("aResumeWithoutALoadSendsNothing", port2.sent.isEmpty)
    }

    do {
      let bench = Bench()
      let engine = bench.playing()
      let binding = RecordingBinding()
      engine.bindingListener = binding
      bench.source.listener?.castSessionDidResume(FakeSession(sessionId: "session-2"))
      check("aResumeOnAnotherSessionLosesTheBinding", binding.lost == ["session-1 The Cast session was replaced"])
    }

    do {
      let bench = Bench()
      let engine = bench.playing()
      let binding = RecordingBinding()
      engine.bindingListener = binding
      let results = engine.loadRecorded()
      bench.source.listener?.castSessionDidEnd(sessionId: "session-1", error: nil)
      check(
        "theSessionEndingSupersedesThePendingLoadAndLosesTheBinding",
        results() == ["settled superseded"] && binding.lost == ["session-1 nil"]
      )
    }

    // The SDK reports every session: another one's suspend or end leaves this binding alone.
    do {
      let bench = Bench()
      let engine = bench.playing()
      let binding = RecordingBinding()
      engine.bindingListener = binding
      bench.source.listener?.castSessionDidSuspend(sessionId: "session-9")
      bench.source.listener?.castSessionDidEnd(sessionId: "session-9", error: "Network error")
      check(
        "anotherSessionsSuspendOrEndLeavesTheBinding",
        binding.lost.isEmpty && bench.delegate.loadings == [false] && bench.media.listener != nil
      )
    }

    // The device proof reads these lines (e2e/suites/cast/README.md): transitions, never a message.
    do {
      let bench = Bench()
      let engine = bench.playing()
      engine.seekTo(position: 10, exact: false)
      engine.setAudioTrack(2)
      bench.media.report(snapshot(customData: ours(["playSessionId": "ps-2", "audioStreamIndex": 2])), position: 10)
      engine.load(server: server, request: ReceiverPlayRequest(items: [ReceiverItem(id: "item-2")])) { _ in }
      bench.media.report(snapshot(customData: ours(["itemId": "item-2", "playSessionId": "ps-3", "canClientSeek": false])))
      engine.seekTo(position: 20, exact: false)
      bench.media.report(snapshot(playerState: "idle", idleReason: "finished", customData: nil, hasMedia: false))
      bench.source.listener?.castSessionDidEnd(sessionId: "session-1", error: nil)
      check(
        "logsEachTransitionTheDeviceProofReads",
        bench.logs == [
          "bound to session session-1",
          "status playing playSession=ps-1 playMethod=Transcode canClientSeek=true",
          "seek 10.0 path=media",
          "send SetAudioStreamIndex",
          "reload settled loaded",
          "status playing playSession=ps-2 playMethod=Transcode canClientSeek=true",
          "send PlayNow",
          "load settled loaded",
          "status playing playSession=ps-3 playMethod=Transcode canClientSeek=false",
          "seek 20.0 path=bus",
          "send Seek",
          "idle finished, waiting for the next item",
          "binding lost session=session-1 error=nil",
          "detached from session session-1",
        ]
      )
    }

    // iOS cannot tell who launched the receiver app: media there at the binding means another sender
    // spoke first, nothing there means it is not known (spec §5.4).
    do {
      let empty = Bench()
      let unknown = empty.engine().receiverIdentityIsOurs == nil
      let taken = Bench()
      taken.media.status = snapshot(customData: ours())
      check(
        "identityIsUnknownOnAnEmptyReceiverAndNotOursWhenMediaWasThere",
        unknown && taken.engine().receiverIdentityIsOurs == false
      )
    }

    // The debug probe on the real engine and fake ports: each step reaches the receiver through the
    // channel the engine picks for it, in the order and at the offsets the device proof reads them.
    do {
      let bench = Bench()
      let engine = bench.playing()
      let script = CastEngineProbeScript(engine: engine, server: server, deliver: bench.clock.deliver, log: { [unowned bench] in bench.logs.append($0) })
      withExtendedLifetime(script) {
        script.run()
        bench.clock.advance(80_000)
      }
      let sent = bench.sentMessages()
      let volumes = bench.session.volumes
      check(
        "runsEveryStepOnTheRealEngineInOrder",
        bench.media.calls == ["pause", "play"]
          // No status follows the reloads, so the position they hold stays at 42.5.
          && bench.media.seeks == [72.5, 72.5]
          && volumes.count == 2 && close(volumes[0], 0.4) && close(volumes[1], 0.5)
          && sent.map { $0["command"] as? String ?? "?" } == ["SetAudioStreamIndex", "SetSubtitleStreamIndex", "PlayNow", "NextTrack"]
          && (sent[2]["maxBitrate"] as? NSNumber)?.int64Value == 192_000
          && bench.media.listener == nil
          && bench.logs.filter { $0.hasPrefix("step ") } == CastEngineProbeScript.steps.map { "step \($0.1)" }
          && !bench.logs.contains { $0.contains("tok-123") }
      )
    }

    // The probe arms on the hub: the first PlayNow JS sends binds one engine, on the server the
    // message named, and the script starts at the first playing of that item.
    do {
      let bench = Bench()
      bench.hub.attach(bench.port)
      var made: [ReceiverServer] = []
      let probe = CastEngineProbe(
        hub: bench.hub,
        makeEngine: { [unowned bench] in
          made.append($0)
          return CastEngine(server: $0, sessions: bench.source, hub: bench.hub, deliver: bench.clock.deliver, log: { bench.logs.append($0) })
        },
        deliver: bench.clock.deliver,
        log: { [unowned bench] in bench.logs.append($0) }
      )
      let playNow = json((try? ReceiverProtocol.playNow(server: server, request: ReceiverPlayRequest(items: [ReceiverItem(id: "item-1")]))) ?? [:])
      var bound = false
      var waited = false
      var started = false
      withExtendedLifetime(probe) {
        probe.arm()
        bench.hub.send(namespace: ReceiverProtocol.namespace, text: playNow) { _ in }
        bench.hub.send(namespace: ReceiverProtocol.namespace, text: playNow) { _ in }
        bench.clock.advance(0)
        // One engine per arming, on the server the message named.
        bound = made.count == 1 && made[0].serverAddress == server.serverAddress && made[0].accessToken == server.accessToken
          && made[0].userId == server.userId && made[0].receiverName == server.receiverName && made[0].maxBitrate == server.maxBitrate
          && bench.media.listener != nil
        // What the TV played before is not the item JS loads.
        bench.media.report(snapshot(customData: ours(["itemId": "item-0", "playSessionId": "ps-0"])), position: 10)
        bench.clock.advance(5_000)
        waited = bench.media.calls.isEmpty
        bench.media.report(snapshot(), position: 42.5)
        bench.clock.advance(5_000)
        started = bench.media.calls == ["pause"]
        bench.clock.advance(75_000)
      }
      check(
        "theFirstPlayNowJsSendsBindsOneEngineThatRunsTheScriptAtThatItem",
        bound && waited && started
          // The detach step ends the run: the engine lets go and the hub stops reporting sends.
          && bench.media.listener == nil && bench.hub.sendObserver == nil
          && bench.logs.filter { $0.hasPrefix("bus sent ") }
            == ["PlayNow", "PlayNow", "SetAudioStreamIndex", "SetSubtitleStreamIndex", "PlayNow", "NextTrack"].map { "bus sent \($0)" }
          && !bench.logs.contains { $0.contains("tok-123") }
      )
    }

    if failures.isEmpty {
      print("PASS: Cast engine (\(cases) cases)")
    } else {
      failures.forEach { print("FAIL: " + $0) }
      exit(1)
    }
  }
}
