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
  private var session: URLSession?
  private var sessionDelegate: DownloadSessionDelegate?
  fileprivate static var backgroundCompletionHandler: (() -> Void)?
  private var downloadTasks: [Int: DownloadTaskInfo] = [:]
  private var downloadQueue:
    [(url: String, destinationPath: String?, metadata: DownloadActivityMetadata?)] = []
  private var lastProgressTime: [Int: Date] = [:]
  private let taskStore = DownloadTaskStore()

  /// Mirrors `downloadTasks` into the App Group so a transfer that finishes after the app is
  /// terminated can still be resolved when iOS relaunches us.
  private func persistTasks() {
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
      // Restore tasks left behind by a previous process before reconnecting to the session, so a
      // download that completed while we were dead can still be moved into place.
      self.downloadTasks = self.taskStore.load()
      self.initializeSession()
      self.reconcileLiveActivities()
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
      guard let url = URL(string: urlString) else {
        throw DownloadError.invalidURL
      }
      
      if self.session == nil {
        self.initializeSession()
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
      
      let resolvedMetadata = metadata?.toMetadata()
      self.downloadTasks[taskId] = DownloadTaskInfo(
        url: urlString,
        destinationPath: destinationPath,
        metadata: resolvedMetadata
      )
      self.persistTasks()

      task.resume()

      self.startLiveActivity(taskId: taskId, metadata: resolvedMetadata)

      self.sendEvent("onDownloadStarted", [
        "taskId": taskId,
        "url": urlString
      ])

      return taskId
    }

    AsyncFunction("enqueueDownload") {
      (urlString: String, destinationPath: String?, metadata: DownloadMetadataRecord?) -> Int in
      // Add to queue
      let wasEmpty = self.downloadQueue.isEmpty
      self.downloadQueue.append(
        (
          url: urlString,
          destinationPath: destinationPath,
          metadata: metadata?.toMetadata()
        )
      )

      // If queue was empty and no active downloads, start processing immediately
      if wasEmpty {
        return try await self.processNextInQueue()
      }
      
      // Return placeholder taskId for queued items
      return -1
    }
    
    Function("cancelDownload") { (taskId: Int) in
      self.cancelLiveActivity(taskId: taskId)
      self.session?.getAllTasks { tasks in
        for task in tasks where task.taskIdentifier == taskId {
          task.cancel()
          self.downloadTasks.removeValue(forKey: taskId)
          self.persistTasks()
        }
      }
    }

    Function("cancelQueuedDownload") { (url: String) in
      // Remove from queue by URL
      self.downloadQueue.removeAll { queuedItem in
        queuedItem.url == url
      }
    }

    Function("cancelAllDownloads") {
      self.cancelAllLiveActivities()
      self.session?.getAllTasks { tasks in
        for task in tasks {
          task.cancel()
        }
        self.downloadTasks.removeAll()
        self.persistTasks()
      }
    }
    
    AsyncFunction("getActiveDownloads") { () -> [[String: Any]] in
      return try await withCheckedThrowingContinuation { continuation in
        let downloadTasks = self.downloadTasks
        
        self.session?.getAllTasks { tasks in
          let activeDownloads = tasks.compactMap { task -> [String: Any]? in
            guard task is URLSessionDownloadTask,
                  let info = downloadTasks[task.taskIdentifier] else {
              return nil
            }
            
            return [
              "taskId": task.taskIdentifier,
              "url": info.url
            ]
          }
          continuation.resume(returning: activeDownloads)
        }
      }
    }
  }
  
  private func initializeSession() {
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
    print("[BackgroundDownloader] Session identifier: \(config.identifier ?? "nil")")
    print("[BackgroundDownloader] Delegate queue: nil (uses default)")
    
    // Verify delegate is connected
    if let session = self.session, session.delegate != nil {
      print("[BackgroundDownloader] ✅ Delegate successfully attached to session")
    } else {
      print("[BackgroundDownloader] ⚠️ DELEGATE NOT ATTACHED!")
    }
  }
  
  // Handler methods called by the delegate
  func handleProgress(taskId: Int, bytesWritten: Int64, totalBytes: Int64) {
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
      self.sendEvent("onDownloadProgress", [
        "taskId": taskId,
        "bytesWritten": bytesWritten,
        "totalBytes": totalBytes,
        "progress": progress
      ])
      
      lastProgressTime[taskId] = now
    }
  }
  
  func handleDownloadComplete(taskId: Int, location: URL, downloadTask: URLSessionDownloadTask) {
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

      self.sendEvent("onDownloadComplete", [
        "taskId": taskId,
        "filePath": destinationURL.path,
        "url": taskInfo.url
      ])

      downloadTasks.removeValue(forKey: taskId)
      lastProgressTime.removeValue(forKey: taskId)
      persistTasks()

      // Process next item in queue
      Task {
        do {
          _ = try await self.processNextInQueue()
        } catch {
          print("[BackgroundDownloader] Error processing next: \(error)")
        }
      }
      
    } catch {
      finishLiveActivity(taskId: taskId, state: .failed)

      self.sendEvent("onDownloadError", [
        "taskId": taskId,
        "error": "File operation failed: \(error.localizedDescription)"
      ])

      downloadTasks.removeValue(forKey: taskId)
      lastProgressTime.removeValue(forKey: taskId)
      persistTasks()

      // Process next item in queue even on error
      Task {
        do {
          _ = try await self.processNextInQueue()
        } catch {
          print("[BackgroundDownloader] Error processing next: \(error)")
        }
      }
    }
  }
  
  func handleError(taskId: Int, error: Error) {
    let isCancelled = (error as NSError).code == NSURLErrorCancelled

    if isCancelled {
      // JS drives cancellation, so it has usually dismissed the activity already; this covers
      // cancels that originate anywhere else.
      cancelLiveActivity(taskId: taskId)
    } else {
      print("[BackgroundDownloader] Task \(taskId) error: \(error.localizedDescription)")

      finishLiveActivity(taskId: taskId, state: .failed)

      self.sendEvent("onDownloadError", [
        "taskId": taskId,
        "error": error.localizedDescription
      ])
    }

    downloadTasks.removeValue(forKey: taskId)
    lastProgressTime.removeValue(forKey: taskId)
    persistTasks()

    // Process next item in queue (whether cancelled or errored)
    Task {
      do {
        _ = try await self.processNextInQueue()
      } catch {
        print("[BackgroundDownloader] Error processing next: \(error)")
      }
    }
  }
  
  private func processNextInQueue() async throws -> Int {
    // Check if queue has items
    guard !downloadQueue.isEmpty else {
      return -1
    }
    
    // Check if there are active downloads
    if !downloadTasks.isEmpty {
      return -1
    }
    
    // Get next item from queue
    let (url, destinationPath, metadata) = downloadQueue.removeFirst()
    print("[BackgroundDownloader] Starting queued download")
    
    // Start the download using existing startDownload logic
    guard let urlObj = URL(string: url) else {
      print("[BackgroundDownloader] Invalid URL in queue: \(url)")
      return try await processNextInQueue()
    }
    
    if session == nil {
      initializeSession()
    }
    
    guard let session = self.session else {
      throw DownloadError.downloadFailed
    }
    
    var request = URLRequest(url: urlObj)
    request.httpMethod = "GET"
    request.timeoutInterval = 300
    
    let task = session.downloadTask(with: request)
    let taskId = task.taskIdentifier
    
    downloadTasks[taskId] = DownloadTaskInfo(
      url: url,
      destinationPath: destinationPath,
      metadata: metadata
    )
    persistTasks()

    task.resume()

    startLiveActivity(taskId: taskId, metadata: metadata)

    sendEvent("onDownloadStarted", [
      "taskId": taskId,
      "url": url
    ])

    return taskId
  }

  static func setBackgroundCompletionHandler(_ handler: @escaping () -> Void) {
    BackgroundDownloaderModule.backgroundCompletionHandler = handler
  }

  // MARK: - Live Activity

  // Every entry point is wrapped so the rest of the module stays free of availability and platform
  // checks. All of this compiles away on tvOS, where ActivityKit does not exist.

  private func startLiveActivity(taskId: Int, metadata: DownloadActivityMetadata?) {
    #if os(iOS)
      guard #available(iOS 16.2, *), let metadata else { return }
      DownloadLiveActivityController.shared.start(
        taskId: taskId,
        metadata: metadata,
        queuedCount: downloadQueue.count
      )
    #endif
  }

  private func updateLiveActivity(taskId: Int, bytesWritten: Int64, totalBytes: Int64) {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.update(
        taskId: taskId,
        bytesWritten: bytesWritten,
        totalBytes: totalBytes,
        queuedCount: downloadQueue.count
      )
    #endif
  }

  private func finishLiveActivity(taskId: Int, state: DownloadActivityState) {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.finish(
        taskId: taskId,
        state: state,
        queuedCount: downloadQueue.count
      )
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

  /// Clears activities with no live task behind them — otherwise an app killed mid-download leaves
  /// one stranded on the Lock Screen indefinitely.
  private func reconcileLiveActivities() {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      session?.getAllTasks { tasks in
        let active = Set(
          tasks.filter { $0.state == .running || $0.state == .suspended }
            .map(\.taskIdentifier)
        )
        DownloadLiveActivityController.shared.reconcile(activeTaskIds: active)
      }
    #endif
  }
}

