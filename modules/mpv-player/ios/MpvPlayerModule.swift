import ExpoModulesCore

public class MpvPlayerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MpvPlayer")

    // Defines event names that the module can send to JavaScript.
    Events("onChange")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      return "Hello from MPV Player! 👋"
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("setValueAsync") { (value: String) in
      // Send an event to JavaScript.
      self.sendEvent("onChange", [
        "value": value
      ])
    }

    // Enables the module to be used as a native view. Definition components that are accepted as part of the
    // view definition: Prop, Events.
    View(MpvPlayerView.self) {
      // Defines a setter for the `url` prop.
      Prop("url") { (view: MpvPlayerView, url: String) in
        if let videoURL = URL(string: url) {
          view.loadVideo(url: videoURL, headers: nil)
        }
      }
      
      // Defines a setter for headers
      Prop("headers") { (view: MpvPlayerView, headers: [String: String]?) in
        // Headers will be used when loading the video
      }
      
      // Defines a setter for autoplay
      Prop("autoplay") { (view: MpvPlayerView, autoplay: Bool) in
        if autoplay {
          view.play()
        }
      }

      // Async function to play video
      AsyncFunction("play") { (view: MpvPlayerView) in
        view.play()
      }
      
      // Async function to pause video
      AsyncFunction("pause") { (view: MpvPlayerView) in
        view.pause()
      }
      
      // Async function to seek to position
      AsyncFunction("seekTo") { (view: MpvPlayerView, position: Double) in
        view.seekTo(position: position)
      }
      
      // Async function to seek by offset
      AsyncFunction("seekBy") { (view: MpvPlayerView, offset: Double) in
        view.seekBy(offset: offset)
      }
      
      // Async function to set playback speed
      AsyncFunction("setSpeed") { (view: MpvPlayerView, speed: Double) in
        view.setSpeed(speed: speed)
      }
      
      // Function to get current speed
      AsyncFunction("getSpeed") { (view: MpvPlayerView) -> Double in
        return view.getSpeed()
      }
      
      // Function to check if paused
      AsyncFunction("isPaused") { (view: MpvPlayerView) -> Bool in
        return view.isPaused()
      }
      
      // Function to get current position
      AsyncFunction("getCurrentPosition") { (view: MpvPlayerView) -> Double in
        return view.getCurrentPosition()
      }
      
      // Function to get duration
      AsyncFunction("getDuration") { (view: MpvPlayerView) -> Double in
        return view.getDuration()
      }

      // Picture in Picture functions
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
      
      AsyncFunction("addSubtitleFile") { (view: MpvPlayerView, url: String) in
        view.addSubtitleFile(url: url)
      }
      
      // Subtitle positioning functions
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

      // Defines events that the view can send to JavaScript
      Events("onLoad", "onPlaybackStateChange", "onProgress", "onError")
    }
  }
}
