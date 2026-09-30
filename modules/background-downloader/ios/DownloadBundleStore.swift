import Foundation

struct DownloadBundlePlan: Codable {
  var videoUrl: String
  var audioUrls: [String]
  var destinationPath: String
  var audioTitles: [String]
  var audioLanguages: [String]

  var urls: [String] { [videoUrl] + audioUrls }

  func validate() throws {
    guard audioTitles.count == urls.count,
      audioLanguages.count == urls.count,
      destinationPath.lowercased().hasSuffix(".mkv"),
      urls.allSatisfy({
        guard let url = URL(string: $0) else { return false }
        return ["http", "https"].contains(url.scheme?.lowercased() ?? "") && url.host != nil
      })
    else {
      throw DownloadBundleFailure.invalidPlan
    }
  }
}

enum DownloadBundleFailure: LocalizedError {
  case invalidPlan
  case invalidDestination
  case incompatibleRetry
  case missingHeaders
  case interrupted
  case invalidSource
  case destinationExists

  var errorDescription: String? {
    switch self {
    case .invalidPlan: return "Invalid multi-track download plan"
    case .invalidDestination: return "Multi-track destination must be inside Documents"
    case .incompatibleRetry: return "Cancel the existing download before changing its tracks"
    case .missingHeaders: return "Open the app and retry to restore download authentication headers"
    case .interrupted: return "Download interrupted; completed tracks are retained for retry"
    case .invalidSource: return "Downloaded track is empty or incomplete"
    case .destinationExists: return "The download destination already exists"
    }
  }
}

struct DownloadBundleJob: Codable {
  let id: String
  let taskId: Int
  var plan: DownloadBundlePlan
  var metadata: DownloadActivityMetadata
  var requiresHeaders: Bool
  var stage: String = "queued"
  var transferId: Int?
  var transferIndex: Int?
  var error: String?
  var publishedSize: Int64?
}

/// The manifest and every path in it are relocatable. Credentials belong only to the in-memory
/// coordinator (or the OS-owned URLSession request), never this unencrypted store.
final class DownloadBundleStore {
  let documents: URL
  private let directory: URL
  private let files = FileManager.default

  init(documents: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]) {
    self.documents = documents.standardizedFileURL
    directory = documents.appendingPathComponent(".multi-track-downloads", isDirectory: true)
  }

  func relativeDestination(_ path: String) throws -> String {
    let url: URL
    if path.hasPrefix("file://") {
      guard let parsed = URL(string: path), parsed.isFileURL else {
        throw DownloadBundleFailure.invalidDestination
      }
      url = parsed
    } else {
      url = URL(fileURLWithPath: path)
    }
    let resolved = url.resolvingSymlinksInPath().standardizedFileURL.path
    let prefix = documents.resolvingSymlinksInPath().path + "/"
    guard resolved.hasPrefix(prefix), resolved.count > prefix.count else {
      throw DownloadBundleFailure.invalidDestination
    }
    return String(resolved.dropFirst(prefix.count))
  }

  func destination(_ job: DownloadBundleJob) -> URL {
    documents.appendingPathComponent(job.plan.destinationPath)
  }

  func source(_ job: DownloadBundleJob, _ index: Int) -> URL {
    destination(job).appendingPathExtension("bundle-\(job.id).\(index).mp4")
  }

  func output(_ job: DownloadBundleJob) -> URL {
    destination(job).appendingPathExtension("bundle-\(job.id).muxing.mkv")
  }

  private func marker(_ job: DownloadBundleJob, _ index: Int) -> URL {
    source(job, index).appendingPathExtension("complete")
  }

  func size(_ url: URL) -> Int64 {
    ((try? files.attributesOfItem(atPath: url.path)[.size]) as? NSNumber)?.int64Value ?? 0
  }

  func completedSize(_ job: DownloadBundleJob, _ index: Int) -> Int64 {
    guard let data = try? Data(contentsOf: marker(job, index)),
      let text = String(data: data, encoding: .utf8),
      let expected = Int64(text), expected > 0,
      size(source(job, index)) == expected
    else { return 0 }
    return expected
  }

  func workingBytes(_ job: DownloadBundleJob) -> Int64 {
    job.plan.urls.indices.reduce(size(output(job))) {
      $0 + size(source(job, $1)) + size(marker(job, $1))
    }
  }

  func acceptSource(_ location: URL, job: DownloadBundleJob, index: Int) throws {
    let bytes = size(location)
    guard bytes > 0 else { throw DownloadBundleFailure.invalidSource }
    let target = source(job, index)
    try files.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? files.removeItem(at: marker(job, index))
    try? files.removeItem(at: target)
    try files.moveItem(at: location, to: target)
    // A source without this atomic marker is never reusable, even if a killed transfer left it.
    try Data(String(bytes).utf8).write(to: marker(job, index), options: .atomic)
  }

  func save(_ job: DownloadBundleJob) throws {
    try files.createDirectory(at: directory, withIntermediateDirectories: true)
    try JSONEncoder().encode(job).write(
      to: directory.appendingPathComponent("\(job.id).json"), options: .atomic
    )
  }

  func load() -> [DownloadBundleJob] {
    let entries = (try? files.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
    return entries.filter { $0.pathExtension == "json" }.compactMap {
      guard let data = try? Data(contentsOf: $0),
        let job = try? JSONDecoder().decode(DownloadBundleJob.self, from: data),
        UUID(uuidString: job.id) != nil,
        !job.plan.destinationPath.hasPrefix("/"),
        !job.plan.destinationPath.split(separator: "/").contains(".."),
        (try? job.plan.validate()) != nil
      else { return nil }
      return job
    }.sorted { $0.taskId > $1.taskId }
  }

  func cleanInputs(_ job: DownloadBundleJob) {
    for index in job.plan.urls.indices {
      try? files.removeItem(at: source(job, index))
      try? files.removeItem(at: marker(job, index))
    }
    try? files.removeItem(at: output(job))
  }

  func remove(_ job: DownloadBundleJob) {
    try? files.removeItem(at: directory.appendingPathComponent("\(job.id).json"))
  }
}

final class DownloadBundleCancellation {
  private let lock = NSLock()
  private var cancelled = false

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }

  func cancel() {
    lock.lock()
    cancelled = true
    lock.unlock()
  }
}
