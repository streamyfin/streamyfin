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

        print("PASS: Cast state, player state, session end error and receiver id mapping")
    }
}
