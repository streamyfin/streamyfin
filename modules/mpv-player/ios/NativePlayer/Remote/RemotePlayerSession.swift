#if os(iOS)
import Combine
import ExpoModulesCore
import UIKit

/// What the remote screen holds beside the shared view model: its colors, from the artwork's tint. Twin:
/// RemoteScreenModel in RemotePlayerSession.kt.
final class RemoteScreenModel: ObservableObject {
	@Published var colors = RemoteColors.of(top: nil, bottom: nil, accent: nil)
}

/// The native chrome over a remote engine, with no surface: a remote control for what the TV plays. It
/// leaves the phone alone (status bar shown, the phone sleeps and turns as usual), and holds no Now Playing
/// entry, no volume or brightness control and no picture in picture. Closing it hands the engine back
/// through its lease and sends nothing to the TV. Every event it emits is marked remote.
final class RemotePlayerSession: PresentedPlayer {
	let viewModel = PlayerViewModel()
	let screen = RemoteScreenModel()
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

	/// `onPresented` runs once the screen is up; the module resolves its promise there, the debug probe logs.
	func present(config: RemotePlayerConfigRecord, onPresented: @escaping () -> Void) throws {
		// Opened from the app's Cast sheet: the sheet goes first, as for the local player, so the screen is
		// presented from what lies under it and never goes down with it.
		#if !targetEnvironment(macCatalyst)
		OutputPickerPresenter.shared.dismissForPlayer()
		#endif
		guard let presenter = resolvePlayerPresenter(from: presenterProvider()) else {
			throw NoPresenterException()
		}
		let engine = lease.engine
		engine.delegate = viewModel
		viewModel.engine = engine
		viewModel.apply(config: config.toPresentConfig())
		if let tint = config.tint { updateTint(tint) }

		let vc = RemotePlayerViewController(viewModel: viewModel, screen: screen, targetName: config.targetName)
		vc.modalPresentationStyle = .fullScreen
		viewController = vc

		// Starting a bound engine again does nothing: the TV keeps playing what it plays.
		try engine.start()
		presenter.present(vc, animated: true, completion: onPresented)
	}

	/// The artwork's colors, once JS has them; the screen fades to them (remoteTintFadeMs).
	func updateTint(_ tint: RemoteTintRecord) {
		screen.colors = RemoteColors.of(top: tint.top, bottom: tint.bottom, accent: tint.accent)
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
