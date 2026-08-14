import Foundation

/// Metadata JS attaches to a download so the Live Activity can render without a JS runtime.
/// All user-visible strings are resolved in JS, so Swift never needs its own translations.
struct DownloadActivityMetadata: Codable {
  var itemId: String
  var title: String
  var subtitle: String
  var posterFileName: String?
  var estimatedTotalBytes: Int64
  var labels: [String: String]
}

struct DownloadTaskInfo: Codable {
  let url: String
  let destinationPath: String?
  var metadata: DownloadActivityMetadata?
  var createdAt: Date = Date()
  /// Custom proxy auth headers. Deliberately left out of `CodingKeys`: these are
  /// credentials, and this store is an unencrypted App Group container. A
  /// background transfer already carries them in its own request, so nothing is
  /// lost by not persisting them.
  var headers: [String: String]?

  private enum CodingKeys: String, CodingKey {
    case url, destinationPath, metadata, createdAt
  }
}

/// A download waiting behind the active one. Persisted alongside the in-flight tasks so a season
/// queued up and then lost to a process death resumes natively on the next launch, without needing
/// the JS runtime at all.
struct QueuedDownloadInfo: Codable {
  let url: String
  let destinationPath: String?
  var metadata: DownloadActivityMetadata?
  var createdAt: Date = Date()
  /// See `DownloadTaskInfo.headers`: not persisted. A queued download restored
  /// after a process death starts without them, so a server behind an access
  /// gateway rejects it and the item has to be re-queued from the app.
  var headers: [String: String]?

  private enum CodingKeys: String, CodingKey {
    case url, destinationPath, metadata, createdAt
  }
}

/// Persists in-flight task info so it survives the app being terminated mid-download.
///
/// This is load-bearing, not an optimization. A background `URLSession` keeps transferring after the
/// app dies; when the transfer finishes iOS relaunches the app and delivers
/// `didFinishDownloadingTo`. With the task map held only in memory that lookup fails, the file is
/// never moved out of its temporary location, and the download is silently lost. Background-session
/// task identifiers are stable across relaunches, so they are safe to key on.
///
/// Not internally synchronized: `BackgroundDownloaderModule` confines every call to its state
/// queue, which is the single place allowed to touch download state.
final class DownloadTaskStore {
  private static let storageKey = "com.fredrikburmester.streamyfin.backgrounddownloader.tasks"
  private static let queueStorageKey = "com.fredrikburmester.streamyfin.backgrounddownloader.queue"

  private let defaults: UserDefaults

  init() {
    #if os(iOS)
      if let appGroupIdentifier = DownloadActivitySharedContainer.appGroupIdentifier,
        let suite = UserDefaults(suiteName: appGroupIdentifier)
      {
        defaults = suite
      } else {
        defaults = .standard
      }
    #else
      defaults = .standard
    #endif
  }

  /// Entries are never pruned against the live task list on launch: iOS can deliver a queued
  /// `didFinishDownloadingTo` moments after the session is recreated, and such a task is already
  /// absent from `getAllTasks`. Dropping it there would lose the download. An age cap bounds growth
  /// without that race.
  private static let maxEntryAge: TimeInterval = 7 * 24 * 60 * 60

  func load() -> [Int: DownloadTaskInfo] {
    guard let data = defaults.data(forKey: Self.storageKey),
      let decoded = try? JSONDecoder().decode([String: DownloadTaskInfo].self, from: data)
    else {
      return [:]
    }
    let cutoff = Date().addingTimeInterval(-Self.maxEntryAge)
    return decoded.reduce(into: [Int: DownloadTaskInfo]()) { result, entry in
      if let taskId = Int(entry.key), entry.value.createdAt > cutoff {
        result[taskId] = entry.value
      }
    }
  }

  func save(_ tasks: [Int: DownloadTaskInfo]) {
    let encodable = tasks.reduce(into: [String: DownloadTaskInfo]()) { result, entry in
      result[String(entry.key)] = entry.value
    }
    guard let data = try? JSONEncoder().encode(encodable) else { return }
    defaults.set(data, forKey: Self.storageKey)
  }

  func loadQueue() -> [QueuedDownloadInfo] {
    guard let data = defaults.data(forKey: Self.queueStorageKey),
      let decoded = try? JSONDecoder().decode([QueuedDownloadInfo].self, from: data)
    else {
      return []
    }
    let cutoff = Date().addingTimeInterval(-Self.maxEntryAge)
    return decoded.filter { $0.createdAt > cutoff }
  }

  func saveQueue(_ queue: [QueuedDownloadInfo]) {
    guard let data = try? JSONEncoder().encode(queue) else { return }
    defaults.set(data, forKey: Self.queueStorageKey)
  }
}
