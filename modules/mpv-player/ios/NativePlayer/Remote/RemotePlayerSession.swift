#if os(iOS)
import ExpoModulesCore
import UIKit

/// The native chrome over a remote engine, with no surface: a remote control for what the TV plays. It
/// leaves the phone alone (status bar shown, the phone sleeps and turns as usual), and holds no Now Playing
/// entry, no volume or brightness control and no picture in picture. Closing it hands the engine back
/// through its lease and sends nothing to the TV. Every event it emits is marked remote.
final class RemotePlayerSession: PresentedPlayer {
	let viewModel = PlayerViewModel()
	let acceptsJsTransport = false

	private let lease: RemoteEngineLease
	private let emit: (String, [String: Any]) -> Void
	private let onTornDown: () -> Void
	private let presenterProvider: () -> UIViewController?
	private var viewController: RemotePlayerViewController?
	private var closed = false

	init(
		lease: RemoteEngineLease,
		emit: @escaping (String, [String: Any]) -> Void,
		onTornDown: @escaping () -> Void,
		presenterProvider: @escaping () -> UIViewController? = { nil }
	) {
		self.lease = lease
		self.emit = emit
		self.onTornDown = onTornDown
		self.presenterProvider = presenterProvider

		viewModel.emit = { name, body in emit(name, markRemote(body)) }
		viewModel.onDismissRequested = { [weak self] reason in
			self?.dismiss(reason: reason)
		}
	}

	func present(config: RemotePlayerConfigRecord, promise: Promise) throws {
		guard let presenter = resolvePlayerPresenter(from: presenterProvider()) else {
			throw NoPresenterException()
		}
		let engine = lease.engine
		engine.delegate = viewModel
		viewModel.engine = engine
		viewModel.apply(config: config.toPresentConfig())

		let vc = RemotePlayerViewController(viewModel: viewModel, targetName: config.targetName)
		vc.modalPresentationStyle = .fullScreen
		viewController = vc

		// Starting a bound engine again does nothing: the TV keeps playing what it plays.
		try engine.start()
		presenter.present(vc, animated: true) {
			promise.resolve()
		}
	}

	/// Emits onDismiss, slides the screen away, then hands the engine back: never stop() nor shutdown(),
	/// which the lease's owner decides. The module forgets the session only once the screen is gone, as it
	/// does the local player's (learned fact native-player-presented-after-dismiss).
	func dismiss(reason: PlayerDismissReason, completion: (() -> Void)? = nil) {
		guard !closed else {
			completion?()
			return
		}
		closed = true
		viewModel.willTeardown()
		emit("onDismiss", markRemote([
			"positionSec": viewModel.position,
			"durationSec": viewModel.duration,
			"reason": reason.rawValue,
		]))

		if let vc = viewController, let presenter = vc.presentingViewController {
			presenter.dismiss(animated: true) { [weak self] in
				self?.detach()
				completion?()
			}
		} else {
			detach()
			completion?()
		}
	}

	func teardownImmediately() {
		guard !closed else { return }
		closed = true
		viewModel.willTeardown()
		viewController?.presentingViewController?.dismiss(animated: false)
		detach()
	}

	private func detach() {
		if lease.engine.delegate === viewModel { lease.engine.delegate = nil }
		viewModel.engine = nil
		viewController = nil
		lease.release()
		onTornDown()
	}
}
#endif
