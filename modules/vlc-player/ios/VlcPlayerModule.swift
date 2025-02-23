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

            Events(
                "onPlaybackStateChanged",
                "onVideoStateChange",
                "onVideoLoadStart",
                "onVideoLoadEnd",
                "onVideoProgress",
                "onVideoError",
                "onPipStarted",
                "onDiscoveryStateChanged"
            )

            AsyncFunction("startPictureInPicture") { (view: VlcPlayerView) in
                view.startPictureInPicture()
            }

            AsyncFunction("play") { (view: VlcPlayerView) in
                view.play()
            }

            AsyncFunction("pause") { (view: VlcPlayerView) in
                view.pause()
            }

            AsyncFunction("stop") { (view: VlcPlayerView) in
                view.stop()
            }

            AsyncFunction("startDiscovery") { (view: VlcPlayerView) in
                view.startDiscovery()
            }

            AsyncFunction("stopDiscovery") { (view: VlcPlayerView) in
                view.stopDiscovery()
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

            AsyncFunction("setSubtitleURL") {
                (view: VlcPlayerView, url: String, name: String) in
                view.setSubtitleURL(url, name: name)
            }
        }
    }
}
