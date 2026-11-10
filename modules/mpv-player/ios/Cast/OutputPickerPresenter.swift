#if os(iOS) && !targetEnvironment(macCatalyst)
import SwiftUI
import UIKit

/// Presents the output sheet from the topmost view controller, as a popover from the button. In a compact
/// width UIKit adapts it to a sheet with medium and large detents, and switches between the two as the
/// window changes (an iPad in Split View, a foldable opened or closed). One sheet at a time; its controller
/// lives here for as long as the sheet does. Main thread only.
final class OutputPickerPresenter: NSObject, UIPopoverPresentationControllerDelegate {
  static let shared = OutputPickerPresenter()

  /// The texts JS sent last; English when the sheet opens from native.
  var strings = OutputPickerStrings()
  /// What the receiver plays, from the media status the module follows.
  var receiverTitle: () -> String? = { nil }
  /// Whether something plays on the receiver, with a title or without.
  var receiverPlaying: () -> Bool = { false }
  /// Whether what the receiver plays can go on on this device, which "Continue here" offers.
  var receiverGoesOnHere: () -> Bool = { false }
  /// Called once the sheet is gone, whichever way it went.
  var onDismissed: (() -> Void)?

  private var hosting: UIViewController?
  private var controller: OutputSheetController?
  private var store: OutputSheetStore?
  private var onRemote: (() -> Void)?
  private var onHandOff: (() -> Void)?
  private var onPlayHere: (() -> Void)?
  private var anchored = false
  private var removeTargetWatch: (() -> Void)?
  // A hand-off whose sheet closed before its receiver connected: it goes once the receiver is connected.
  private var handOffWatch: HandOffWatch?
  private let airPlayRoute = AirPlayRouteObserver()

  var isPresented: Bool { hosting != nil }

  /// True once presented, or already there; false with no view controller to present from.
  /// `anchorView` is the button's own view, which the popover follows when the window turns or resizes;
  /// `anchor`, its frame in window points as JS measures it, is the fallback without it. `handOff` is the player's:
  /// a receiver connected from the sheet, or its panel's "Play on", closes the sheet and then calls `onHandOff`.
  /// Elsewhere, this device chosen while the receiver plays closes the sheet and then calls `onPlayHere`.
  @discardableResult
  func present(
    anchor: CGRect?, anchorView: UIView? = nil, playingHere: String?, handOff: Bool = false,
    onHandOff: (() -> Void)? = nil, onPlayHere: (() -> Void)? = nil, onRemote: @escaping () -> Void
  ) -> Bool {
    // A new sheet takes over a hand-off the last one left waiting.
    stopHandOffWatch()
    // Taken down with the screen that presented it, the sheet heard no dismissal: it is gone all the same.
    if let hosting, hosting.presentingViewController == nil, !hosting.isBeingPresented { finish() }
    if let controller {
      self.onRemote = onRemote
      self.onHandOff = onHandOff
      self.onPlayHere = onPlayHere
      controller.environment.handOff = handOff
      controller.environment.playingHere = playingHere
      controller.environment.receiverTitle = receiverTitle()
      controller.environment.receiverPlaying = receiverPlaying()
      controller.environment.receiverGoesOnHere = goesOnHere()
      return true
    }
    // A sheet that cannot show keeps no callback, which would hold the module.
    guard let top = Self.topViewController() else { return false }
    self.onRemote = onRemote
    self.onHandOff = onHandOff
    self.onPlayHere = onPlayHere
    let sheet = OutputSheetController(hub: .shared, schedule: mainQueueSchedule)
    sheet.environment = OutputSheetEnvironment(
      playServices: .available,
      airPlay: AirPlayInput(activeRoute: airPlayRoute.activeRoute),
      thisDevice: UIDevice.current.userInterfaceIdiom == .pad ? .tablet : .phone,
      playingHere: playingHere,
      receiverTitle: receiverTitle(),
      receiverPlaying: receiverPlaying(),
      receiverGoesOnHere: goesOnHere(),
      handOff: handOff
    )
    sheet.onOutput = { [weak self] output in self?.handle(output) }
    let store = OutputSheetStore(controller: sheet)
    let hosting = UIHostingController(rootView: OutputSheetView(store: store, strings: strings, controller: sheet))
    // The popover follows the sheet's own size, list or panel.
    hosting.sizingOptions = .preferredContentSize
    hosting.modalPresentationStyle = .popover
    if let popover = hosting.popoverPresentationController {
      popover.delegate = self
      popover.sourceView = top.view
      anchored = anchor != nil && top.view.window != nil
      if let anchorView, anchorView.window != nil {
        // UIKit keeps the popover on its source view through a rotation, which a rectangle in another view is not.
        popover.sourceView = anchorView
        popover.sourceRect = anchorView.bounds
        anchored = true
      } else if let anchor, let window = top.view.window {
        popover.sourceRect = top.view.convert(anchor, from: window)
      } else {
        popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
        popover.permittedArrowDirections = []
      }
      let compact = popover.adaptiveSheetPresentationController
      compact.detents = [.medium(), .large()]
      compact.prefersGrabberVisible = true
    }
    airPlayRoute.onChange = { [weak sheet] route in sheet?.environment.airPlay = AirPlayInput(activeRoute: route) }
    airPlayRoute.start()
    self.hosting = hosting
    self.controller = sheet
    self.store = store
    removeTargetWatch = RemoteTargetHub.shared.addListener(self)
    sheet.open()
    top.present(hosting, animated: true)
    return true
  }

  func dismiss() {
    dismiss(then: nil)
  }

  /// The receiver started or changed what it plays: the panel's remote row follows.
  func refresh() {
    controller?.environment.receiverTitle = receiverTitle()
    controller?.environment.receiverPlaying = receiverPlaying()
    controller?.environment.receiverGoesOnHere = goesOnHere()
  }

  // Continue here needs someone to take the video over: a sheet opened without onPlayHere (the probe, a SyncPlay
  // member) offers none, and this device only stops the receiver.
  private func goesOnHere() -> Bool {
    onPlayHere != nil && receiverGoesOnHere()
  }

  /// The debug probe's sheet, for its screenshots: over whatever the app shows, and never in place of the app's.
  func presentForProbe() -> Bool {
    guard !isPresented else { return true }
    return present(anchor: nil, playingHere: nil) {}
  }

  // A swipe down or a tap outside closed it.
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish()
  }

  // A rotation or a window resize: with no button to point at, the popover stays centred.
  func popoverPresentationController(
    _ popoverPresentationController: UIPopoverPresentationController, willRepositionPopoverTo rect: UnsafeMutablePointer<CGRect>,
    in view: AutoreleasingUnsafeMutablePointer<UIView>
  ) {
    guard !anchored else { return }
    rect.pointee = CGRect(x: view.pointee.bounds.midX, y: view.pointee.bounds.midY, width: 0, height: 0)
  }

  private func dismiss(then next: (() -> Void)?) {
    guard let hosting else {
      next?()
      return
    }
    finish()
    hosting.dismiss(animated: true, completion: next)
  }

  /// A player opens over the app's sheet (a remote Play): the sheet goes first, without animation, so the player is
  /// presented from the screen under it and its own Cast button opens a sheet of its own.
  func dismissForPlayer() {
    guard let hosting else { return }
    finish(keepHandOff: false)
    hosting.dismiss(animated: false)
  }

  /// The player that opened the sheet closes and takes its sheet down with it, which UIKit does not report: the sheet
  /// lets go of discovery and its callbacks, and of a hand-off still waiting for a receiver.
  func releasePlayerSheet() {
    stopHandOffWatch()
    guard controller?.environment.handOff == true else { return }
    finish(keepHandOff: false)
  }

  private func finish(keepHandOff: Bool = true) {
    guard hosting != nil else { return }
    // The player's sheet closed while the receiver it asked for connects: the video still goes once it is.
    let awaited = keepHandOff && controller?.environment.handOff == true ? controller?.awaitedReceiver : nil
    let handOff = onHandOff
    hosting = nil
    removeTargetWatch?()
    removeTargetWatch = nil
    controller?.close()
    controller = nil
    store = nil
    onRemote = nil
    onHandOff = nil
    onPlayHere = nil
    airPlayRoute.stop()
    onDismissed?()
    if let awaited, let handOff { followHandOff(awaited, handOff) }
  }

  private func followHandOff(_ deviceId: String, _ handOff: @escaping () -> Void) {
    stopHandOffWatch()
    let watch = HandOffWatch(deviceId: deviceId) { [weak self] connected in
      self?.stopHandOffWatch()
      if connected { handOff() }
    }
    watch.remove = RemoteTargetHub.shared.addListener(watch)
    handOffWatch = watch
  }

  private func stopHandOffWatch() {
    handOffWatch?.remove?()
    handOffWatch = nil
  }

  private func handle(_ output: OutputSheetOutput) {
    switch output {
    case .remote:
      // The remote is a presentation of its own: it waits for the sheet to be gone.
      let remote = onRemote
      dismiss(then: remote)
    // The same way: the player hands its video off once the sheet is gone.
    case .handOff:
      dismiss(then: onHandOff)
    // And this device takes the receiver's video once the sheet is gone.
    case .playHere:
      dismiss(then: onPlayHere)
    case .dismiss:
      dismiss()
    case .openAirPlay, .resolvePlayServices:
      // AirPlay's own button takes its tap, and Play Services are Android's.
      break
    }
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes.filter { $0.activationState == .foregroundActive }.flatMap(\.windows)
    let window = windows.first(where: \.isKeyWindow) ?? windows.first
    var top = window?.rootViewController
    while let presented = top?.presentedViewController, !presented.isBeingDismissed {
      top = presented
    }
    return top
  }
}

// A session that ends or starts changes what the receiver plays before any media status says so.
/// Waits for the receiver a closed sheet asked for: connected, it settles with true; gone or refused, with false.
private final class HandOffWatch: RemoteTargetListener {
  let deviceId: String
  let settle: (Bool) -> Void
  var remove: (() -> Void)?

  init(deviceId: String, settle: @escaping (Bool) -> Void) {
    self.deviceId = deviceId
    self.settle = settle
  }

  func remoteTargetDidChange(_ snapshot: RemoteTargetSnapshot) {
    if snapshot.phase == .connected, snapshot.target?.id == deviceId {
      settle(true)
    } else if snapshot.phase == .none || snapshot.failedTarget?.id == deviceId {
      settle(false)
    }
  }

  func remoteTargetDevicesDidChange(_ devices: [TargetDevice]) {}
}

extension OutputPickerPresenter: RemoteTargetListener {
  func remoteTargetDidChange(_ snapshot: RemoteTargetSnapshot) {
    refresh()
  }

  func remoteTargetDevicesDidChange(_ devices: [TargetDevice]) {}
}
#endif
