import Foundation

/// The state of the download the Live Activity is tracking.
///
/// Deliberately outside the `os(iOS)` guard below: `BackgroundDownloaderModule` names this type in
/// its (unguarded) helper signatures, and that module also compiles for tvOS, where ActivityKit does
/// not exist. The enum itself has no ActivityKit dependency.
public enum DownloadActivityState: String, Codable, Hashable {
  case downloading
  case completed
  case failed
  case queued
}

#if os(iOS)
  import ActivityKit

  /// Shared between two targets:
  ///   • the app, via the `BackgroundDownloader` pod (this whole `ios/` dir is `source_files`)
  ///   • the `StreamyfinDownloadActivity` widget extension, which `plugins/withDownloadLiveActivity.ts`
  ///     adds to its Sources build phase by path
  ///
  /// ActivityKit matches activities on the *unqualified* type name, so it does not matter that the
  /// two targets compile it into different Swift modules — but the declaration must stay identical.
  ///
  /// The per-download fields (title, poster, …) deliberately live in `ContentState`, not in the
  /// static attributes: iOS only allows `Activity.request` while the app is foregrounded, and
  /// queued downloads start from background wake-ups. The one activity is therefore created for the
  /// first download and *rebound* to each subsequent one via `activity.update`, which has no
  /// foreground restriction — possible only if everything episode-specific is mutable.
  @available(iOS 16.1, *)
  public struct DownloadActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
      /// Jellyfin item id of the download currently bound to the activity; how a restored process
      /// re-adopts its activity after a cold relaunch.
      public var itemId: String
      public var title: String
      public var subtitle: String
      /// File name inside the App Group container. The extension cannot read the app's Documents
      /// directory, so the poster is staged into the shared container before the download starts.
      public var posterFileName: String?
      /// Fraction of the transfer that is genuinely done, `0...1`. Frozen while iOS suspends us —
      /// the ETA countdown in the UI is what keeps moving. Never inflate this.
      public var progress: Double
      public var bytesDownloaded: Int64
      /// `0` when the server sent no `Content-Length` (transcoding) and no estimate exists either.
      public var totalBytes: Int64
      public var speedBytesPerSec: Double
      public var queuedCount: Int
      public var state: DownloadActivityState

      public init(
        itemId: String,
        title: String,
        subtitle: String,
        posterFileName: String?,
        progress: Double,
        bytesDownloaded: Int64,
        totalBytes: Int64,
        speedBytesPerSec: Double,
        queuedCount: Int,
        state: DownloadActivityState
      ) {
        self.itemId = itemId
        self.title = title
        self.subtitle = subtitle
        self.posterFileName = posterFileName
        self.progress = progress
        self.bytesDownloaded = bytesDownloaded
        self.totalBytes = totalBytes
        self.speedBytesPerSec = speedBytesPerSec
        self.queuedCount = queuedCount
        self.state = state
      }
    }

    /// Localized strings, resolved in JS so translations stay single-sourced in `translations/*.json`.
    /// Keyed by `DownloadActivityState.rawValue`. Identical for every download, hence the only
    /// field that may stay immutable.
    public var labels: [String: String]

    public init(labels: [String: String]) {
      self.labels = labels
    }

    public func label(for state: DownloadActivityState) -> String {
      labels[state.rawValue] ?? ""
    }
  }

  /// Resolves the App Group container both targets share. The identifier is written into each
  /// target's Info.plist by `plugins/withDownloadLiveActivity.ts`, mirroring how
  /// `plugins/withTVOSTopShelf.ts` passes `StreamyfinAppGroupIdentifier` to the Top Shelf extension.
  public enum DownloadActivitySharedContainer {
    public static let infoPlistKey = "StreamyfinDownloadsAppGroupIdentifier"

    public static var appGroupIdentifier: String? {
      Bundle.main.object(forInfoDictionaryKey: infoPlistKey) as? String
    }

    public static var directory: URL? {
      guard let appGroupIdentifier else { return nil }
      return FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
      )?.appendingPathComponent("LiveActivity", isDirectory: true)
    }

    public static func posterURL(fileName: String?) -> URL? {
      guard let fileName, !fileName.isEmpty, let directory else { return nil }
      return directory.appendingPathComponent(fileName)
    }
  }
#endif
