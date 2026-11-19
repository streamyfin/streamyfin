import ExpoModulesCore
import UIKit

/// The player the module presents, local or remote: what the calls common to both reach (dismiss, the
/// update* family, notices). The local player's own calls (load, mpv tracks, SyncPlay, technical info,
/// Now Playing) go to `NativePlayerSession` only.
protocol PresentedPlayer: AnyObject {
	var viewModel: PlayerViewModel { get }

	/// Whether JS's transport calls (play, pause, seekTo, setSpeed, toggleMute) reach it: the local player
	/// only. A server command addressed to the phone must never drive the TV.
	var acceptsJsTransport: Bool { get }

	func dismiss(reason: PlayerDismissReason, completion: (() -> Void)?)

	/// Gone at once, nothing emitted: the app reloads under it.
	func teardownImmediately()
}

/// The view model JS's transport calls drive, nil when no player takes them.
func jsTransportTarget(_ presented: PresentedPlayer?) -> PlayerViewModel? {
	guard let presented, presented.acceptsJsTransport else { return nil }
	return presented.viewModel
}

/// The view controller a player presents from: the module's, unless it already presents something, else
/// the top of the key window's presented chain.
func resolvePlayerPresenter(from fromContext: UIViewController?) -> UIViewController? {
	if let fromContext, fromContext.presentedViewController == nil {
		return fromContext
	}
	var top = SceneGeometry.keyWindow()?.rootViewController
	while let presented = top?.presentedViewController, !presented.isBeingDismissed {
		top = presented
	}
	return top
}
