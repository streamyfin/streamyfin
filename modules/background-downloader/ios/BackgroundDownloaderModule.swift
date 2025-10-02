import ExpoModulesCore
import Foundation

enum DownloadError: Error {
  case invalidURL
  case fileOperationFailed
  case downloadFailed
}

public class BackgroundDownloaderModule: Module, URLSessionDownloadDelegate {
  private var session: URLSession?
  private static var backgroundCompletionHandler: (() -> Void)?
  private var downloadTasks: [Int: DownloadTaskInfo] = [:]
  
  struct DownloadTaskInfo {
    let url: String
    let destinationPath: String?
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
            guard let downloadTask = task as? URLSessionDownloadTask,
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
    
    self.session = URLSession(
      configuration: config,
      delegate: self,
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
  
  public func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64
  ) {
    let progress = totalBytesExpectedToWrite > 0
      ? Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
      : 0.0
    
    self.sendEvent("onDownloadProgress", [
      "taskId": downloadTask.taskIdentifier,
      "bytesWritten": totalBytesWritten,
      "totalBytes": totalBytesExpectedToWrite,
      "progress": progress
    ])
  }
  
  public func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    let taskId = downloadTask.taskIdentifier
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
  
  public func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    if let error = error {
      let taskId = task.taskIdentifier
      
      let isCancelled = (error as NSError).code == NSURLErrorCancelled
      
      if !isCancelled {
        self.sendEvent("onDownloadError", [
          "taskId": taskId,
          "error": error.localizedDescription
        ])
      }
      
      downloadTasks.removeValue(forKey: taskId)
    }
  }
  
  public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async {
      if let completion = BackgroundDownloaderModule.backgroundCompletionHandler {
        completion()
        BackgroundDownloaderModule.backgroundCompletionHandler = nil
      }
    }
  }
  
  static func setBackgroundCompletionHandler(_ handler: @escaping () -> Void) {
    BackgroundDownloaderModule.backgroundCompletionHandler = handler
  }
}

