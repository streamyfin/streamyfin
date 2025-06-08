import ExpoModulesCore

public class VlcPlayer3Module: Module {
    public func definition() -> ModuleDefinition {
        Name("VlcPlayer3")
        View(VlcPlayer3View.self) {
            Prop("source") { (view: VlcPlayer3View, source: [String: Any]) in
                view.setSource(source)
            }

            Prop("paused") { (view: VlcPlayer3View, paused: Bool) in
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

            AsyncFunction("startPictureInPicture") { (view: VlcPlayer3View) in
                view.startPictureInPicture()
            }

            AsyncFunction("play") { (view: VlcPlayer3View) in
                view.play()
            }

            AsyncFunction("pause") { (view: VlcPlayer3View) in
                view.pause()
            }

            AsyncFunction("stop") { (view: VlcPlayer3View) in
                view.stop()
            }

            AsyncFunction("seekTo") { (view: VlcPlayer3View, time: Int32) in
                view.seekTo(time)
            }

            AsyncFunction("setAudioTrack") { (view: VlcPlayer3View, trackIndex: Int) in
                view.setAudioTrack(trackIndex)
            }

            AsyncFunction("getAudioTracks") { (view: VlcPlayer3View) -> [[String: Any]]? in
                return view.getAudioTracks()
            }

            AsyncFunction("setSubtitleTrack") { (view: VlcPlayer3View, trackIndex: Int) in
                view.setSubtitleTrack(trackIndex)
            }

            AsyncFunction("getSubtitleTracks") { (view: VlcPlayer3View) -> [[String: Any]]? in
                return view.getSubtitleTracks()
            }

            AsyncFunction("setSubtitleURL") {
                (view: VlcPlayer3View, url: String, name: String) in
                view.setSubtitleURL(url, name: name)
            }

            AsyncFunction("setSubtitleURL") {
                (view: VlcPlayer3View, url: String, name: String) in
                view.setSubtitleURL(url, name: name)
            }
            AsyncFunction("setRate") { (view: VlcPlayer3View, rate: Float) in
                view.setRate(rate)
            }
        }
    }
}
