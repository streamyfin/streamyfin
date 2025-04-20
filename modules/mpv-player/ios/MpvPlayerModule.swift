import ExpoModulesCore

public class MpvPlayerModule: Module {
    public func definition() -> ModuleDefinition {
        Name("MpvPlayer")
        View(MpvPlayerView.self) {
            Prop("source") { (view: MpvPlayerView, source: [String: Any]) in
                view.setSource(source)
            }

            Prop("paused") { (view: MpvPlayerView, paused: Bool) in
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

            AsyncFunction("startPictureInPicture") { (view: MpvPlayerView) in
                view.startPictureInPicture()
            }

            AsyncFunction("play") { (view: MpvPlayerView) in
                view.play()
            }

            AsyncFunction("pause") { (view: MpvPlayerView) in
                view.pause()
            }

            AsyncFunction("stop") { (view: MpvPlayerView) in
                view.stop()
            }

            AsyncFunction("seekTo") { (view: MpvPlayerView, time: Int32) in
                view.seekTo(time)
            }

            AsyncFunction("setAudioTrack") { (view: MpvPlayerView, trackIndex: Int) in
                view.setAudioTrack(trackIndex)
            }

            AsyncFunction("getAudioTracks") { (view: MpvPlayerView) -> [[String: Any]]? in
                return view.getAudioTracks()
            }

            AsyncFunction("setSubtitleTrack") { (view: MpvPlayerView, trackIndex: Int) in
                view.setSubtitleTrack(trackIndex)
            }

            AsyncFunction("getSubtitleTracks") { (view: MpvPlayerView) -> [[String: Any]]? in
                return view.getSubtitleTracks()
            }

            AsyncFunction("setSubtitleURL") {
                (view: MpvPlayerView, url: String, name: String) in
                view.setSubtitleURL(url, name: name)
            }
        }
    }
}
