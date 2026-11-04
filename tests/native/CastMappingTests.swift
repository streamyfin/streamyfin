import Foundation

// The JS side keys on these names; a renamed state would silently break every screen.
@main
enum CastMappingTests {
    static func main() throws {
        precondition(CastMapping.castStateName(0) == "noDevicesAvailable")
        precondition(CastMapping.castStateName(1) == "notConnected")
        precondition(CastMapping.castStateName(2) == "connecting")
        precondition(CastMapping.castStateName(3) == "connected")
        precondition(CastMapping.castStateName(9) == nil)

        precondition(CastMapping.playerStateName(0) == "unknown")
        precondition(CastMapping.playerStateName(1) == "idle")
        precondition(CastMapping.playerStateName(2) == "playing")
        precondition(CastMapping.playerStateName(3) == "paused")
        precondition(CastMapping.playerStateName(4) == "buffering")
        precondition(CastMapping.playerStateName(5) == "loading")
        precondition(CastMapping.playerStateName(42) == "unknown")

        // The stop reporter takes a session that ended without an error for a cast the user
        // stopped, which also closed the receiver app; anything else may leave the TV playing.
        precondition(CastMapping.sessionEndError(nil) == nil)
        let error = NSError(domain: "com.google.GCKError", code: 2, userInfo: [NSLocalizedDescriptionKey: "Network error"])
        let described = CastMapping.sessionEndError(error)
        precondition(described?.hasPrefix("com.google.GCKError 2") == true, "\(String(describing: described))")
        precondition(described?.contains("Network error") == true)

        precondition(CastMapping.receiverAppId(fromInfoPlist: [:]) == "F007D354")
        precondition(CastMapping.receiverAppId(fromInfoPlist: ["StreamyfinCastReceiverAppId": "ABCD1234"]) == "ABCD1234")
        precondition(CastMapping.receiverAppId(fromInfoPlist: ["StreamyfinCastReceiverAppId": ""]) == "F007D354")

        // Tapping the playing media in the Cast dialog opens the SDK's expanded controls, as it did
        // with react-native-google-cast; false would only post a notification nothing observes.
        precondition(CastMapping.useDefaultExpandedMediaControls == true)

        // GCKMediaPlayerIdleReason: none 0, finished 1, cancelled 2, interrupted 3, error 4. The engine
        // tells an end from an error by it.
        precondition(CastMapping.idleReasonName(0) == "none")
        precondition(CastMapping.idleReasonName(1) == "finished")
        precondition(CastMapping.idleReasonName(2) == "cancelled")
        precondition(CastMapping.idleReasonName(3) == "interrupted")
        precondition(CastMapping.idleReasonName(4) == "error")
        precondition(CastMapping.idleReasonName(42) == "none")

        // GCKMediaTrackType: unknown 0, text 1, audio 2, video 3. A subtitle change goes over the bus
        // only when the media has text tracks; without any, it reloads.
        precondition(CastMapping.hasTextTracks([2, 1]))
        precondition(!CastMapping.hasTextTracks([2, 3]))
        precondition(!CastMapping.hasTextTracks([]))

        // A stop from the TV leaves the idle media with its metadata: the sheet must not offer to stop it again.
        // GCKMediaPlayerState: unknown 0, idle 1, playing 2, paused 3, buffering 4, loading 5.
        precondition((2...5).allSatisfy { CastMapping.playingTitle($0, title: "Big Buck Bunny") == "Big Buck Bunny" })
        precondition(CastMapping.playingTitle(1, title: "Big Buck Bunny") == nil)
        precondition(CastMapping.playingTitle(0, title: "Big Buck Bunny") == nil)

        print("PASS: Cast state, player state, idle reason, text tracks, session end error, receiver id, expanded controls and playing title")
    }
}
