import ExpoModulesCore
import AVFoundation

public class HlsDownloaderModule: Module {
  // Optional: Keep a strong reference to the delegate (for the current download)
  private var currentDelegate: HLSDownloadDelegate?

  public func definition() -> ModuleDefinition {
    Name("ExpoHlsDownloader")
    
    // Declare the events you wish to expose.
    Events("onProgress", "onError", "onComplete")
    
    // Expose the download function.
    Function("downloadHLSAsset") { (url: String, assetTitle: String) -> Void in
      print("[HlsDownloaderModule] downloadHLSAsset called with url: \(url) and assetTitle: \(assetTitle)")
      
      guard let assetURL = URL(string: url) else {
        print("[HlsDownloaderModule] Invalid URL: \(url)")
        self.sendEvent("onError", ["error": "Invalid URL"])
        return
      }
      
      let asset = AVURLAsset(url: assetURL)
      let configuration = URLSessionConfiguration.background(withIdentifier: "com.example.hlsdownload.\(UUID().uuidString)")
      print("[HlsDownloaderModule] Created background session configuration")
      
      let delegate = HLSDownloadDelegate(module: self)
      self.currentDelegate = delegate
      
      let downloadSession = AVAssetDownloadURLSession(
        configuration: configuration,
        assetDownloadDelegate: delegate,
        delegateQueue: OperationQueue.main
      )
      print("[HlsDownloaderModule] Created download session")
      
      guard let task = downloadSession.makeAssetDownloadTask(
        asset: asset,
        assetTitle: assetTitle,
        assetArtworkData: nil,
        options: nil
      ) else {
        print("[HlsDownloaderModule] Failed to create download task")
        self.sendEvent("onError", ["error": "Failed to create download task"])
        return
      }
      
      print("[HlsDownloaderModule] Starting download task for asset: \(assetTitle)")
      task.resume()
    }
    
    // Called when JavaScript starts observing events.
    OnStartObserving {
      print("[HlsDownloaderModule] Started observing events")
      // Additional setup if needed.
    }
    
    // Called when JavaScript stops observing events.
    OnStopObserving {
      print("[HlsDownloaderModule] Stopped observing events")
      // Clean up if necessary.
    }
  }
}

// Delegate that listens to AVAssetDownloadURLSession events and emits them to JS.
class HLSDownloadDelegate: NSObject, AVAssetDownloadDelegate {
  weak var module: HlsDownloaderModule?
  
  init(module: HlsDownloaderModule) {
    self.module = module
  }
  
  func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask,
                  didLoad timeRange: CMTimeRange,
                  totalTimeRangesLoaded loadedTimeRanges: [NSValue],
                  timeRangeExpectedToLoad: CMTimeRange) {
    let loadedSeconds = loadedTimeRanges.reduce(0.0) { result, value in
      result + CMTimeGetSeconds(value.timeRangeValue.duration)
    }
    let totalSeconds = CMTimeGetSeconds(timeRangeExpectedToLoad.duration)
    let progress = totalSeconds > 0 ? loadedSeconds / totalSeconds : 0
    print("[HLSDownloadDelegate] Progress: \(progress * 100)%")
    module?.sendEvent("onProgress", ["progress": progress])
  }
  
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error = error {
      print("[HLSDownloadDelegate] Error: \(error.localizedDescription)")
      module?.sendEvent("onError", ["error": error.localizedDescription])
    }
  }
  
  func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask,
                  didFinishDownloadingTo location: URL) {
    print("[HLSDownloadDelegate] Download complete: \(location.absoluteString)")
    module?.sendEvent("onComplete", ["location": location.absoluteString])
  }
}
