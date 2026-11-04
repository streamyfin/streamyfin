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
  /// Called once the sheet is gone, whichever way it went.
  var onDismissed: (() -> Void)?

  private var hosting: UIViewController?
  private var controller: OutputSheetController?
  private var store: OutputSheetStore?
  private var onRemote: (() -> Void)?
  private var anchored = false
  private let airPlayRoute = AirPlayRouteObserver()

  var isPresented: Bool { hosting != nil }

  /// True once presented, or already there; false with no view controller to present from.
  /// `anchorView` is the button's own view, which the popover follows when the window turns or resizes;
  /// `anchor`, its frame in window points as JS measures it, is the fallback without it.
  @discardableResult
  func present(anchor: CGRect?, anchorView: UIView? = nil, playingHere: String?, onRemote: @escaping () -> Void) -> Bool {
    if let controller {
      self.onRemote = onRemote
      controller.environment.playingHere = playingHere
      controller.environment.receiverTitle = receiverTitle()
      controller.environment.receiverPlaying = receiverPlaying()
      return true
    }
    // A sheet that cannot show keeps no callback, which would hold the module.
    guard let top = Self.topViewController() else { return false }
    self.onRemote = onRemote
    let sheet = OutputSheetController(hub: .shared, schedule: mainQueueSchedule)
    sheet.environment = OutputSheetEnvironment(
      playServices: .available,
      airPlay: AirPlayInput(activeRoute: airPlayRoute.activeRoute),
      thisDevice: UIDevice.current.userInterfaceIdiom == .pad ? .tablet : .phone,
      playingHere: playingHere,
      receiverTitle: receiverTitle(),
      receiverPlaying: receiverPlaying()
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

  private func finish() {
    guard hosting != nil else { return }
    hosting = nil
    controller?.close()
    controller = nil
    store = nil
    onRemote = nil
    airPlayRoute.stop()
    onDismissed?()
  }

  private func handle(_ output: OutputSheetOutput) {
    switch output {
    case .remote:
      // The remote is a presentation of its own: it waits for the sheet to be gone.
      let remote = onRemote
      dismiss(then: remote)
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
#endif
