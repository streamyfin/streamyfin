import Foundation

/// The fake receivers' pace (FakeCastDevices), the SDK port's bounded waits, and the output sheet's timings and sizes.
enum RemoteTargetConstants {
  /// How long after its suspension the SDK is left to end, or resume, a session it lost. It ended one itself 26 to
  /// 28 s after a Chromecast was unplugged, and 15 to 30 s after a Google TV Streamer rebooted; asked to end it before
  /// then, it kept it suspended for good (bench, 15/11 and 16/11).
  static let suspendedOwnEndMs = 45_000.0
  /// How long an end the port asked for, a switch's or a lost session's, may take before the start waiting on it fails.
  static let sessionEndWaitMs = 10_000.0
  /// How long a start that waited on an end waits for its receiver to show in the device list again: after the
  /// SDK ended a lost session, the list could miss the receiver for a few seconds (iPhone, back to the front, 15/11).
  static let receiverBackWaitMs = 20_000.0

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
