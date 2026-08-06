import ExpoModulesCore
import Foundation

enum DownloadError: Error {
  case invalidURL
  case fileOperationFailed
  case downloadFailed
}

/// Live Activity metadata handed down from JS at enqueue time. Entirely optional — a download
/// without it still works, it just never surfaces on the Lock Screen. All user-visible strings are
/// resolved in JS so translations stay single-sourced in `translations/*.json`.
struct DownloadMetadataRecord: Record {
  @Field var itemId: String = ""
  @Field var title: String = ""
  @Field var subtitle: String = ""
  @Field var posterFileName: String?
  @Field var estimatedTotalBytes: Double = 0
  @Field var labels: [String: String] = [:]

  func toMetadata() -> DownloadActivityMetadata {
    DownloadActivityMetadata(
      itemId: itemId,
      title: title,
      subtitle: subtitle,
      posterFileName: posterFileName,
      estimatedTotalBytes: Int64(max(estimatedTotalBytes, 0)),
      labels: labels
    )
  }
}

// Separate delegate class to handle URLSession callbacks
class DownloadSessionDelegate: NSObject, URLSessionDownloadDelegate {
  weak var module: BackgroundDownloaderModule?

  init(module: BackgroundDownloaderModule) {
    self.module = module
    super.init()
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64
  ) {
    module?.handleProgress(
      taskId: downloadTask.taskIdentifier,
      bytesWritten: totalBytesWritten,
      totalBytes: totalBytesExpectedToWrite
    )
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    module?.handleDownloadComplete(
      taskId: downloadTask.taskIdentifier,
      location: location,
      downloadTask: downloadTask
    )
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    if let error = error {
      print("[BackgroundDownloader] Task \(task.taskIdentifier) error: \(error.localizedDescription)")
      module?.handleError(taskId: task.taskIdentifier, error: error)
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async {
      if let completion = BackgroundDownloaderModule.backgroundCompletionHandler {
        completion()
        BackgroundDownloaderModule.backgroundCompletionHandler = nil
      }
    }
  }
}

public class BackgroundDownloaderModule: Module {
  fileprivate static var backgroundCompletionHandler: (() -> Void)?

  /// Confines every piece of mutable download state below. The module is entered from several
  /// unrelated execution contexts — Expo function bodies, the URLSession delegate queue, and
  /// `getAllTasks` completion handlers — and plain Swift collections must never be touched from two
  /// of them at once. Methods suffixed `Locked` assume they are already running on this queue and
  /// must not be called from anywhere else.
  private let stateQueue = DispatchQueue(
    label: "com.fredrikburmester.streamyfin.backgrounddownloader.state"
  )
  private var session: URLSession?
  private var sessionDelegate: DownloadSessionDelegate?
  private var downloadTasks: [Int: DownloadTaskInfo] = [:]
  private var downloadQueue:
    [(url: String, destinationPath: String?, metadata: DownloadActivityMetadata?)] = []
  private var lastProgressTime: [Int: Date] = [:]
  private let taskStore = DownloadTaskStore()

  /// Mirrors `downloadTasks` into the App Group so a transfer that finishes after the app is
  /// terminated can still be resolved when iOS relaunches us.
  private func persistTasksLocked() {
    taskStore.save(downloadTasks)
  }

  public func definition() -> ModuleDefinition {
    Name("BackgroundDownloader")

    Events(
      "onDownloadProgress",
      "onDownloadComplete",
      "onDownloadError",
      "onDownloadStarted"
    )

    OnCreate {
      self.stateQueue.sync {
        // Restore tasks left behind by a previous process before reconnecting to the session, so a
        // download that completed while we were dead can still be moved into place.
        self.downloadTasks = self.taskStore.load()
        self.initializeSessionLocked()
        self.reconcileLiveActivitiesLocked()
      }
    }

    Function("setLiveActivityEnabled") { (enabled: Bool) in
      #if os(iOS)
        if #available(iOS 16.2, *) {
          DownloadLiveActivityController.shared.setEnabled(enabled)
        }
      #endif
    }

    /// Path of the App Group directory the widget extension can read. JS stages poster images here,
    /// since the extension has no access to the app's Documents directory.
    Function("getLiveActivityDirectory") { () -> String? in
      #if os(iOS)
        guard let directory = DownloadActivitySharedContainer.directory else { return nil }
        try? FileManager.default.createDirectory(
          at: directory,
          withIntermediateDirectories: true
        )
        return directory.path
      #else
        return nil
      #endif
    }

    AsyncFunction("startDownload") {
      (urlString: String, destinationPath: String?, metadata: DownloadMetadataRecord?) -> Int in
      try self.stateQueue.sync {
        try self.beginDownloadLocked(
          urlString: urlString,
          destinationPath: destinationPath,
          metadata: metadata?.toMetadata()
        )
      }
    }

    AsyncFunction("enqueueDownload") {
      (urlString: String, destinationPath: String?, metadata: DownloadMetadataRecord?) -> Int in
      try self.stateQueue.sync { () throws -> Int in
        let wasEmpty = self.downloadQueue.isEmpty
        self.downloadQueue.append(
          (
            url: urlString,
            destinationPath: destinationPath,
            metadata: metadata?.toMetadata()
          )
        )
        self.pushQueuedCountLocked()

        // If queue was empty and no active downloads, start processing immediately
        if wasEmpty {
          return try self.processNextInQueueLocked()
        }

        // Return placeholder taskId for queued items
        return -1
      }
    }

    Function("cancelDownload") { (taskId: Int) in
      self.cancelLiveActivity(taskId: taskId)
      let session = self.stateQueue.sync { self.session }
      session?.getAllTasks { tasks in
        for task in tasks where task.taskIdentifier == taskId {
          task.cancel()
          self.stateQueue.async {
            self.downloadTasks.removeValue(forKey: taskId)
            self.persistTasksLocked()
          }
        }
      }
    }

    Function("cancelQueuedDownload") { (url: String) in
      // Remove from queue by URL
      self.stateQueue.sync {
        self.downloadQueue.removeAll { queuedItem in
          queuedItem.url == url
        }
        self.pushQueuedCountLocked()
      }
    }

    Function("cancelAllDownloads") {
      self.cancelAllLiveActivities()
      // Clear the queue as well (Android already does) — otherwise the cancellation callbacks
      // would immediately start the next queued item, resurrecting what was just cancelled.
      let session = self.stateQueue.sync { () -> URLSession? in
        self.downloadQueue.removeAll()
        self.pushQueuedCountLocked()
        return self.session
      }
      session?.getAllTasks { tasks in
        for task in tasks {
          task.cancel()
        }
        self.stateQueue.async {
          self.downloadTasks.removeAll()
          self.persistTasksLocked()
        }
      }
    }

    AsyncFunction("getActiveDownloads") { () -> [[String: Any]] in
      return try await withCheckedThrowingContinuation { continuation in
        let (session, tasksSnapshot) = self.stateQueue.sync { (self.session, self.downloadTasks) }

        guard let session else {
          continuation.resume(returning: [])
          return
        }

        session.getAllTasks { tasks in
          let activeDownloads = tasks.compactMap { task -> [String: Any]? in
            guard task is URLSessionDownloadTask,
                  let info = tasksSnapshot[task.taskIdentifier] else {
              return nil
            }

            var entry: [String: Any] = [
              "taskId": task.taskIdentifier,
              "url": info.url
            ]
            if let itemId = info.metadata?.itemId {
              entry["itemId"] = itemId
            }
            if let destinationPath = info.destinationPath {
              entry["destinationPath"] = destinationPath
            }
            return entry
          }
          continuation.resume(returning: activeDownloads)
        }
      }
    }
  }

  private func initializeSessionLocked() {
    print("[BackgroundDownloader] Initializing URLSession")

    let config = URLSessionConfiguration.background(
      withIdentifier: "com.fredrikburmester.streamyfin.backgrounddownloader"
    )
    config.allowsCellularAccess = true
    config.sessionSendsLaunchEvents = true
    config.isDiscretionary = false

    self.sessionDelegate = DownloadSessionDelegate(module: self)
    self.session = URLSession(
      configuration: config,
      delegate: self.sessionDelegate,
      delegateQueue: nil
    )

    print("[BackgroundDownloader] URLSession initialized with delegate: \(String(describing: self.sessionDelegate))")
  }

  /// Creates the URLSession task and all bookkeeping for one download. Shared by `startDownload`
  /// and the queue processor so the two can never drift apart again.
  private func beginDownloadLocked(
    urlString: String,
    destinationPath: String?,
    metadata: DownloadActivityMetadata?
  ) throws -> Int {
    guard let url = URL(string: urlString) else {
      throw DownloadError.invalidURL
    }

    if session == nil {
      initializeSessionLocked()
    }

    guard let session = self.session else {
      throw DownloadError.downloadFailed
    }

    // Create a URLRequest to ensure proper handling
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.timeoutInterval = 300

    let task = session.downloadTask(with: request)
    let taskId = task.taskIdentifier

    downloadTasks[taskId] = DownloadTaskInfo(
      url: urlString,
      destinationPath: destinationPath,
      metadata: metadata
    )
    persistTasksLocked()

    task.resume()

    startLiveActivity(taskId: taskId, metadata: metadata)

    var payload: [String: Any] = [
      "taskId": taskId,
      "url": urlString
    ]
    if let itemId = metadata?.itemId {
      payload["itemId"] = itemId
    }
    sendEvent("onDownloadStarted", payload)

    return taskId
  }

  // MARK: - Delegate entry points
  // Called on the URLSession delegate queue; each hops onto stateQueue before touching state.

  func handleProgress(taskId: Int, bytesWritten: Int64, totalBytes: Int64) {
    stateQueue.async {
      self.handleProgressLocked(taskId: taskId, bytesWritten: bytesWritten, totalBytes: totalBytes)
    }
  }

  func handleDownloadComplete(taskId: Int, location: URL, downloadTask: URLSessionDownloadTask) {
    // The temporary file at `location` is only valid until the delegate callback returns, so this
    // hop must be synchronous — the file is moved before control goes back to URLSession. Safe
    // because stateQueue never blocks on the delegate queue in return.
    stateQueue.sync {
      self.handleDownloadCompleteLocked(taskId: taskId, location: location, downloadTask: downloadTask)
    }
  }

  func handleError(taskId: Int, error: Error) {
    stateQueue.async {
      self.handleErrorLocked(taskId: taskId, error: error)
    }
  }

  // MARK: - Handlers (stateQueue-confined)

  private func handleProgressLocked(taskId: Int, bytesWritten: Int64, totalBytes: Int64) {
    let progress = totalBytes > 0
      ? Double(bytesWritten) / Double(totalBytes)
      : 0.0

    // Fed every callback, not just the throttled ones — the controller does its own rate limiting
    // and wants the finer samples for its speed average.
    updateLiveActivity(taskId: taskId, bytesWritten: bytesWritten, totalBytes: totalBytes)

    // Throttle progress updates: only send every 500ms
    let lastTime = lastProgressTime[taskId] ?? Date.distantPast
    let now = Date()
    let timeDiff = now.timeIntervalSince(lastTime)

    // Send if 500ms passed
    if timeDiff >= 0.5 {
      var payload: [String: Any] = [
        "taskId": taskId,
        "bytesWritten": bytesWritten,
        "totalBytes": totalBytes,
        "progress": progress
      ]
      if let itemId = downloadTasks[taskId]?.metadata?.itemId {
        payload["itemId"] = itemId
      }
      sendEvent("onDownloadProgress", payload)

      lastProgressTime[taskId] = now
    }
  }

  private func handleDownloadCompleteLocked(
    taskId: Int,
    location: URL,
    downloadTask: URLSessionDownloadTask
  ) {
    guard let taskInfo = downloadTasks[taskId] else {
      finishLiveActivity(taskId: taskId, state: .failed)
      self.sendEvent("onDownloadError", [
        "taskId": taskId,
        "error": "Download task info not found"
      ])
      return
    }

    let fileManager = FileManager.default

    do {
      let destinationURL: URL

      if let customPath = taskInfo.destinationPath {
        destinationURL = URL(fileURLWithPath: customPath)
      } else {
        let documentsDir = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        let filename = downloadTask.response?.suggestedFilename
          ?? downloadTask.originalRequest?.url?.lastPathComponent
          ?? "download_\(taskId)"
        destinationURL = documentsDir.appendingPathComponent(filename)
      }

      if fileManager.fileExists(atPath: destinationURL.path) {
        try fileManager.removeItem(at: destinationURL)
      }

      let destinationDirectory = destinationURL.deletingLastPathComponent()
      if !fileManager.fileExists(atPath: destinationDirectory.path) {
        try fileManager.createDirectory(
          at: destinationDirectory,
          withIntermediateDirectories: true,
          attributes: nil
        )
      }

      try fileManager.moveItem(at: location, to: destinationURL)

      finishLiveActivity(taskId: taskId, state: .completed)

      var payload: [String: Any] = [
        "taskId": taskId,
        "filePath": destinationURL.path,
        "url": taskInfo.url
      ]
      if let itemId = taskInfo.metadata?.itemId {
        payload["itemId"] = itemId
      }
      sendEvent("onDownloadComplete", payload)

      downloadTasks.removeValue(forKey: taskId)
      lastProgressTime.removeValue(forKey: taskId)
      persistTasksLocked()

      processNextInQueueSafelyLocked()
    } catch {
      finishLiveActivity(taskId: taskId, state: .failed)

      var payload: [String: Any] = [
        "taskId": taskId,
        "error": "File operation failed: \(error.localizedDescription)"
      ]
      if let itemId = taskInfo.metadata?.itemId {
        payload["itemId"] = itemId
      }
      sendEvent("onDownloadError", payload)

      downloadTasks.removeValue(forKey: taskId)
      lastProgressTime.removeValue(forKey: taskId)
      persistTasksLocked()

      processNextInQueueSafelyLocked()
    }
  }

  private func handleErrorLocked(taskId: Int, error: Error) {
    let isCancelled = (error as NSError).code == NSURLErrorCancelled
    let itemId = downloadTasks[taskId]?.metadata?.itemId

    if isCancelled {
      // JS drives cancellation, so it has usually dismissed the activity already; this covers
      // cancels that originate anywhere else.
      cancelLiveActivity(taskId: taskId)
    } else {
      print("[BackgroundDownloader] Task \(taskId) error: \(error.localizedDescription)")

      finishLiveActivity(taskId: taskId, state: .failed)

      var payload: [String: Any] = [
        "taskId": taskId,
        "error": error.localizedDescription
      ]
      if let itemId {
        payload["itemId"] = itemId
      }
      sendEvent("onDownloadError", payload)
    }

    downloadTasks.removeValue(forKey: taskId)
    lastProgressTime.removeValue(forKey: taskId)
    persistTasksLocked()

    // Process next item in queue (whether cancelled or errored)
    processNextInQueueSafelyLocked()
  }

  /// Nothing in here is actually asynchronous — the previous `async` shape existed only so the
  /// completion handlers could spawn it inside detached `Task`s, which added a fourth unsynchronized
  /// execution context. Now it is a plain function that runs where the state lives.
  private func processNextInQueueLocked() throws -> Int {
    guard !downloadQueue.isEmpty else {
      return -1
    }

    // One download at a time
    guard downloadTasks.isEmpty else {
      return -1
    }

    let (url, destinationPath, metadata) = downloadQueue.removeFirst()
    pushQueuedCountLocked()
    print("[BackgroundDownloader] Starting queued download")

    guard URL(string: url) != nil else {
      print("[BackgroundDownloader] Invalid URL in queue: \(url)")
      return try processNextInQueueLocked()
    }

    return try beginDownloadLocked(
      urlString: url,
      destinationPath: destinationPath,
      metadata: metadata
    )
  }

  private func processNextInQueueSafelyLocked() {
    do {
      _ = try processNextInQueueLocked()
    } catch {
      print("[BackgroundDownloader] Error processing next: \(error)")
    }
  }

  static func setBackgroundCompletionHandler(_ handler: @escaping () -> Void) {
    BackgroundDownloaderModule.backgroundCompletionHandler = handler
  }

  // MARK: - Live Activity

  // Every entry point is wrapped so the rest of the module stays free of availability and platform
  // checks. All of this compiles away on tvOS, where ActivityKit does not exist. The controller
  // confines its own state to its own queue; calls from here never block.

  /// The controller keeps its own copy of the queued count, updated whenever the queue changes.
  /// Reading `downloadQueue.count` from the delegate callbacks instead (as `updateLiveActivity`
  /// used to) was the hottest cross-thread access in the module.
  private func pushQueuedCountLocked() {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.setQueuedCount(downloadQueue.count)
    #endif
  }

  private func startLiveActivity(taskId: Int, metadata: DownloadActivityMetadata?) {
    #if os(iOS)
      guard #available(iOS 16.2, *), let metadata else { return }
      DownloadLiveActivityController.shared.start(taskId: taskId, metadata: metadata)
    #endif
  }

  private func updateLiveActivity(taskId: Int, bytesWritten: Int64, totalBytes: Int64) {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.update(
        taskId: taskId,
        bytesWritten: bytesWritten,
        totalBytes: totalBytes
      )
    #endif
  }

  private func finishLiveActivity(taskId: Int, state: DownloadActivityState) {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.finish(taskId: taskId, state: state)
    #endif
  }

  private func cancelLiveActivity(taskId: Int) {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.cancel(taskId: taskId)
    #endif
  }

  private func cancelAllLiveActivities() {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.cancelAll()
    #endif
  }

  /// Reconnects Live Activities left by a previous process to their restored tasks and clears the
  /// rest — otherwise an app killed mid-download leaves one stranded on the Lock Screen. Keyed on
  /// the persisted task store, not `getAllTasks`, so an activity whose transfer finished while the
  /// app was dead survives long enough for the queued completion callback to flip it.
  private func reconcileLiveActivitiesLocked() {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.reconcile(
        persistedTasks: downloadTasks.compactMapValues(\.metadata)
      )
    #endif
  }
}
