import Foundation

/// The fake receivers' pace (FakeCastDevices), and the output sheet's timings and sizes.
enum RemoteTargetConstants {
  // Long enough for a tier 1 flow to see each state.
  static let fakeConnectDelayMs = 600.0
  static let fakeEndDelayMs = 300.0
  /// How long a fake receiver takes to report back the volume it was set to, as a real one does.
  static let fakeVolumeEchoMs = 100.0

  /// The sheet says no receiver was found after this long without one.
  static let outputSearchTimeoutMs = 10_000.0
  /// A released slider keeps the level it sent this long at most, waiting for the receiver's echo.
  static let volumeSettleMs = 1_000.0
  /// A slider left still this long counts as released: the system can take a touch back without the slider
  /// hearing its end (a slow drag in the iOS sheet, 04/11).
  static let volumeDragRestMs = 600.0
  /// How close the echo must come to the level sent: one step of the Cast route on Android (1 of 20).
  static let volumeEchoTolerance = 0.05
  /// The popover's width, in points, as on Android.
  static let popoverWidth: CGFloat = 380
}
