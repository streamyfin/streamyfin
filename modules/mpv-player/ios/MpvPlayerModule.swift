import ExpoModulesCore

public class MpvPlayerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MpvPlayer")

    // Enables the module to be used as a native view
    View(MpvPlayerView.self) {
      // All video load options are passed via a single "source" prop
      Prop("source") { (view: MpvPlayerView, source: [String: Any]?) in
        guard let source = source,
              let urlString = source["url"] as? String,
              let videoURL = URL(string: urlString) else { return }
        
        let config = VideoLoadConfig(
          url: videoURL,
          headers: source["headers"] as? [String: String],
          externalSubtitles: source["externalSubtitles"] as? [String],
          startPosition: source["startPosition"] as? Double,
          autoplay: (source["autoplay"] as? Bool) ?? true,
          initialSubtitleId: source["initialSubtitleId"] as? Int,
          initialAudioId: source["initialAudioId"] as? Int
        )
        
        view.loadVideo(config: config)
      }

      // Playback controls
      AsyncFunction("play") { (view: MpvPlayerView) in
        view.play()
      }
      
      AsyncFunction("pause") { (view: MpvPlayerView) in
        view.pause()
      }
      
      AsyncFunction("seekTo") { (view: MpvPlayerView, position: Double) in
        view.seekTo(position: position)
      }
      
      AsyncFunction("seekBy") { (view: MpvPlayerView, offset: Double) in
        view.seekBy(offset: offset)
      }
      
      AsyncFunction("setSpeed") { (view: MpvPlayerView, speed: Double) in
        view.setSpeed(speed: speed)
      }
      
      AsyncFunction("getSpeed") { (view: MpvPlayerView) -> Double in
        return view.getSpeed()
      }
      
      AsyncFunction("isPaused") { (view: MpvPlayerView) -> Bool in
        return view.isPaused()
      }
      
      AsyncFunction("getCurrentPosition") { (view: MpvPlayerView) -> Double in
        return view.getCurrentPosition()
      }
      
      AsyncFunction("getDuration") { (view: MpvPlayerView) -> Double in
        return view.getDuration()
      }

      // Picture in Picture
      AsyncFunction("startPictureInPicture") { (view: MpvPlayerView) in
        view.startPictureInPicture()
      }
      
      AsyncFunction("stopPictureInPicture") { (view: MpvPlayerView) in
        view.stopPictureInPicture()
      }
      
      AsyncFunction("isPictureInPictureSupported") { (view: MpvPlayerView) -> Bool in
        return view.isPictureInPictureSupported()
      }
      
      AsyncFunction("isPictureInPictureActive") { (view: MpvPlayerView) -> Bool in
        return view.isPictureInPictureActive()
      }
      
      // Subtitle functions
      AsyncFunction("getSubtitleTracks") { (view: MpvPlayerView) -> [[String: Any]] in
        return view.getSubtitleTracks()
      }
      
      AsyncFunction("setSubtitleTrack") { (view: MpvPlayerView, trackId: Int) in
        view.setSubtitleTrack(trackId)
      }
      
      AsyncFunction("disableSubtitles") { (view: MpvPlayerView) in
        view.disableSubtitles()
      }
      
      AsyncFunction("getCurrentSubtitleTrack") { (view: MpvPlayerView) -> Int in
        return view.getCurrentSubtitleTrack()
      }
      
      AsyncFunction("addSubtitleFile") { (view: MpvPlayerView, url: String, select: Bool) in
        view.addSubtitleFile(url: url, select: select)
      }
      
      // Subtitle positioning
      AsyncFunction("setSubtitlePosition") { (view: MpvPlayerView, position: Int) in
        view.setSubtitlePosition(position)
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
      
      AsyncFunction("setSubtitleFontSize") { (view: MpvPlayerView, size: Int) in
        view.setSubtitleFontSize(size)
      }
      
      // Audio track functions
      AsyncFunction("getAudioTracks") { (view: MpvPlayerView) -> [[String: Any]] in
        return view.getAudioTracks()
      }
      
      AsyncFunction("setAudioTrack") { (view: MpvPlayerView, trackId: Int) in
        view.setAudioTrack(trackId)
      }
      
      AsyncFunction("getCurrentAudioTrack") { (view: MpvPlayerView) -> Int in
        return view.getCurrentAudioTrack()
      }

      // Events that the view can send to JavaScript
      Events("onLoad", "onPlaybackStateChange", "onProgress", "onError", "onTracksReady")
    }
  }
}
