import AVFoundation
import ExpoModulesCore
import UserNotifications

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
  private lazy var delegateHandler: HLSDownloadDelegate = {
    return HLSDownloadDelegate(module: self)
  }()

  var activeDownloads:
    [Int: (
      task: AVAssetDownloadTask,
      delegate: HLSDownloadDelegate,
      metadata: [String: Any],
      startTime: Double
    )] = [:]

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

    // Function("requestNotificationPermission") { () -> Bool in
    //   var permissionGranted = false
    //   let semaphore = DispatchSemaphore(value: 0)

    //   UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) {
    //     granted, error in
    //     permissionGranted = granted
    //     semaphore.signal()
    //   }

    //   _ = semaphore.wait(timeout: .now() + 5.0)
    //   return permissionGranted
    // }

    Function("getActiveDownloads") { () -> [[String: Any]] in
      return activeDownloads.map { (taskId, downloadInfo) in
        return [
          "id": downloadInfo.delegate.providedId,
          "state": "DOWNLOADING",
          "metadata": downloadInfo.metadata,
          "startTime": downloadInfo.startTime,
          "taskId": taskId,
        ]
      }
    }

    Function("downloadHLSAsset") {
      (providedId: String, url: String, metadata: [String: Any]?) -> Void in
      let startTime = Date().timeIntervalSince1970

      let fm = FileManager.default
      let docs = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
      let downloadsDir = docs.appendingPathComponent("downloads", isDirectory: true)
      let potentialExistingLocation = downloadsDir.appendingPathComponent(
        providedId, isDirectory: true)

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

      let asset = AVURLAsset(
        url: assetURL,
        options: [
          "AVURLAssetOutOfBandMIMETypeKey": "application/x-mpegURL",
          "AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": "MyApp/1.0"],
          "AVURLAssetAllowsCellularAccessKey": true,
        ])

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

          let delegate = HLSDownloadDelegate(module: self)
          delegate.providedId = providedId
          delegate.startTime = startTime
          delegate.taskIdentifier = task.taskIdentifier

          self.activeDownloads[task.taskIdentifier] = (task, delegate, metadata ?? [:], startTime)

          self.sendEvent(
            "onProgress",
            [
              "id": providedId,
              "progress": 0.0,
              "state": "PENDING",
              "metadata": metadata ?? [:],
              "startTime": startTime,
            ])

          task.resume()
        }
      }
    }

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

  func removeDownload(with id: Int) {
    activeDownloads.removeValue(forKey: id)
  }

  private func sendDownloadCompletionNotification(title: String, body: String) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default

    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
    let request = UNNotificationRequest(
      identifier: UUID().uuidString,
      content: content,
      trigger: trigger
    )

    UNUserNotificationCenter.current().add(request) { error in
      if let error = error {
        print("Error showing notification: \(error)")
      }
    }
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

      Task {
        do {
          try await rewriteM3U8Files(baseDir: newLocation.path)

          // Safely access metadata for notification
          let notificationBody: String
          if let item = downloadInfo.metadata["item"] as? [String: Any],
            let name = item["Name"] as? String
          {
            notificationBody = "\(name) has finished downloading."
          } else {
            notificationBody = "Download completed successfully."
          }

          sendDownloadCompletionNotification(
            title: "Download Complete",
            body: notificationBody
          )

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
      }

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
