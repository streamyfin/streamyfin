import Foundation

/// The fake receivers' pace (FakeCastDevices): long enough for a tier 1 flow to see each state.
enum RemoteTargetConstants {
  static let fakeConnectDelayMs = 600.0
  static let fakeEndDelayMs = 300.0
  /// How long a fake receiver takes to report back the volume it was set to, as a real one does.
  static let fakeVolumeEchoMs = 100.0
}
