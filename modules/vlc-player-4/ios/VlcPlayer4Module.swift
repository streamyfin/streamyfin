import ExpoModulesCore

public class VlcPlayer4Module: Module {
    public func definition() -> ModuleDefinition {
        Name("VlcPlayer4")
        View(VlcPlayer4View.self) {
            Prop("source") { (view: VlcPlayer4View, source: [String: Any]) in
                view.setSource(source)
            }

            Prop("paused") { (view: VlcPlayer4View, paused: Bool) in
                if paused {
                    view.pause()
                } else {
                    view.play()
                }
            }

            Events(
                "onPlaybackStateChanged",
                "onVideoStateChange",
                "onVideoLoadStart",
                "onVideoLoadEnd",
                "onVideoProgress",
                "onVideoError",
                "onPipStarted"
            )

            AsyncFunction("startPictureInPicture") { (view: VlcPlayer4View) in
                view.startPictureInPicture()
            }

            AsyncFunction("play") { (view: VlcPlayer4View) in
                view.play()
            }

            AsyncFunction("pause") { (view: VlcPlayer4View) in
                view.pause()
            }

            AsyncFunction("stop") { (view: VlcPlayer4View) in
                view.stop()
            }

            AsyncFunction("seekTo") { (view: VlcPlayer4View, time: Int32) in
                view.seekTo(time)
            }

            AsyncFunction("setAudioTrack") { (view: VlcPlayer4View, trackIndex: Int) in
                view.setAudioTrack(trackIndex)
            }

            AsyncFunction("getAudioTracks") { (view: VlcPlayer4View) -> [[String: Any]]? in
                return view.getAudioTracks()
            }

            AsyncFunction("setSubtitleTrack") { (view: VlcPlayer4View, trackIndex: Int) in
                view.setSubtitleTrack(trackIndex)
            }

            AsyncFunction("getSubtitleTracks") { (view: VlcPlayer4View) -> [[String: Any]]? in
                return view.getSubtitleTracks()
            }

            AsyncFunction("setSubtitleURL") {
                (view: VlcPlayer4View, url: String, name: String) in
                view.setSubtitleURL(url, name: name)
            }
        }
    }
}
