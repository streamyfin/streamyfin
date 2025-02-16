import AVFoundation
import ExpoModulesCore

public class HlsDownloaderModule: Module {
  var activeDownloads:
    [Int: (
      task: AVAssetDownloadTask, delegate: HLSDownloadDelegate, metadata: [String: Any],
      startTime: Date
    )] = [:]

  public func definition() -> ModuleDefinition {
    Name("HlsDownloader")

    Events("onProgress", "onError", "onComplete")

    Function("downloadHLSAsset") {
      (providedId: String, url: String, metadata: [String: Any]?) -> Void in
      print(
        "Starting download - ID: \(providedId), URL: \(url), Metadata: \(String(describing: metadata))"
      )

      guard let assetURL = URL(string: url) else {
        self.sendEvent(
          "onError",
          [
            "id": providedId,
            "error": "Invalid URL",
            "state": "FAILED",
            "metadata": metadata ?? [:],
          ])
        return
      }

      let asset = AVURLAsset(url: assetURL)
      let configuration = URLSessionConfiguration.background(
        withIdentifier: "com.example.hlsdownload")
      let delegate = HLSDownloadDelegate(module: self)
      delegate.providedId = providedId
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
          options: nil
        )
      else {
        self.sendEvent(
          "onError",
          [
            "id": providedId,
            "error": "Failed to create download task",
            "state": "FAILED",
            "metadata": metadata ?? [:],
          ])
        return
      }

      delegate.taskIdentifier = task.taskIdentifier
      self.activeDownloads[task.taskIdentifier] = (task, delegate, metadata ?? [:], Date())
      self.sendEvent(
        "onProgress",
        [
          "id": providedId,
          "progress": 0.0,
          "state": "PENDING",
          "metadata": metadata ?? [:],
          "startTime": Date().timeIntervalSince1970,
        ])

      task.resume()
      print("Download task started with identifier: \(task.taskIdentifier)")
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
          "bytesDownloaded": downloaded,
          "bytesTotal": total,
          "state": self.mappedState(for: task),
          "metadata": metadata,
          "startTime": startTime.timeIntervalSince1970,
        ])
      }
      return downloads
    }

    OnStartObserving {}
    OnStopObserving {}
  }

  func removeDownload(with id: Int) {
    activeDownloads.removeValue(forKey: id)
  }

  func persistDownloadedFolder(originalLocation: URL, folderName: String) throws -> URL {
    let fileManager = FileManager.default
    let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let destinationDir = documents.appendingPathComponent("downloads", isDirectory: true)
    if !fileManager.fileExists(atPath: destinationDir.path) {
      try fileManager.createDirectory(at: destinationDir, withIntermediateDirectories: true)
    }
    let newLocation = destinationDir.appendingPathComponent(folderName, isDirectory: true)
    if fileManager.fileExists(atPath: newLocation.path) {
      try fileManager.removeItem(at: newLocation)
    }
    try fileManager.moveItem(at: originalLocation, to: newLocation)
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
    let downloadInfo = module?.activeDownloads[assetDownloadTask.taskIdentifier]
    let metadata = downloadInfo?.metadata ?? [:]
    let startTime = downloadInfo?.startTime.timeIntervalSince1970 ?? Date().timeIntervalSince1970

    self.downloadedSeconds = downloaded
    self.totalSeconds = total

    let progress = total > 0 ? downloaded / total : 0

    module?.sendEvent(
      "onProgress",
      [
        "id": providedId,
        "progress": progress,
        "bytesDownloaded": downloaded,
        "bytesTotal": total,
        "state": progress >= 1.0 ? "DONE" : "DOWNLOADING",
        "metadata": metadata,
        "startTime": startTime,
      ])
  }

  func urlSession(
    _ session: URLSession, assetDownloadTask: AVAssetDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    let downloadInfo = module?.activeDownloads[assetDownloadTask.taskIdentifier]
    let metadata = downloadInfo?.metadata ?? [:]
    let startTime = downloadInfo?.startTime.timeIntervalSince1970 ?? Date().timeIntervalSince1970
    let folderName = providedId
    do {
      guard let module = module else { return }
      let newLocation = try module.persistDownloadedFolder(
        originalLocation: location, folderName: folderName)

      if !metadata.isEmpty {
        let metadataLocation = newLocation.deletingLastPathComponent().appendingPathComponent(
          "\(providedId).json")
        let jsonData = try JSONSerialization.data(withJSONObject: metadata, options: .prettyPrinted)
        try jsonData.write(to: metadataLocation)
      }

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
      let downloadInfo = module?.activeDownloads[task.taskIdentifier]
      let metadata = downloadInfo?.metadata ?? [:]
      let startTime = downloadInfo?.startTime.timeIntervalSince1970 ?? Date().timeIntervalSince1970

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
