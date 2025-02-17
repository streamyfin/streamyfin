import AVFoundation
import ExpoModulesCore

public class HlsDownloaderModule: Module {
  var activeDownloads:
    [Int: (
      task: AVAssetDownloadTask, delegate: HLSDownloadDelegate, metadata: [String: Any],
      startTime: Double
    )] = [:]

  public func definition() -> ModuleDefinition {
    Name("HlsDownloader")

    Events("onProgress", "onError", "onComplete")

    Function("downloadHLSAsset") {
      (providedId: String, url: String, metadata: [String: Any]?) -> Void in
      let startTime = Date().timeIntervalSince1970
      print(
        "Starting download - ID: \(providedId), URL: \(url), Metadata: \(String(describing: metadata)), StartTime: \(startTime)"
      )

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

      // Add asset options to allow cellular downloads and specify allowed media types
      let asset = AVURLAsset(
        url: assetURL,
        options: [
          "AVURLAssetOutOfBandMIMETypeKey": "application/x-mpegURL",
          "AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": "Streamyfin/1.0"],
          "AVURLAssetAllowsCellularAccessKey": true,
        ])

      // Validate the asset before proceeding
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

          let configuration = URLSessionConfiguration.background(
            withIdentifier: "com.streamyfin.hlsdownload")
          configuration.allowsCellularAccess = true
          configuration.sessionSendsLaunchEvents = true
          configuration.isDiscretionary = false

          let delegate = HLSDownloadDelegate(module: self)
          delegate.providedId = providedId
          delegate.startTime = startTime

          let downloadSession = AVAssetDownloadURLSession(
            configuration: configuration,
            assetDownloadDelegate: delegate,
            delegateQueue: OperationQueue.main
          )

          guard
            let task = downloadSession.makeAssetDownloadTask(
              asset: asset,
              assetTitle: providedId,
              assetArtworkData: nil,
              options: [
                AVAssetDownloadTaskMinimumRequiredMediaBitrateKey: 265_000,
                AVAssetDownloadTaskMinimumRequiredPresentationSizeKey: NSValue(
                  cgSize: CGSize(width: 480, height: 360)),
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
          print("Download task started with identifier: \(task.taskIdentifier)")
        }
      }
    }

    Function("checkForExistingDownloads") {
      () -> [[String: Any]] in
      var downloads: [[String: Any]] = []
      for (id, pair) in self.activeDownloads {
        let task = pair.task
        let delegate = pair.delegate
        let metadata = pair.metadata
        let startTime = pair.startTime
        let downloaded = delegate.downloadedSeconds
        let total = delegate.totalSeconds
        let progress = total > 0 ? downloaded / total : 0
        downloads.append([
          "id": delegate.providedId.isEmpty ? String(id) : delegate.providedId,
          "progress": progress,
          "secondsDownloaded": downloaded,
          "secondsTotal": total,
          "state": self.mappedState(for: task),
          "metadata": metadata,
          "startTime": startTime,
        ])
      }
      return downloads
    }

    Function("cancelDownload") { (providedId: String) -> Void in
      guard
        let entry = self.activeDownloads.first(where: { $0.value.delegate.providedId == providedId }
        )
      else {
        print("No active download found with identifier: \(providedId)")
        return
      }
      let (task, delegate, metadata, startTime) = entry.value
      task.cancel()
      self.activeDownloads.removeValue(forKey: task.taskIdentifier)
      self.sendEvent(
        "onError",
        [
          "id": providedId,
          "error": "Download cancelled",
          "state": "CANCELLED",
          "metadata": metadata,
          "startTime": startTime,
        ])
      print("Download cancelled for identifier: \(providedId)")
    }

    OnStartObserving {}
    OnStopObserving {}
  }

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
    if fm.fileExists(atPath: newLocation.path) {
      try fm.removeItem(at: newLocation)
    }

    // If the original file exists, move it. Otherwise, if newLocation already exists, assume it was moved.
    if fm.fileExists(atPath: originalLocation.path) {
      try fm.moveItem(at: originalLocation, to: newLocation)
    } else if !fm.fileExists(atPath: newLocation.path) {
      throw NSError(domain: NSCocoaErrorDomain, code: NSFileNoSuchFileError, userInfo: nil)
    }
    return newLocation
  }

  func mappedState(for task: URLSessionTask, errorOccurred: Bool = false) -> String {
    if errorOccurred { return "FAILED" }
    switch task.state {
    case .running: return "DOWNLOADING"
    case .suspended: return "PAUSED"
    case .completed: return "DONE"
    case .canceling: return "STOPPED"
    @unknown default: return "PENDING"
    }
  }
}

class HLSDownloadDelegate: NSObject, AVAssetDownloadDelegate {
  weak var module: HlsDownloaderModule?
  var taskIdentifier: Int = 0
  var providedId: String = ""
  var downloadedSeconds: Double = 0
  var totalSeconds: Double = 0
  var startTime: Double = 0

  init(module: HlsDownloaderModule) {
    self.module = module
  }

  func urlSession(
    _ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didLoad timeRange: CMTimeRange,
    totalTimeRangesLoaded loadedTimeRanges: [NSValue], timeRangeExpectedToLoad: CMTimeRange
  ) {
    let downloaded = loadedTimeRanges.reduce(0.0) { total, value in
      let timeRange = value.timeRangeValue
      return total + CMTimeGetSeconds(timeRange.duration)
    }

    let total = CMTimeGetSeconds(timeRangeExpectedToLoad.duration)
    let metadata = module?.activeDownloads[assetDownloadTask.taskIdentifier]?.metadata ?? [:]
    let startTime = module?.activeDownloads[assetDownloadTask.taskIdentifier]?.startTime ?? 0

    self.downloadedSeconds = downloaded
    self.totalSeconds = total

    let progress = total > 0 ? downloaded / total : 0

    module?.sendEvent(
      "onProgress",
      [
        "id": providedId,
        "progress": progress,
        "secondsDownloaded": downloaded,
        "secondsTotal": total,
        "state": progress >= 1.0 ? "DONE" : "DOWNLOADING",
        "metadata": metadata,
        "startTime": startTime,
      ])
  }

  func urlSession(
    _ session: URLSession, assetDownloadTask: AVAssetDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    let metadata = module?.activeDownloads[assetDownloadTask.taskIdentifier]?.metadata ?? [:]
    let startTime = module?.activeDownloads[assetDownloadTask.taskIdentifier]?.startTime ?? 0
    let folderName = providedId
    do {
      guard let module = module else { return }
      let newLocation = try module.persistDownloadedFolder(
        originalLocation: location, folderName: folderName)

      // Calculate download size
      // let fileManager = FileManager.default
      // let enumerator = fileManager.enumerator(
      //   at: newLocation,
      //   includingPropertiesForKeys: [.totalFileAllocatedSizeKey],
      //   options: [.skipsHiddenFiles],
      //   errorHandler: nil)!

      // var totalSize: Int64 = 0
      // while let filePath = enumerator.nextObject() as? URL {
      //   do {
      //     let resourceValues = try filePath.resourceValues(forKeys: [.totalFileAllocatedSizeKey])
      //     if let size = resourceValues.totalFileAllocatedSize {
      //       totalSize += Int64(size)
      //     }
      //   } catch {
      //     print("Error calculating size: \(error)")
      //   }
      // }

      if !metadata.isEmpty {
        let metadataLocation = newLocation.deletingLastPathComponent().appendingPathComponent(
          "\(providedId).json")
        let jsonData = try JSONSerialization.data(withJSONObject: metadata, options: .prettyPrinted)
        try jsonData.write(to: metadataLocation)
      }

      Task {
        do {
          try await rewriteM3U8Files(baseDir: newLocation.path)
          module.sendEvent(
            "onComplete",
            [
              "id": providedId,
              "location": newLocation.absoluteString,
              "state": "DONE",
              "metadata": metadata,
              "startTime": startTime,
            ])
        } catch {
          module.sendEvent(
            "onError",
            [
              "id": providedId,
              "error": error.localizedDescription,
              "state": "FAILED",
              "metadata": metadata,
              "startTime": startTime,
            ])
        }
      }
    } catch {
      module?.sendEvent(
        "onError",
        [
          "id": providedId,
          "error": error.localizedDescription,
          "state": "FAILED",
          "metadata": metadata,
          "startTime": startTime,
        ])
    }
    module?.removeDownload(with: assetDownloadTask.taskIdentifier)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error = error {
      let metadata = module?.activeDownloads[task.taskIdentifier]?.metadata ?? [:]
      let startTime = module?.activeDownloads[task.taskIdentifier]?.startTime ?? 0
      module?.sendEvent(
        "onError",
        [
          "id": providedId,
          "error": error.localizedDescription,
          "state": "FAILED",
          "metadata": metadata,
          "startTime": startTime,
        ])
      module?.removeDownload(with: taskIdentifier)
    }
  }
}
