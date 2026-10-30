import Foundation

/// What every message carries: the receiver re-reads the server and the token on each one.
struct ReceiverServer {
  let serverAddress: String
  let accessToken: String
  let userId: String
  var receiverName: String? = nil
  /// Bit/s; none sends `ReceiverProtocol.uncappedBitrate`.
  var maxBitrate: Int64? = nil
}

/// The fields of an item the receiver reads; it fetches the rest from the server.
struct ReceiverItem {
  var id: String?
  var name: String? = nil
  var type: String? = nil
  var mediaType: String? = nil
  var isFolder = false
  var channelId: String? = nil
  var channelName: String? = nil
}

struct ReceiverPlayRequest {
  var items: [ReceiverItem]
  var startIndex: Int? = nil
  var startPositionTicks: Int64? = nil
  var mediaSourceId: String? = nil
  var audioStreamIndex: Int? = nil
  var subtitleStreamIndex: Int? = nil
  var liveStreamId: String? = nil
}

/// The parts of a Cast device the receiver's Jellyfin device name comes from.
struct ReceiverDevice {
  let friendlyName: String?
  let deviceId: String?
}

struct QueueWindow<T> {
  let items: [T]
  let startIndex: Int
}

/// A message from the receiver's bus: JSON as it sent it, or the raw text when it is not JSON.
enum ReceiverMessage {
  case parsed([String: Any])
  case unparsed(String)

  var type: String? {
    if case .parsed(let json) = self, let type = json["type"] as? String, !type.isEmpty { return type }
    return nil
  }
}

/// Why the receiver failed a load, named after what its bus message means.
enum ReceiverLoadError: String {
  /// connectionerror: its PlaybackInfo request failed (network, 401, 400, 500).
  case playbackInfoFailed = "playback_info_failed"
  /// playbackerror: PlaybackInfo answered NotAllowed, NoCompatibleStream or RateLimitExceeded.
  case playbackFailed = "playback_failed"
  /// error: the message lacked a required field.
  case rejected
}

/// The receiver's media customData, every field optional: media another sender loaded has none.
struct ReceiverCustomData {
  var itemId: String? = nil
  var playSessionId: String? = nil
  var audioStreamIndex: Int? = nil
  var subtitleStreamIndex: Int? = nil
  var mediaSourceId: String? = nil
  var playMethod: String? = nil
  var runtimeTicks: Int64? = nil
  var startPositionTicks: Int64? = nil
  var canSeek: Bool? = nil
  var canClientSeek: Bool? = nil
  var liveStreamId: String? = nil
}

/// The Jellyfin receiver's protocol (F007D354, receiver 1.3.2), as utils/cast/jellyfinReceiver.ts
/// speaks it: both replay e2e/fixtures/receiver-protocol, so they cannot drift apart. No SDK import
/// and no platform guard, so scripts/ios/test-receiver-protocol.sh compiles it alone.
enum ReceiverProtocol {
  static let namespace = "urn:x-cast:com.connectsdk"
  static let fallbackName = "Chromecast"
  static let fallbackIdLength = 8
  /// The cap sent when the user picked none: the receiver keeps the last cap it was given for as
  /// long as its app runs, so a message without one would leave an earlier cast's cap in place.
  /// Same value as RECEIVER_UNCAPPED_BITRATE in constants/Cast.ts.
  static let uncappedBitrate: Int64 = 120_000_000
  static let ticksPerSecond = 10_000_000.0

  /// A playlist, an artist or a genre sent first plays through its children, as any folder does.
  private static let playedThroughChildren: Set<String> = ["Playlist", "MusicArtist", "MusicGenre"]

  /// JavaScript's `\s` (the receiver cleans its name with it), as UTF-16 code units: Foundation's
  /// and ICU's whitespace classes differ from it, so the set is written out.
  private static let jsWhitespace: Set<UInt16> = Set(
    [0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF]
      + Array(0x2000...0x200A)
  )

  private static func isAsciiWord(_ unit: UInt16) -> Bool {
    (0x30...0x39).contains(unit) || (0x41...0x5A).contains(unit) || (0x61...0x7A).contains(unit) || unit == 0x5F
  }

  /// One message: the receiver drops any that lacks command, serverAddress or accessToken.
  static func message(command: String, server: ReceiverServer, options: [String: Any] = [:]) -> [String: Any] {
    var sent = options
    // Seek takes seconds, and the receiver turns them into ticks unrounded, which the server may reject.
    if command == "Seek", let position = number(options["position"]) {
      sent["position"] = Int64((position + 0.5).rounded(.down))
    }
    var message: [String: Any] = [
      "command": command,
      "serverAddress": server.serverAddress,
      "accessToken": server.accessToken,
      "userId": server.userId,
      "maxBitrate": server.maxBitrate.flatMap { $0 > 0 ? $0 : nil } ?? uncappedBitrate,
      "options": sent,
    ]
    if let name = server.receiverName, !name.isEmpty { message["receiverName"] = name }
    return message
  }

  /// A guide program is not playable itself, and the receiver has no lookup from a program to its
  /// channel: its channel plays instead, live, with none of the program's stream picks.
  static func toReceiverRequest(_ request: ReceiverPlayRequest) -> ReceiverPlayRequest {
    guard request.items.count == 1, let first = request.items.first, first.type == "Program", let channelId = first.channelId else {
      return request
    }
    let channel = ReceiverItem(id: channelId, name: first.channelName ?? first.name, type: "TvChannel", mediaType: "Video", isFolder: false)
    return ReceiverPlayRequest(items: [channel])
  }

  static func playNow(server: ReceiverServer, request: ReceiverPlayRequest) -> [String: Any] {
    let sent = toReceiverRequest(request)
    var options: [String: Any] = [:]
    if let value = sent.startIndex { options["startIndex"] = value }
    if let value = sent.startPositionTicks { options["startPositionTicks"] = value }
    if let value = sent.mediaSourceId { options["mediaSourceId"] = value }
    if let value = sent.audioStreamIndex { options["audioStreamIndex"] = value }
    if let value = sent.subtitleStreamIndex { options["subtitleStreamIndex"] = value }
    if let value = sent.liveStreamId { options["liveStreamId"] = value }
    // The receiver reads only these and refetches the rest: whole items would pass Cast's 64 KB limit.
    options["items"] = sent.items.map(slim)
    return message(command: "PlayNow", server: server, options: options)
  }

  private static func slim(_ item: ReceiverItem) -> [String: Any] {
    var slimmed: [String: Any] = ["IsFolder": item.isFolder]
    if let value = item.id { slimmed["Id"] = value }
    if let value = item.name { slimmed["Name"] = value }
    if let value = item.type { slimmed["Type"] = value }
    if let value = item.mediaType { slimmed["MediaType"] = value }
    return slimmed
  }

  /// The part of a queue that fits one PlayNow and keeps the selected item, and its index in it.
  static func queueWindow<T>(_ queue: [T], selectedIndex: Int, maxItems: Int) -> QueueWindow<T> {
    let selected = max(0, min(selectedIndex, queue.count - 1))
    let start = max(0, min(selected, queue.count - maxItems))
    let end = min(queue.count, start + maxItems)
    return QueueWindow(items: Array(queue[start..<max(start, end)]), startIndex: selected - start)
  }

  /// The receiver's own cleanup of the name it is given, before it uses it as its device name.
  static func toReceiverDeviceName(_ receiverName: String) -> String {
    String(decoding: receiverName.utf16.filter { isAsciiWord($0) || jsWhitespace.contains($0) }, as: UTF16.self)
  }

  /// The name to hand the receiver. It keeps only ASCII letters, digits, `_` and whitespace, then
  /// calls btoa() on the rest, so a whitespace above U+00FF (which btoa refuses) becomes a plain
  /// space, and a name with no ASCII letter or digit falls back to "Chromecast" and the id's tail.
  static func receiverNameFor(_ device: ReceiverDevice?) -> String? {
    guard let device else { return nil }
    let units = (device.friendlyName ?? "").utf16.map { jsWhitespace.contains($0) && $0 > 0xFF ? 0x20 : $0 }
    let name = String(decoding: units, as: UTF16.self)
    if toReceiverDeviceName(name).utf16.contains(where: isAsciiWord) { return name }
    let idUnits = (device.deviceId ?? "").utf16.filter { isAsciiWord($0) && $0 != 0x5F }
    let id = String(decoding: idUnits.suffix(fallbackIdLength), as: UTF16.self)
    return id.isEmpty ? fallbackName : "\(fallbackName) \(id)"
  }

  /// The bridges deliver what the receiver sent as a string; it is JSON unless something broke.
  static func parseMessage(_ raw: String) -> ReceiverMessage {
    guard let data = raw.data(using: .utf8),
          let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else { return .unparsed(raw) }
    return .parsed(json)
  }

  static func loadErrorOf(_ message: ReceiverMessage) -> ReceiverLoadError? {
    switch message.type {
    case "connectionerror": return .playbackInfoFailed
    case "playbackerror": return .playbackFailed
    case "error": return .rejected
    default: return nil
    }
  }

  private static func isBoolean(_ value: Any) -> Bool {
    guard let number = value as? NSNumber else { return false }
    return CFGetTypeID(number as CFTypeRef) == CFBooleanGetTypeID()
  }

  /// A number as written, or as a non-blank string the bridges turned it into; a boolean is not one.
  private static func number(_ value: Any?) -> Double? {
    guard let value, !(value is NSNull), !isBoolean(value) else { return nil }
    if let number = value as? NSNumber { return number.doubleValue.isFinite ? number.doubleValue : nil }
    if let text = value as? String {
      let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty, let parsed = Double(trimmed), parsed.isFinite else { return nil }
      return parsed
    }
    return nil
  }

  private static func boolean(_ value: Any?) -> Bool? {
    guard let value, isBoolean(value) else { return nil }
    return (value as? NSNumber)?.boolValue
  }

  static func parseCustomData(_ customData: [String: Any]?) -> ReceiverCustomData {
    guard let data = customData else { return ReceiverCustomData() }
    return ReceiverCustomData(
      itemId: data["itemId"] as? String,
      playSessionId: data["playSessionId"] as? String,
      audioStreamIndex: number(data["audioStreamIndex"]).map { Int($0) },
      subtitleStreamIndex: number(data["subtitleStreamIndex"]).map { Int($0) },
      mediaSourceId: data["mediaSourceId"] as? String,
      playMethod: data["playMethod"] as? String,
      runtimeTicks: number(data["runtimeTicks"]).map { Int64($0) },
      startPositionTicks: number(data["startPositionTicks"]).map { Int64($0) },
      canSeek: boolean(data["canSeek"]),
      canClientSeek: boolean(data["canClientSeek"]),
      liveStreamId: data["liveStreamId"] as? String
    )
  }

  /// Where the receiver is in the item, in seconds, from its media status currentTime. A stream it
  /// cannot seek in itself (transcoded music, live TV) runs from the position it was loaded at.
  static func positionInItem(currentTime: Double, customData: ReceiverCustomData) -> Double {
    guard customData.canClientSeek == false else { return currentTime }
    return currentTime + Double(customData.startPositionTicks ?? 0) / ticksPerSecond
  }

  /// Whether the receiver plays this item's children instead of the item.
  static func playsChildren(_ item: ReceiverItem?) -> Bool {
    guard let item else { return false }
    return playedThroughChildren.contains(item.type ?? "") || item.isFolder
  }
}

/// How a load ended.
enum ReceiverLoadOutcome {
  case loaded
  case failed(ReceiverLoadError, ReceiverMessage)
  case timedOut
  /// A newer load replaced this one before it settled.
  case superseded

  var wireName: String {
    switch self {
    case .loaded: return "loaded"
    case .failed: return "failed"
    case .timedOut: return "timed_out"
    case .superseded: return "superseded"
    }
  }
}

/// Settles one PlayNow from what the receiver reports, the first event winning. Sending only means
/// the message left the phone: the load counts once the receiver has a media session for it under a
/// play session it did not have before (every load gets a new one, which tells a recast of the item
/// already playing from the media it replaces). The caller owns the clock and calls `timeOut()`.
final class ReceiverLoadTracker {
  private let playsChild: Bool
  private let itemId: String?
  private let previousPlaySessionId: String?
  private(set) var outcome: ReceiverLoadOutcome?

  init(request: ReceiverPlayRequest, previousPlaySessionId: String?) {
    let sent = ReceiverProtocol.toReceiverRequest(request)
    playsChild = ReceiverProtocol.playsChildren(sent.items.first)
    let index = sent.startIndex ?? 0
    itemId = sent.items.indices.contains(index) ? sent.items[index].id : nil
    self.previousPlaySessionId = previousPlaySessionId
  }

  private func settle(_ result: ReceiverLoadOutcome) -> ReceiverLoadOutcome? {
    guard outcome == nil else { return nil }
    outcome = result
    return result
  }

  /// `customData` is nil when the media has none (another sender loaded it).
  func onMediaStatus(customData: ReceiverCustomData?, playerState: String?) -> ReceiverLoadOutcome? {
    guard let customData, let playerState else { return nil }
    if let previous = previousPlaySessionId, customData.playSessionId == previous { return nil }
    let isThisLoad: Bool
    if playsChild {
      // The receiver picks the child, and startIndex counts in its own list of them: the first
      // media it plays under a new play session is this load, whatever its item.
      isThisLoad = customData.playSessionId != nil && playerState == "playing"
    } else {
      isThisLoad = itemId != nil && customData.itemId == itemId && playerState != "idle"
    }
    return isThisLoad ? settle(.loaded) : nil
  }

  func onMessage(_ message: ReceiverMessage) -> ReceiverLoadOutcome? {
    guard let error = ReceiverProtocol.loadErrorOf(message) else { return nil }
    return settle(.failed(error, message))
  }

  func supersede() -> ReceiverLoadOutcome? { settle(.superseded) }

  func timeOut() -> ReceiverLoadOutcome? { settle(.timedOut) }
}
