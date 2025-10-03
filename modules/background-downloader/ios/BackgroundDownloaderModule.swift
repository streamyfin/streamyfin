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
    print("[DownloadSessionDelegate] Delegate initialized with module: \(String(describing: module))")
  }
  
  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64
  ) {
    let progress = totalBytesExpectedToWrite > 0 ? Double(totalBytesWritten) / Double(totalBytesExpectedToWrite) : 0.0
    print("[BackgroundDownloader] Progress callback: taskId=\(downloadTask.taskIdentifier), written=\(totalBytesWritten), total=\(totalBytesExpectedToWrite), progress=\(progress)")
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
    print("[BackgroundDownloader] Download finished callback: taskId=\(downloadTask.taskIdentifier)")
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
    print("[BackgroundDownloader] Task completed: taskId=\(task.taskIdentifier), error=\(String(describing: error))")
    
    if let httpResponse = task.response as? HTTPURLResponse {
      print("[BackgroundDownloader] HTTP Status: \(httpResponse.statusCode)")
      print("[BackgroundDownloader] Content-Length: \(httpResponse.expectedContentLength)")
    }
    
    if let error = error {
      print("[BackgroundDownloader] Task error: \(error.localizedDescription)")
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
      
      // Create a URLRequest to ensure proper handling
      var request = URLRequest(url: url)
      request.httpMethod = "GET"
      request.timeoutInterval = 300
      
      let task = session.downloadTask(with: request)
      let taskId = task.taskIdentifier
      
      print("[BackgroundDownloader] Starting download: taskId=\(taskId), url=\(urlString)")
      print("[BackgroundDownloader] Destination: \(destinationPath ?? "default")")
      
      self.downloadTasks[taskId] = DownloadTaskInfo(
        url: urlString,
        destinationPath: destinationPath
      )
      
      task.resume()
      
      print("[BackgroundDownloader] Task resumed with state: \(self.taskStateString(task.state))")
      print("[BackgroundDownloader] Sending started event")
      
      self.sendEvent("onDownloadStarted", [
        "taskId": taskId,
        "url": urlString
      ])
      
      // Check task state after a brief delay
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        session.getAllTasks { tasks in
          if let downloadTask = tasks.first(where: { $0.taskIdentifier == taskId }) {
            print("[BackgroundDownloader] === 0.5s CHECK ===")
            print("[BackgroundDownloader] Task state: \(self.taskStateString(downloadTask.state))")
            if let response = downloadTask.response as? HTTPURLResponse {
              print("[BackgroundDownloader] Response status: \(response.statusCode)")
              print("[BackgroundDownloader] Expected content length: \(response.expectedContentLength)")
            } else {
              print("[BackgroundDownloader] No HTTP response yet after 0.5s")
            }
          } else {
            print("[BackgroundDownloader] Task not found after 0.5s")
          }
        }
      }
      
      // Additional diagnostics at 1s, 2s, and 3s
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
        session.getAllTasks { tasks in
          if let downloadTask = tasks.first(where: { $0.taskIdentifier == taskId }) {
            print("[BackgroundDownloader] === 1s CHECK ===")
            print("[BackgroundDownloader] Task state: \(self.taskStateString(downloadTask.state))")
            print("[BackgroundDownloader] Task error: \(String(describing: downloadTask.error))")
            print("[BackgroundDownloader] Current request URL: \(downloadTask.currentRequest?.url?.absoluteString ?? "nil")")
            print("[BackgroundDownloader] Original request URL: \(downloadTask.originalRequest?.url?.absoluteString ?? "nil")")
            
            if let response = downloadTask.response as? HTTPURLResponse {
              print("[BackgroundDownloader] HTTP Status: \(response.statusCode)")
              print("[BackgroundDownloader] Expected content length: \(response.expectedContentLength)")
              print("[BackgroundDownloader] All headers: \(response.allHeaderFields)")
            } else {
              print("[BackgroundDownloader] ⚠️ STILL NO HTTP RESPONSE after 1s")
            }
            
            let countOfBytesReceived = downloadTask.countOfBytesReceived
            if countOfBytesReceived > 0 {
              print("[BackgroundDownloader] Bytes received: \(countOfBytesReceived)")
            } else {
              print("[BackgroundDownloader] ⚠️ NO BYTES RECEIVED YET")
            }
          } else {
            print("[BackgroundDownloader] ⚠️ Task disappeared after 1s")
          }
        }
      }
      
      DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
        session.getAllTasks { tasks in
          if let downloadTask = tasks.first(where: { $0.taskIdentifier == taskId }) {
            print("[BackgroundDownloader] === 2s CHECK ===")
            print("[BackgroundDownloader] Task state: \(self.taskStateString(downloadTask.state))")
            let countOfBytesReceived = downloadTask.countOfBytesReceived
            print("[BackgroundDownloader] Bytes received: \(countOfBytesReceived)")
            if downloadTask.error != nil {
              print("[BackgroundDownloader] ⚠️ Task has error: \(String(describing: downloadTask.error))")
            }
          }
        }
      }
      
      DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
        session.getAllTasks { tasks in
          if let downloadTask = tasks.first(where: { $0.taskIdentifier == taskId }) {
            print("[BackgroundDownloader] === 3s CHECK ===")
            print("[BackgroundDownloader] Task state: \(self.taskStateString(downloadTask.state))")
            let countOfBytesReceived = downloadTask.countOfBytesReceived
            print("[BackgroundDownloader] Bytes received: \(countOfBytesReceived)")
            if downloadTask.error != nil {
              print("[BackgroundDownloader] ⚠️ Task has error: \(String(describing: downloadTask.error))")
            }
          }
        }
      }
      
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
        let downloadTasks = self.downloadTasks
        let taskStateString = self.taskStateString
        
        self.session?.getAllTasks { tasks in
          let activeDownloads = tasks.compactMap { task -> [String: Any]? in
            guard task is URLSessionDownloadTask,
                  let info = downloadTasks[task.taskIdentifier] else {
              return nil
            }
            
            return [
              "taskId": task.taskIdentifier,
              "url": info.url,
              "state": taskStateString(task.state)
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
    
    print("[BackgroundDownloader] Sending progress event: taskId=\(taskId), progress=\(progress)")
    
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

