import ExpoModulesCore

public class VlcPlayerModule: Module {
    public func definition() -> ModuleDefinition {
        Name("VlcPlayer")
        View(VlcPlayerView.self) {
            Prop("source") { (view: VlcPlayerView, source: [String: Any]) in
                view.setSource(source)
            }

            Prop("progressUpdateInterval") { (view: VlcPlayerView, interval: Double) in
                view.setProgressUpdateInterval(interval)
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
                "onProgress",
                "onPlaybackStateChanged",
                "onVideoLoadStart",
                "onVideoStateChange",
                "onVideoProgress"
            )

            AsyncFunction("play") { (view: VlcPlayerView) in
                view.play()
            }

            AsyncFunction("pause") { (view: VlcPlayerView) in
                view.pause()
            }

            AsyncFunction("seekTo") { (view: VlcPlayerView, time: Double) in
                view.seekTo(time)
            }

            AsyncFunction("jumpBackward") { (view: VlcPlayerView, interval: Int) in
                view.jumpBackward(interval)
            }

            AsyncFunction("jumpForward") { (view: VlcPlayerView, interval: Int) in
                view.jumpForward(interval)
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
        }
    }
}
