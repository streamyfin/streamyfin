import ExpoModulesCore

public class VlcPlayerModule: Module {
    public func definition() -> ModuleDefinition {
        Name("VlcPlayer")
        View(VlcPlayerView.self) {
            Prop("source") { (view: VlcPlayerView, source: [String: Any]) in
                view.setSource(source)
            }

            Prop("paused") { (view: VlcPlayerView, paused: Bool) in
                if paused {
                    view.pause()
                } else {
                    view.play()
                }
            }

            Prop("muted") { (view: VlcPlayerView, muted: Bool) in
                view.setMuted(muted)
            }

            Prop("volume") { (view: VlcPlayerView, volume: Int) in
                view.setVolume(volume)
            }

            Prop("videoAspectRatio") { (view: VlcPlayerView, ratio: String) in
                view.setVideoAspectRatio(ratio)
            }

            Events(
                "onPlaybackStateChanged",
                "onVideoStateChange",
                "onVideoLoadStart",
                "onVideoLoadEnd",
                "onVideoProgress",
                "onVideoError"
            )

            AsyncFunction("play") { (view: VlcPlayerView) in
                view.play()
            }

            AsyncFunction("pause") { (view: VlcPlayerView) in
                view.pause()
            }

            AsyncFunction("stop") { (view: VlcPlayerView) in
                view.stop()
            }

            AsyncFunction("seekTo") { (view: VlcPlayerView, time: Int32) in
                view.seekTo(time)
            }

            AsyncFunction("setAudioTrack") { (view: VlcPlayerView, trackIndex: Int) in
                view.setAudioTrack(trackIndex)
            }

            AsyncFunction("getAudioTracks") { (view: VlcPlayerView) -> [[String: Any]]? in
                return view.getAudioTracks()
            }

            AsyncFunction("setSubtitleTrack") { (view: VlcPlayerView, trackIndex: Int) in
                view.setSubtitleTrack(trackIndex)
            }

            AsyncFunction("getSubtitleTracks") { (view: VlcPlayerView) -> [[String: Any]]? in
                return view.getSubtitleTracks()
            }

            AsyncFunction("setVideoCropGeometry") { (view: VlcPlayerView, geometry: String?) in
                view.setVideoCropGeometry(geometry)
            }

            AsyncFunction("getVideoCropGeometry") { (view: VlcPlayerView) -> String? in
                return view.getVideoCropGeometry()
            }

            AsyncFunction("setSubtitleURL") {
                (view: VlcPlayerView, url: String, name: String) in
                view.setSubtitleURL(url, name: name)
            }
        }
    }
}
