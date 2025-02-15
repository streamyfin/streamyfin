import ExpoModulesCore
import AVFoundation

public class HlsDownloaderModule: Module {
  var activeDownloads: [Int: (task: AVAssetDownloadTask, delegate: HLSDownloadDelegate, metadata: [String: Any])] = [:]

  public func definition() -> ModuleDefinition {
    Name("HlsDownloader")

    Events("onProgress", "onError", "onComplete")

      Function("downloadHLSAsset") { (providedId: String, url: String, assetTitle: String, metadata: [String: Any]?) -> Void in
      print("Starting download - ID: \(providedId), URL: \(url), Title: \(assetTitle), Metadata: \(String(describing: metadata))")

      guard let assetURL = URL(string: url) else {
        self.sendEvent("onError", [
        "id": providedId,
          "error": "Invalid URL",
          "state": "FAILED",
          "metadata": metadata ?? [:]
      ])
        return
    }

      let asset = AVURLAsset(url: assetURL)
      let configuration = URLSessionConfiguration.background(withIdentifier: "com.example.hlsdownload")
      let delegate = HLSDownloadDelegate(module: self)
      delegate.providedId = providedId
      let downloadSession = AVAssetDownloadURLSession(
        configuration: configuration,
        assetDownloadDelegate: delegate,
        delegateQueue: OperationQueue.main
      )

      guard let task = downloadSession.makeAssetDownloadTask(
        asset: asset,
        assetTitle: assetTitle,
        assetArtworkData: nil,
        options: nil
      ) else {
        self.sendEvent("onError", [
            "id": providedId,
          "error": "Failed to create download task",
          "state": "FAILED",
          "metadata": metadata ?? [:]
        ])
        return
    }

      delegate.taskIdentifier = task.taskIdentifier
      self.activeDownloads[task.taskIdentifier] = (task, delegate, metadata ?? [:])
      self.sendEvent("onProgress", [
            "id": providedId,
        "progress": 0.0,
        "state": "PENDING",
        "metadata": metadata ?? [:]
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
        let downloaded = delegate.downloadedSeconds
        let total = delegate.totalSeconds
        let progress = total > 0 ? downloaded / total : 0
        downloads.append([
          "id": delegate.providedId.isEmpty ? String(id) : delegate.providedId,
          "progress": progress,
          "bytesDownloaded": downloaded,
          "bytesTotal": total,
          "state": self.mappedState(for: task),
          "metadata": metadata
            ])
        }
      return downloads
    }

    OnStartObserving { }
    OnStopObserving { }
}

  func removeDownload(with id: Int) {
    activeDownloads.removeValue(forKey: id)
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

    func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didLoad timeRange: CMTimeRange, totalTimeRangesLoaded loadedTimeRanges: [NSValue], timeRangeExpectedToLoad: CMTimeRange) {
        let downloaded = loadedTimeRanges.reduce(0.0) { total, value in
            let timeRange = value.timeRangeValue
            return total + CMTimeGetSeconds(timeRange.duration)
        }

        let total = CMTimeGetSeconds(timeRangeExpectedToLoad.duration)
        let metadata = module?.activeDownloads[assetDownloadTask.taskIdentifier]?.metadata ?? [:]

        self.downloadedSeconds = downloaded
        self.totalSeconds = total

        let progress = total > 0 ? downloaded / total : 0

        module?.sendEvent("onProgress", [
            "id": providedId,
            "progress": progress,
            "bytesDownloaded": downloaded,
            "bytesTotal": total,
            "state": progress >= 1.0 ? "DONE" : "DOWNLOADING",
            "metadata": metadata
        ])
    }

    func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didFinishDownloadingTo location: URL) {
          let metadata = module?.activeDownloads[assetDownloadTask.taskIdentifier]?.metadata ?? [:]
          module?.sendEvent("onComplete", [
            "id": providedId,
            "location": location.absoluteString,
            "state": "DONE",
            "metadata": metadata
          ])
          module?.removeDownload(with: assetDownloadTask.taskIdentifier)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            let metadata = module?.activeDownloads[task.taskIdentifier]?.metadata ?? [:]
            module?.sendEvent("onError", [
                "id": providedId,
                "error": error.localizedDescription,
                "state": "FAILED",
                "metadata": metadata
            ])
            module?.removeDownload(with: taskIdentifier)
        }
    }
}
