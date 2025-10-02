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
  
  public func definition() -> ModuleDefinition {
    Name("BackgroundDownloader")
    
    Events(
      "onDownloadProgress",
      "onDownloadComplete",
      "onDownloadError",
      "onDownloadStarted"
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
      
      let task = session.downloadTask(with: url)
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
    
    Function("cancelDownload") { (taskId: Int) in
      self.session?.getAllTasks { tasks in
        for task in tasks where task.taskIdentifier == taskId {
          task.cancel()
          self.downloadTasks.removeValue(forKey: taskId)
        }
      }
    }
    
    Function("cancelAllDownloads") {
      self.session?.getAllTasks { tasks in
        for task in tasks {
          task.cancel()
        }
        self.downloadTasks.removeAll()
      }
    }
    
    AsyncFunction("getActiveDownloads") { () -> [[String: Any]] in
      return try await withCheckedThrowingContinuation { continuation in
        self.session?.getAllTasks { tasks in
          let activeDownloads = tasks.compactMap { task -> [String: Any]? in
            guard task is URLSessionDownloadTask,
                  let info = self.downloadTasks[task.taskIdentifier] else {
              return nil
            }
            
            return [
              "taskId": task.taskIdentifier,
              "url": info.url,
              "state": self.taskStateString(task.state)
            ]
          }
          continuation.resume(returning: activeDownloads)
        }
      }
    }
  }
  
  private func initializeSession() {
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
  }
  
  private func taskStateString(_ state: URLSessionTask.State) -> String {
    switch state {
    case .running:
      return "running"
    case .suspended:
      return "suspended"
    case .canceling:
      return "canceling"
    case .completed:
      return "completed"
    @unknown default:
      return "unknown"
    }
  }
  
  // Handler methods called by the delegate
  func handleProgress(taskId: Int, bytesWritten: Int64, totalBytes: Int64) {
    let progress = totalBytes > 0
      ? Double(bytesWritten) / Double(totalBytes)
      : 0.0
    
    self.sendEvent("onDownloadProgress", [
      "taskId": taskId,
      "bytesWritten": bytesWritten,
      "totalBytes": totalBytes,
      "progress": progress
    ])
  }
  
  func handleDownloadComplete(taskId: Int, location: URL, downloadTask: URLSessionDownloadTask) {
    guard let taskInfo = downloadTasks[taskId] else {
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
      
      self.sendEvent("onDownloadComplete", [
        "taskId": taskId,
        "filePath": destinationURL.path,
        "url": taskInfo.url
      ])
      
      downloadTasks.removeValue(forKey: taskId)
      
    } catch {
      self.sendEvent("onDownloadError", [
        "taskId": taskId,
        "error": "File operation failed: \(error.localizedDescription)"
      ])
    }
  }
  
  func handleError(taskId: Int, error: Error) {
    let isCancelled = (error as NSError).code == NSURLErrorCancelled
    
    if !isCancelled {
      self.sendEvent("onDownloadError", [
        "taskId": taskId,
        "error": error.localizedDescription
      ])
    }
    
    downloadTasks.removeValue(forKey: taskId)
  }
  
  static func setBackgroundCompletionHandler(_ handler: @escaping () -> Void) {
    BackgroundDownloaderModule.backgroundCompletionHandler = handler
  }
}

