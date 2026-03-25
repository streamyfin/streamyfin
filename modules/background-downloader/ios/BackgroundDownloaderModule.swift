import ExpoModulesCore
import Foundation

enum DownloadError: Error {
  case invalidURL
  case fileOperationFailed
  case downloadFailed
}

struct DownloadTaskInfo {
  let url: String
  let destinationPath: String?
  var retryCount: Int = 0
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
      let nsError = error as NSError
      
      // Check for resume data in the error
      let resumeData = nsError.userInfo[NSURLSessionDownloadTaskResumeData] as? Data
      
      print("[BackgroundDownloader] Task \(task.taskIdentifier) error: \(error.localizedDescription), hasResumeData: \(resumeData != nil)")
      module?.handleError(taskId: task.taskIdentifier, error: error, resumeData: resumeData)
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
  private var downloadQueue: [(url: String, destinationPath: String?)] = []
  private var lastProgressTime: [Int: Date] = [:]
  
  // Resume data storage
  private var resumeDataStore: [Int: Data] = [:]
  private var resumeDataByUrl: [String: Data] = [:]
  private var bytesDownloadedByTask: [Int: Int64] = [:]
  private let maxRetries = 3
  private let retryBaseDelay: TimeInterval = 2.0
  
  public func definition() -> ModuleDefinition {
    Name("BackgroundDownloader")
    
    Events(
      "onDownloadProgress",
      "onDownloadComplete",
      "onDownloadError",
      "onDownloadStarted",
      "onDownloadPaused",
      "onDownloadResumed"
    )
    
    OnCreate {
      self.initializeSession()
    }
    
    AsyncFunction("startDownload") { (urlString: String, destinationPath: String?) -> Int in
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
      
      self.downloadTasks[taskId] = DownloadTaskInfo(
        url: urlString,
        destinationPath: destinationPath
      )
      
      task.resume()
      
      self.sendEvent("onDownloadStarted", [
        "taskId": taskId,
        "url": urlString
      ])
      
      return taskId
    }
    
    AsyncFunction("downloadChunk") { (urlString: String, destinationPath: String, startByte: Int64, endByte: Int64) -> Int64 in
      guard let url = URL(string: urlString) else {
        throw DownloadError.invalidURL
      }
      
      var request = URLRequest(url: url)
      request.httpMethod = "GET"
      request.timeoutInterval = 60
      request.setValue("bytes=\(startByte)-\(endByte)", forHTTPHeaderField: "Range")
      
      let config = URLSessionConfiguration.ephemeral
      let session = URLSession(configuration: config)
      
      let (data, response) = try await session.data(for: request)
      
      guard let httpResponse = response as? HTTPURLResponse else {
        throw DownloadError.downloadFailed
      }
      
      let statusCode = httpResponse.statusCode
      let isPartial = statusCode == 206
      
      // If a specific range chunk was requested, we MUST receive a 206 Partial Content.
      // A 200 OK means the server ignored the Range header and is sending the entire file.
      // Appending the entire file on every chunk request will corrupt the file!
      if startByte > 0 && !isPartial {
         throw DownloadError.downloadFailed
      }
      
      if !(200...299).contains(statusCode) {
        throw DownloadError.downloadFailed
      }
      
      let fileURL = URL(fileURLWithPath: destinationPath)
      let fileManager = FileManager.default
      
      // Ensure directory exists
      let directory = fileURL.deletingLastPathComponent()
      if !fileManager.fileExists(atPath: directory.path) {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true, attributes: nil)
      }
      
      // Only append if we are explicitly asking for a chunk > 0.
      let appendMode = startByte > 0 && fileManager.fileExists(atPath: fileURL.path)
      
      if !appendMode {
        // Create new file (overwriting any existing if startByte is 0)
        try data.write(to: fileURL)
      } else {
        // Append to existing file
        let fileHandle = try FileHandle(forWritingTo: fileURL)
        if #available(iOS 13.4, *) {
          try fileHandle.seekToEnd()
          try fileHandle.write(contentsOf: data)
        } else {
          fileHandle.seekToEndOfFile()
          fileHandle.write(data)
        }
        fileHandle.closeFile()
      }
      
      return Int64(data.count)
    }
    
    AsyncFunction("enqueueDownload") { (urlString: String, destinationPath: String?) -> Int in
      // Add to queue
      let wasEmpty = self.downloadQueue.isEmpty
      self.downloadQueue.append((url: urlString, destinationPath: destinationPath))
      
      // If queue was empty and no active downloads, start processing immediately
      if wasEmpty {
        return try await self.processNextInQueue()
      }
      
      // Return placeholder taskId for queued items
      return -1
    }
    
    Function("cancelDownload") { (taskId: Int) in
      self.session?.getAllTasks { tasks in
        for task in tasks where task.taskIdentifier == taskId {
          task.cancel()
          self.downloadTasks.removeValue(forKey: taskId)
          self.resumeDataStore.removeValue(forKey: taskId)
          self.bytesDownloadedByTask.removeValue(forKey: taskId)
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
      self.session?.getAllTasks { tasks in
        for task in tasks {
          task.cancel()
        }
        self.downloadTasks.removeAll()
      }
      self.resumeDataStore.removeAll()
      self.resumeDataByUrl.removeAll()
      self.bytesDownloadedByTask.removeAll()
    }
    
    AsyncFunction("pauseDownload") { (taskId: Int) in
      print("[BackgroundDownloader] Pausing download: taskId=\(taskId)")
      
      guard let session = self.session else {
        print("[BackgroundDownloader] No session for pause")
        return
      }
      
      let tasks = await session.allTasks
      for task in tasks where task.taskIdentifier == taskId {
        if let downloadTask = task as? URLSessionDownloadTask {
          let taskInfo = self.downloadTasks[taskId]
          let bytesDownloaded = self.bytesDownloadedByTask[taskId] ?? 0
          
          downloadTask.cancel(byProducingResumeData: { resumeData in
            if let resumeData = resumeData {
              self.resumeDataStore[taskId] = resumeData
              if let url = taskInfo?.url {
                self.resumeDataByUrl[url] = resumeData
              }
              print("[BackgroundDownloader] Stored resume data (\(resumeData.count) bytes) for taskId=\(taskId)")
            }
            
            self.sendEvent("onDownloadPaused", [
              "taskId": taskId,
              "url": taskInfo?.url ?? "",
              "bytesDownloaded": bytesDownloaded
            ])
          })
          return
        }
      }
      
      print("[BackgroundDownloader] Task \(taskId) not found for pause")
    }
    
    AsyncFunction("resumeDownload") { (taskId: Int) -> Int in
      print("[BackgroundDownloader] Resuming download: taskId=\(taskId)")
      
      if self.session == nil {
        self.initializeSession()
      }
      
      guard let session = self.session else {
        throw DownloadError.downloadFailed
      }
      
      // Try to resume from stored resume data
      if let resumeData = self.resumeDataStore[taskId] {
        let newTask = session.downloadTask(withResumeData: resumeData)
        let newTaskId = newTask.taskIdentifier
        
        // Transfer task info to new task ID
        if let taskInfo = self.downloadTasks[taskId] {
          self.downloadTasks[newTaskId] = taskInfo
          self.downloadTasks.removeValue(forKey: taskId)
        }
        
        // Transfer bytes downloaded tracking
        if let bytes = self.bytesDownloadedByTask[taskId] {
          self.bytesDownloadedByTask[newTaskId] = bytes
          self.bytesDownloadedByTask.removeValue(forKey: taskId)
        }
        
        self.resumeDataStore.removeValue(forKey: taskId)
        
        newTask.resume()
        
        let url = self.downloadTasks[newTaskId]?.url ?? ""
        self.sendEvent("onDownloadResumed", [
          "taskId": newTaskId,
          "url": url,
          "bytesDownloaded": self.bytesDownloadedByTask[newTaskId] ?? 0
        ])
        
        print("[BackgroundDownloader] Resumed with new taskId=\(newTaskId)")
        return newTaskId
      }
      
      // No resume data available — try Range-based resume
      guard let taskInfo = self.downloadTasks[taskId],
            let destPath = taskInfo.destinationPath else {
        print("[BackgroundDownloader] No task info or destination for Range resume")
        throw DownloadError.downloadFailed
      }
      
      let fileManager = FileManager.default
      let destURL = URL(fileURLWithPath: destPath)
      var existingBytes: Int64 = 0
      
      if fileManager.fileExists(atPath: destPath),
         let attrs = try? fileManager.attributesOfItem(atPath: destPath),
         let fileSize = attrs[.size] as? Int64 {
        existingBytes = fileSize
      }
      
      guard existingBytes > 0, let url = URL(string: taskInfo.url) else {
        print("[BackgroundDownloader] No partial file for Range resume, restarting")
        throw DownloadError.downloadFailed
      }
      
      // Create request with Range header
      var request = URLRequest(url: url)
      request.httpMethod = "GET"
      request.timeoutInterval = 300
      request.setValue("bytes=\(existingBytes)-", forHTTPHeaderField: "Range")
      
      let newTask = session.downloadTask(with: request)
      let newTaskId = newTask.taskIdentifier
      
      self.downloadTasks[newTaskId] = taskInfo
      self.downloadTasks.removeValue(forKey: taskId)
      self.bytesDownloadedByTask[newTaskId] = existingBytes
      self.bytesDownloadedByTask.removeValue(forKey: taskId)
      
      newTask.resume()
      
      self.sendEvent("onDownloadResumed", [
        "taskId": newTaskId,
        "url": taskInfo.url,
        "bytesDownloaded": existingBytes
      ])
      
      print("[BackgroundDownloader] Range-based resume with new taskId=\(newTaskId), from byte \(existingBytes)")
      return newTaskId
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
    
    // Track bytes downloaded for resume support
    bytesDownloadedByTask[taskId] = bytesWritten
    
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
      self.sendEvent("onDownloadError", [
        "taskId": taskId,
        "error": "Download task info not found",
        "isResumable": false,
        "bytesDownloaded": 0
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
      
      self.sendEvent("onDownloadComplete", [
        "taskId": taskId,
        "filePath": destinationURL.path,
        "url": taskInfo.url
      ])
      
      downloadTasks.removeValue(forKey: taskId)
      lastProgressTime.removeValue(forKey: taskId)
      resumeDataStore.removeValue(forKey: taskId)
      bytesDownloadedByTask.removeValue(forKey: taskId)
      
      // Process next item in queue
      Task {
        do {
          _ = try await self.processNextInQueue()
        } catch {
          print("[BackgroundDownloader] Error processing next: \(error)")
        }
      }
      
    } catch {
      self.sendEvent("onDownloadError", [
        "taskId": taskId,
        "error": "File operation failed: \(error.localizedDescription)",
        "isResumable": false,
        "bytesDownloaded": bytesDownloadedByTask[taskId] ?? 0
      ])
      
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
  
  func handleError(taskId: Int, error: Error, resumeData: Data?) {
    let nsError = error as NSError
    let isCancelled = nsError.code == NSURLErrorCancelled
    
    // If cancelled with resume data, it's a pause — don't treat as error
    if isCancelled && resumeData != nil {
      // This was a pause operation, resume data already stored by pauseDownload
      if resumeData != nil {
        resumeDataStore[taskId] = resumeData
      }
      // Don't process next in queue — this download is paused, not finished
      return
    }
    
    if isCancelled {
      // User cancelled — clean up and move on
      downloadTasks.removeValue(forKey: taskId)
      lastProgressTime.removeValue(forKey: taskId)
      resumeDataStore.removeValue(forKey: taskId)
      bytesDownloadedByTask.removeValue(forKey: taskId)
      
      Task {
        do {
          _ = try await self.processNextInQueue()
        } catch {
          print("[BackgroundDownloader] Error processing next: \(error)")
        }
      }
      return
    }
    
    // Store resume data if available
    let isResumable = resumeData != nil
    if let resumeData = resumeData {
      resumeDataStore[taskId] = resumeData
      if let url = downloadTasks[taskId]?.url {
        resumeDataByUrl[url] = resumeData
      }
    }
    
    // Check if we should auto-retry
    let currentRetryCount = downloadTasks[taskId]?.retryCount ?? 0
    let isTransientError = isTransientNetworkError(nsError)
    
    if isTransientError && currentRetryCount < maxRetries {
      // Auto-retry with exponential backoff
      let delay = retryBaseDelay * pow(2.0, Double(currentRetryCount))
      downloadTasks[taskId]?.retryCount = currentRetryCount + 1
      
      print("[BackgroundDownloader] Auto-retrying task \(taskId) in \(delay)s (attempt \(currentRetryCount + 1)/\(maxRetries))")
      
      Task {
        try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        await self.performRetry(taskId: taskId, resumeData: resumeData)
      }
      return
    }
    
    // Max retries exceeded or non-transient error — report to JS
    print("[BackgroundDownloader] Task \(taskId) error: \(error.localizedDescription), isResumable: \(isResumable)")
    
    self.sendEvent("onDownloadError", [
      "taskId": taskId,
      "error": error.localizedDescription,
      "isResumable": isResumable,
      "bytesDownloaded": bytesDownloadedByTask[taskId] ?? 0
    ])
    
    // Don't clean up task info if resumable — user might want to resume later
    if !isResumable {
      downloadTasks.removeValue(forKey: taskId)
      bytesDownloadedByTask.removeValue(forKey: taskId)
    }
    lastProgressTime.removeValue(forKey: taskId)
    
    // Process next item in queue
    Task {
      do {
        _ = try await self.processNextInQueue()
      } catch {
        print("[BackgroundDownloader] Error processing next: \(error)")
      }
    }
  }
  
  private func isTransientNetworkError(_ error: NSError) -> Bool {
    guard error.domain == NSURLErrorDomain else { return false }
    
    switch error.code {
    case NSURLErrorTimedOut,
         NSURLErrorNetworkConnectionLost,
         NSURLErrorNotConnectedToInternet,
         NSURLErrorCannotConnectToHost,
         NSURLErrorDNSLookupFailed,
         NSURLErrorInternationalRoamingOff,
         NSURLErrorCallIsActive,
         NSURLErrorDataNotAllowed:
      return true
    default:
      return false
    }
  }
  
  @MainActor
  private func performRetry(taskId: Int, resumeData: Data?) async {
    guard let session = self.session else { return }
    
    if let resumeData = resumeData {
      // Resume from resume data
      let newTask = session.downloadTask(withResumeData: resumeData)
      let newTaskId = newTask.taskIdentifier
      
      // Transfer task info
      if let taskInfo = downloadTasks[taskId] {
        downloadTasks[newTaskId] = taskInfo
        downloadTasks.removeValue(forKey: taskId)
      }
      if let bytes = bytesDownloadedByTask[taskId] {
        bytesDownloadedByTask[newTaskId] = bytes
        bytesDownloadedByTask.removeValue(forKey: taskId)
      }
      resumeDataStore.removeValue(forKey: taskId)
      
      newTask.resume()
      
      sendEvent("onDownloadResumed", [
        "taskId": newTaskId,
        "url": downloadTasks[newTaskId]?.url ?? "",
        "bytesDownloaded": bytesDownloadedByTask[newTaskId] ?? 0
      ])
      
      print("[BackgroundDownloader] Retried with resume data, new taskId=\(newTaskId)")
    } else if let taskInfo = downloadTasks[taskId],
              let url = URL(string: taskInfo.url) {
      // Restart from scratch
      var request = URLRequest(url: url)
      request.httpMethod = "GET"
      request.timeoutInterval = 300
      
      let newTask = session.downloadTask(with: request)
      let newTaskId = newTask.taskIdentifier
      
      downloadTasks[newTaskId] = taskInfo
      downloadTasks.removeValue(forKey: taskId)
      bytesDownloadedByTask[newTaskId] = 0
      bytesDownloadedByTask.removeValue(forKey: taskId)
      
      newTask.resume()
      
      sendEvent("onDownloadResumed", [
        "taskId": newTaskId,
        "url": taskInfo.url,
        "bytesDownloaded": 0
      ])
      
      print("[BackgroundDownloader] Retried from scratch, new taskId=\(newTaskId)")
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
    let (url, destinationPath) = downloadQueue.removeFirst()
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
      destinationPath: destinationPath
    )
    
    task.resume()
    
    sendEvent("onDownloadStarted", [
      "taskId": taskId,
      "url": url
    ])
    
    return taskId
  }
  
  static func setBackgroundCompletionHandler(_ handler: @escaping () -> Void) {
    BackgroundDownloaderModule.backgroundCompletionHandler = handler
  }
}
