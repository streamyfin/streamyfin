import ExpoModulesCore

public class SfPlayerModule: Module {
    public func definition() -> ModuleDefinition {
        Name("SfPlayer")
        
        // Module-level functions (not tied to a specific view instance)
        Function("setHardwareDecode") { (enabled: Bool) in
            SfPlayerView.setHardwareDecode(enabled)
        }
        
        Function("getHardwareDecode") { () -> Bool in
            return SfPlayerView.getHardwareDecode()
        }
        
        // Enables the module to be used as a native view
        View(SfPlayerView.self) {
            // All video load options are passed via a single "source" prop
            Prop("source") { (view: SfPlayerView, source: [String: Any]?) in
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
            AsyncFunction("play") { (view: SfPlayerView) in
                view.play()
            }
            
            AsyncFunction("pause") { (view: SfPlayerView) in
                view.pause()
            }
            
            AsyncFunction("seekTo") { (view: SfPlayerView, position: Double) in
                view.seekTo(position: position)
            }
            
            AsyncFunction("seekBy") { (view: SfPlayerView, offset: Double) in
                view.seekBy(offset: offset)
            }
            
            AsyncFunction("setSpeed") { (view: SfPlayerView, speed: Double) in
                view.setSpeed(speed: speed)
            }
            
            AsyncFunction("getSpeed") { (view: SfPlayerView) -> Double in
                return view.getSpeed()
            }
            
            AsyncFunction("isPaused") { (view: SfPlayerView) -> Bool in
                return view.isPaused()
            }
            
            AsyncFunction("getCurrentPosition") { (view: SfPlayerView) -> Double in
                return view.getCurrentPosition()
            }
            
            AsyncFunction("getDuration") { (view: SfPlayerView) -> Double in
                return view.getDuration()
            }
            
            // Picture in Picture
            AsyncFunction("startPictureInPicture") { (view: SfPlayerView) in
                view.startPictureInPicture()
            }
            
            AsyncFunction("stopPictureInPicture") { (view: SfPlayerView) in
                view.stopPictureInPicture()
            }
            
            AsyncFunction("isPictureInPictureSupported") { (view: SfPlayerView) -> Bool in
                return view.isPictureInPictureSupported()
            }
            
            AsyncFunction("isPictureInPictureActive") { (view: SfPlayerView) -> Bool in
                return view.isPictureInPictureActive()
            }
            
            AsyncFunction("setAutoPipEnabled") { (view: SfPlayerView, enabled: Bool) in
                view.setAutoPipEnabled(enabled)
            }
            
            // Subtitle functions
            AsyncFunction("getSubtitleTracks") { (view: SfPlayerView) -> [[String: Any]] in
                return view.getSubtitleTracks()
            }
            
            AsyncFunction("setSubtitleTrack") { (view: SfPlayerView, trackId: Int) in
                view.setSubtitleTrack(trackId)
            }
            
            AsyncFunction("disableSubtitles") { (view: SfPlayerView) in
                view.disableSubtitles()
            }
            
            AsyncFunction("getCurrentSubtitleTrack") { (view: SfPlayerView) -> Int in
                return view.getCurrentSubtitleTrack()
            }
            
            AsyncFunction("addSubtitleFile") { (view: SfPlayerView, url: String, select: Bool) in
                view.addSubtitleFile(url: url, select: select)
            }
            
            // Subtitle positioning
            AsyncFunction("setSubtitlePosition") { (view: SfPlayerView, position: Int) in
                view.setSubtitlePosition(position)
            }
            
            AsyncFunction("setSubtitleScale") { (view: SfPlayerView, scale: Double) in
                view.setSubtitleScale(scale)
            }
            
            AsyncFunction("setSubtitleMarginY") { (view: SfPlayerView, margin: Int) in
                view.setSubtitleMarginY(margin)
            }
            
            AsyncFunction("setSubtitleAlignX") { (view: SfPlayerView, alignment: String) in
                view.setSubtitleAlignX(alignment)
            }
            
            AsyncFunction("setSubtitleAlignY") { (view: SfPlayerView, alignment: String) in
                view.setSubtitleAlignY(alignment)
            }
            
            AsyncFunction("setSubtitleFontSize") { (view: SfPlayerView, size: Int) in
                view.setSubtitleFontSize(size)
            }
            
            AsyncFunction("setSubtitleColor") { (view: SfPlayerView, hexColor: String) in
                view.setSubtitleColor(hexColor)
            }
            
            AsyncFunction("setSubtitleBackgroundColor") { (view: SfPlayerView, hexColor: String) in
                view.setSubtitleBackgroundColor(hexColor)
            }

            AsyncFunction("setSubtitleFontName") { (view: SfPlayerView, fontName: String) in
                view.setSubtitleFontName(fontName)
            }
            
            // Audio track functions
            AsyncFunction("getAudioTracks") { (view: SfPlayerView) -> [[String: Any]] in
                return view.getAudioTracks()
            }
            
            AsyncFunction("setAudioTrack") { (view: SfPlayerView, trackId: Int) in
                view.setAudioTrack(trackId)
            }
            
            AsyncFunction("getCurrentAudioTrack") { (view: SfPlayerView) -> Int in
                return view.getCurrentAudioTrack()
            }
            
            // Video zoom
            AsyncFunction("setVideoZoomToFill") { (view: SfPlayerView, enabled: Bool) in
                view.setVideoZoomToFill(enabled)
            }
            
            AsyncFunction("getVideoZoomToFill") { (view: SfPlayerView) -> Bool in
                return view.getVideoZoomToFill()
            }
            
            // Events that the view can send to JavaScript
            Events("onLoad", "onPlaybackStateChange", "onProgress", "onError", "onTracksReady", "onPictureInPictureChange")
        }
    }
}
