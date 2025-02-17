import AVFoundation
import ExpoModulesCore

// Separate delegate class for managing download-specific state
class HLSDownloadDelegate: NSObject, AVAssetDownloadDelegate {
  weak var module: HlsDownloaderModule?
  var taskIdentifier: Int = 0
  var providedId: String = ""
  var downloadedSeconds: Double = 0
  var totalSeconds: Double = 0
  var startTime: Double = 0

  init(module: HlsDownloaderModule) {
    self.module = module
    super.init()
  }

  public func urlSession(
    _ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didLoad timeRange: CMTimeRange,
    totalTimeRangesLoaded loadedTimeRanges: [NSValue], timeRangeExpectedToLoad: CMTimeRange
  ) {
    module?.urlSession(
      session, assetDownloadTask: assetDownloadTask, didLoad: timeRange,
      totalTimeRangesLoaded: loadedTimeRanges, timeRangeExpectedToLoad: timeRangeExpectedToLoad)
  }

  public func urlSession(
    _ session: URLSession, assetDownloadTask: AVAssetDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    module?.urlSession(
      session, assetDownloadTask: assetDownloadTask, didFinishDownloadingTo: location)
  }

  public func urlSession(
    _ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?
  ) {
    module?.urlSession(session, task: task, didCompleteWithError: error)
  }
}

public class HlsDownloaderModule: Module {
  // Main delegate handler for the download session
  private lazy var delegateHandler: HLSDownloadDelegate = {
    return HLSDownloadDelegate(module: self)
  }()

  // Track active downloads with all necessary information
  var activeDownloads:
    [Int: (
      task: AVAssetDownloadTask,
      delegate: HLSDownloadDelegate,
      metadata: [String: Any],
      startTime: Double
    )] = [:]

  // Configure background download session
  private lazy var downloadSession: AVAssetDownloadURLSession = {
    let configuration = URLSessionConfiguration.background(
      withIdentifier: "com.example.hlsdownload")
    configuration.allowsCellularAccess = true
    configuration.sessionSendsLaunchEvents = true
    configuration.isDiscretionary = false
    return AVAssetDownloadURLSession(
      configuration: configuration,
      assetDownloadDelegate: delegateHandler,
      delegateQueue: OperationQueue.main
    )
  }()

  public func definition() -> ModuleDefinition {
    Name("HlsDownloader")

    Events("onProgress", "onError", "onComplete")

    Function("downloadHLSAsset") {
      (providedId: String, url: String, metadata: [String: Any]?) -> Void in
      let startTime = Date().timeIntervalSince1970

      // Check if download already exists
      let fm = FileManager.default
      let docs = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
      let downloadsDir = docs.appendingPathComponent("downloads", isDirectory: true)
      let potentialExistingLocation = downloadsDir.appendingPathComponent(
        providedId, isDirectory: true)

      // If download exists and is valid, return immediately
      if fm.fileExists(atPath: potentialExistingLocation.path) {
        if let files = try? fm.contentsOfDirectory(atPath: potentialExistingLocation.path),
          files.contains(where: { $0.hasSuffix(".m3u8") })
        {
          self.sendEvent(
            "onComplete",
            [
              "id": providedId,
              "location": potentialExistingLocation.absoluteString,
              "state": "DONE",
              "metadata": metadata ?? [:],
              "startTime": startTime,
            ])
          return
        } else {
          try? fm.removeItem(at: potentialExistingLocation)
        }
      }

      // Validate URL
      guard let assetURL = URL(string: url) else {
        self.sendEvent(
          "onError",
          [
            "id": providedId,
            "error": "Invalid URL",
            "state": "FAILED",
            "metadata": metadata ?? [:],
            "startTime": startTime,
          ])
        return
      }

      // Configure asset with necessary options
      let asset = AVURLAsset(
        url: assetURL,
        options: [
          "AVURLAssetOutOfBandMIMETypeKey": "application/x-mpegURL",
          "AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": "MyApp/1.0"],
          "AVURLAssetAllowsCellularAccessKey": true,
        ])

      // Load asset asynchronously
      asset.loadValuesAsynchronously(forKeys: ["playable", "duration"]) {
        var error: NSError?
        let status = asset.statusOfValue(forKey: "playable", error: &error)

        DispatchQueue.main.async {
          if status == .failed || error != nil {
            self.sendEvent(
              "onError",
              [
                "id": providedId,
                "error":
                  "Asset validation failed: \(error?.localizedDescription ?? "Unknown error")",
                "state": "FAILED",
                "metadata": metadata ?? [:],
                "startTime": startTime,
              ])
            return
          }

          // Create download task with quality options
          guard
            let task = self.downloadSession.makeAssetDownloadTask(
              asset: asset,
              assetTitle: providedId,
              assetArtworkData: nil,
              options: [
                AVAssetDownloadTaskMinimumRequiredMediaBitrateKey: 265_000,
                AVAssetDownloadTaskMinimumRequiredPresentationSizeKey: NSValue(
                  cgSize: CGSize(width: 480, height: 360)
                ),
              ]
            )
          else {
            self.sendEvent(
              "onError",
              [
                "id": providedId,
                "error": "Failed to create download task",
                "state": "FAILED",
                "metadata": metadata ?? [:],
                "startTime": startTime,
              ])
            return
          }

          // Configure delegate for this download
          let delegate = HLSDownloadDelegate(module: self)
          delegate.providedId = providedId
          delegate.startTime = startTime
          delegate.taskIdentifier = task.taskIdentifier

          // Store download information
          self.activeDownloads[task.taskIdentifier] = (task, delegate, metadata ?? [:], startTime)

          // Send initial progress event
          self.sendEvent(
            "onProgress",
            [
              "id": providedId,
              "progress": 0.0,
              "state": "PENDING",
              "metadata": metadata ?? [:],
              "startTime": startTime,
            ])

          // Start the download
          task.resume()
        }
      }
    }

    // Additional methods and event handlers...
    Function("cancelDownload") { (providedId: String) -> Void in
      guard
        let entry = self.activeDownloads.first(where: { $0.value.delegate.providedId == providedId }
        )
      else {
        return
      }

      let (task, _, metadata, startTime) = entry.value

      self.sendEvent(
        "onError",
        [
          "id": providedId,
          "error": "Download cancelled",
          "state": "CANCELLED",
          "metadata": metadata,
          "startTime": startTime,
        ])

      task.cancel()
      self.activeDownloads.removeValue(forKey: task.taskIdentifier)
    }
  }

  // Helper methods
  func removeDownload(with id: Int) {
    activeDownloads.removeValue(forKey: id)
  }

  func persistDownloadedFolder(originalLocation: URL, folderName: String) throws -> URL {
    let fm = FileManager.default
    let docs = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let downloadsDir = docs.appendingPathComponent("downloads", isDirectory: true)

    if !fm.fileExists(atPath: downloadsDir.path) {
      try fm.createDirectory(at: downloadsDir, withIntermediateDirectories: true)
    }

    let newLocation = downloadsDir.appendingPathComponent(folderName, isDirectory: true)
    let tempLocation = downloadsDir.appendingPathComponent("\(folderName)_temp", isDirectory: true)

    if fm.fileExists(atPath: tempLocation.path) {
      try fm.removeItem(at: tempLocation)
    }

    try fm.moveItem(at: originalLocation, to: tempLocation)

    if fm.fileExists(atPath: newLocation.path) {
      try fm.removeItem(at: newLocation)
    }

    try fm.moveItem(at: tempLocation, to: newLocation)

    return newLocation
  }
}

// Extension for URL session delegate methods
extension HlsDownloaderModule {
  func urlSession(
    _ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didLoad timeRange: CMTimeRange,
    totalTimeRangesLoaded loadedTimeRanges: [NSValue], timeRangeExpectedToLoad: CMTimeRange
  ) {
    guard let downloadInfo = activeDownloads[assetDownloadTask.taskIdentifier] else { return }

    let downloaded = loadedTimeRanges.reduce(0.0) { total, value in
      let timeRange = value.timeRangeValue
      return total + CMTimeGetSeconds(timeRange.duration)
    }

    let total = CMTimeGetSeconds(timeRangeExpectedToLoad.duration)
    let progress = total > 0 ? downloaded / total : 0

    sendEvent(
      "onProgress",
      [
        "id": downloadInfo.delegate.providedId,
        "progress": progress,
        "secondsDownloaded": downloaded,
        "secondsTotal": total,
        "state": progress >= 1.0 ? "DONE" : "DOWNLOADING",
        "metadata": downloadInfo.metadata,
        "startTime": downloadInfo.startTime,
        "taskId": assetDownloadTask.taskIdentifier,
      ])
  }

  func urlSession(
    _ session: URLSession, assetDownloadTask: AVAssetDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    guard let downloadInfo = activeDownloads[assetDownloadTask.taskIdentifier] else { return }

    do {
      let newLocation = try persistDownloadedFolder(
        originalLocation: location,
        folderName: downloadInfo.delegate.providedId)

      if !downloadInfo.metadata.isEmpty {
        let metadataLocation = newLocation.deletingLastPathComponent().appendingPathComponent(
          "\(downloadInfo.delegate.providedId).json")
        let jsonData = try JSONSerialization.data(
          withJSONObject: downloadInfo.metadata,
          options: .prettyPrinted)
        try jsonData.write(to: metadataLocation)
      }

      sendEvent(
        "onComplete",
        [
          "id": downloadInfo.delegate.providedId,
          "location": newLocation.absoluteString,
          "state": "DONE",
          "metadata": downloadInfo.metadata,
          "startTime": downloadInfo.startTime,
        ])
    } catch {
      sendEvent(
        "onError",
        [
          "id": downloadInfo.delegate.providedId,
          "error": error.localizedDescription,
          "state": "FAILED",
          "metadata": downloadInfo.metadata,
          "startTime": downloadInfo.startTime,
        ])
    }

    removeDownload(with: assetDownloadTask.taskIdentifier)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let error = error,
      let downloadInfo = activeDownloads[task.taskIdentifier]
    else { return }

    if (error as NSError).code == NSURLErrorCancelled {
      removeDownload(with: task.taskIdentifier)
      return
    }

    sendEvent(
      "onError",
      [
        "id": downloadInfo.delegate.providedId,
        "error": error.localizedDescription,
        "state": "FAILED",
        "metadata": downloadInfo.metadata,
        "startTime": downloadInfo.startTime,
      ])

    removeDownload(with: task.taskIdentifier)
  }
}
