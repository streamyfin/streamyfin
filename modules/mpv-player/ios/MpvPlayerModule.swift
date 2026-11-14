import ExpoModulesCore
import CoreMedia
import VideoToolbox

public class MpvPlayerModule: Module {
  private var nativeLogObserver: NSObjectProtocol?

  private func parseInteger(_ value: Any?) -> Int? {
    if let intValue = value as? Int {
      return intValue
    } else if let doubleValue = value as? Double {
      guard doubleValue.isFinite else { return nil }
      return Int(exactly: doubleValue)
    }
    return nil
  }

  public func definition() -> ModuleDefinition {
    Name("MpvPlayer")

    Events("onNativeLog")

    // Bridge the native player's Logger into the JS app log. Logger posts
    // "LoggerNotification" for every entry but, until now, nothing listened:
    // its file lives in NSTemporaryDirectory() while Settings → Logs exports
    // the JS log from MMKV, so mpv errors and audio-route diagnostics never
    // reached a QA log export. Observed only while JS has a listener.
    OnStartObserving {
      guard self.nativeLogObserver == nil else { return }
      self.nativeLogObserver = NotificationCenter.default.addObserver(
        forName: NSNotification.Name("LoggerNotification"), object: nil, queue: nil
      ) { [weak self] note in
        guard let message = note.userInfo?["message"] as? String else { return }
        let type = note.userInfo?["type"] as? String ?? "General"
        self?.sendEvent("onNativeLog", ["message": message, "type": type])
      }
    }

    OnStopObserving {
      if let observer = self.nativeLogObserver {
        NotificationCenter.default.removeObserver(observer)
        self.nativeLogObserver = nil
      }
    }

    /// Whether this device has a hardware AV1 decoder.
    ///
    /// Apple silicon only gained AV1 decode with A17 Pro / M3, so no Apple TV
    /// shipped to date can decode it in hardware (Apple TV 4K 3rd gen is A15).
    /// When VideoToolbox refuses the codec, mpv falls back to dav1d software
    /// decode, whose `yuv420p10le` output has to be converted and uploaded per
    /// frame before `vo_avfoundation` can enqueue it into the
    /// AVSampleBufferDisplayLayer — on tvOS that stalls, and the display-layer
    /// recovery in MPVLayerRenderer then retries the same failing hardware path.
    ///
    /// The JS device profile calls this to decide whether to advertise AV1 as
    /// direct-play to Jellyfin, so unsupported devices get a transcode instead
    /// of a hang. Querying VideoToolbox rather than hardcoding `Platform.isTV`
    /// means a future AV1-capable Apple TV keeps direct play automatically.
    Function("supportsAv1HardwareDecode") { () -> Bool in
      return VTIsHardwareDecodeSupported(kCMVideoCodecType_AV1)
    }

    // The embedded view: only the subtitle preview in Settings, which plays a
    // silent clip and restyles its subtitles.
    View(MpvPlayerView.self) {
      Prop("source") { (view: MpvPlayerView, source: [String: Any]?) in
        guard let source = source,
              let urlString = source["url"] as? String,
              let videoURL = URL(string: urlString) else { return }

        view.loadVideo(config: VideoLoadConfig(
          url: videoURL,
          autoplay: (source["autoplay"] as? Bool) ?? true,
          initialSubtitleId: self.parseInteger(source["initialSubtitleId"]),
          loop: (source["loop"] as? Bool) ?? false
        ))
      }

      AsyncFunction("setSubtitleScale") { (view: MpvPlayerView, scale: Double) in
        view.setSubtitleScale(scale)
      }

      AsyncFunction("setSubtitleMarginY") { (view: MpvPlayerView, margin: Int) in
        view.setSubtitleMarginY(margin)
      }

      AsyncFunction("setSubtitleAlignX") { (view: MpvPlayerView, alignment: String) in
        view.setSubtitleAlignX(alignment)
      }

      AsyncFunction("setSubtitleAlignY") { (view: MpvPlayerView, alignment: String) in
        view.setSubtitleAlignY(alignment)
      }

      AsyncFunction("setSubtitleStyle") { (view: MpvPlayerView, config: [String: Any]) in
        view.setSubtitleStyle(config: config)
      }

      AsyncFunction("setSubtitleAssOverride") { (view: MpvPlayerView, mode: String) in
        view.setSubtitleAssOverride(mode)
      }

      Events("onTracksReady")
    }
  }
}
