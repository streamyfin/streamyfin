import Foundation

#if os(iOS) && !targetEnvironment(macCatalyst)
extension RemotePlayback {
  // The hub holds its listeners weakly: the relay lives here, for the whole process.
  private static var hubRelay: HubRelay?

  /// Once per process, from RemoteTargets.installDefault: the SDK's engine, or the fake one for the fake
  /// receivers, and the hub's session. The holder makes no engine until JS gives it a server.
  static func installDefault(hub: RemoteTargetHub) {
    guard hubRelay == nil else { return }
    let playback = RemotePlayback.shared
    playback.useFactory(
      factory(
        fake: RemoteTargets.fakeDevices, real: { CastEngine.make(server: $0) },
        fakeEngine: { FakeRemoteEngine(deliver: mainQueueSchedule) }
      )
    )
    let relay = HubRelay(playback: playback)
    hubRelay = relay
    _ = hub.addListener(relay)
    relay.remoteTargetDidChange(hub.snapshot)
  }
}

private final class HubRelay: RemoteTargetListener {
  private let playback: RemotePlayback

  init(playback: RemotePlayback) { self.playback = playback }

  func remoteTargetDidChange(_ snapshot: RemoteTargetSnapshot) {
    let session = RemotePlayback.session(of: snapshot)
    playback.targetChanged(connected: session.connected, suspended: session.suspended)
  }

  func remoteTargetDevicesDidChange(_ devices: [TargetDevice]) {}
}
#endif
