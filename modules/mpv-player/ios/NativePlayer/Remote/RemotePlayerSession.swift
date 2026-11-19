#if os(iOS)
import Combine
import ExpoModulesCore
import UIKit

/// What the remote screen holds beside the shared view model: its colors, from the artwork's tint, the TV's
/// name, and what the TV does. Twin: RemoteScreenState in RemotePlayerSession.kt.
final class RemoteScreenState: ObservableObject {
	@Published var colors = RemoteColors.of(top: nil, bottom: nil, accent: nil)
	/// What the TV does, as the holder last published it.
	@Published var snapshot = RemotePlaybackSnapshot.none
	/// The TV held this screen's item at some point (RemoteScreenModel.sawPlayback).
	@Published var sawPlayback = false
	@Published var targetName: String?
	/// What JS said of a send that failed; the engine's own error shows when there is none.
	@Published var failure: RemoteFailure?
	/// The screen's Play here button; the session sets it.
	var playHere: () -> Void = {}
	/// Continue on the next episode's card; the session sets it.
	var continueNextUp: () -> Void = {}

	private let viewModel: PlayerViewModel

	init(viewModel: PlayerViewModel) {
		self.viewModel = viewModel
	}

	/// What the screen shows of the TV, from the snapshot, the next episode and the engine's error; a view that
	/// observes this state and the view model follows all three. The reduced player (media our server does not
	/// know) comes with the foreign media.
	var model: RemoteScreenModel {
		RemoteScreenModel.of(
			snapshot, targetName: targetName, hasNext: viewModel.nextEpisode != nil, reduced: false,
			failure: failure?.message ?? viewModel.errorMessage, canPlayHere: failure?.canPlayHere == true,
			sawPlayback: sawPlayback
		)
	}
}

/// A failed send as the remote screen says it.
struct RemoteFailure: Equatable {
	let message: String
	let canPlayHere: Bool
}

/// The native chrome over a remote engine, with no surface: a remote control for what the TV plays. It
/// leaves the phone alone (status bar shown, the phone sleeps and turns as usual), and holds no Now Playing
/// entry, no volume or brightness control and no picture in picture. It borrows the engine of the holder,
/// which stays its delegate and relays its calls; closing it hands the engine back and sends nothing to the
/// TV. The state the holder publishes decides what the screen shows and when it closes (RemoteScreenModel).
/// Every event it emits is marked remote.
final class RemotePlayerSession: PresentedPlayer {
	let viewModel: PlayerViewModel
	let screen: RemoteScreenState
	let acceptsJsTransport = false

	private let playback: RemotePlayback
	private let emit: (String, [String: Any]) -> Void
	private let onTornDown: () -> Void
	private let presenterProvider: () -> UIViewController?
	private var viewController: RemotePlayerViewController?
	private var closed = false
	private var unfollowPlayback: (() -> Void)?

	init(
		playback: RemotePlayback = .shared,
		emit: @escaping (String, [String: Any]) -> Void,
		onTornDown: @escaping () -> Void,
		presenterProvider: @escaping () -> UIViewController? = { nil }
	) {
		let viewModel = PlayerViewModel()
		self.viewModel = viewModel
		screen = RemoteScreenState(viewModel: viewModel)
		self.playback = playback
		self.emit = emit
		self.onTornDown = onTornDown
		self.presenterProvider = presenterProvider

		viewModel.emit = { name, body in emit(name, markRemote(body)) }
		viewModel.onDismissRequested = { [weak self] reason in
			self?.dismiss(reason: reason)
		}
		screen.playHere = { [weak self] in self?.playHere() }
		screen.continueNextUp = { [weak self] in self?.continueNextUp() }
	}

	/// `onPresented` runs once the screen is up; the module resolves its promise there, the debug probe logs.
	func present(config: RemotePlayerConfigRecord, onPresented: @escaping () -> Void) throws {
		guard let engine = playback.engine else { throw NoRemoteEngineException() }
		// Opened from the app's Cast sheet: the sheet goes first, as for the local player, so the screen is
		// presented from what lies under it and never goes down with it.
		#if !targetEnvironment(macCatalyst)
		OutputPickerPresenter.shared.dismissForPlayer()
		#endif
		guard let presenter = resolvePlayerPresenter(from: presenterProvider()) else {
			throw NoPresenterException()
		}
		viewModel.engine = engine
		viewModel.apply(config: config.toPresentConfig())
		// The TV button says the session's state to VoiceOver; willTeardown stops following it.
		viewModel.followCast()
		if let tint = config.tint { updateTint(tint) }
		screen.targetName = config.targetName

		// After apply(), which starts the view model at the config's position: the screen opens on the TV's. The
		// holder started the engine with the session and stays its delegate.
		_ = playback.attachScreen(viewModel)
		screen.sawPlayback = false
		screen.snapshot = playback.snapshot

		let vc = RemotePlayerViewController(viewModel: viewModel, screen: screen)
		vc.modalPresentationStyle = .fullScreen
		viewController = vc

		// Followed once the screen is up: a close decided during the presentation would dismiss what is not
		// presented yet. The first follow catches up with what the holder published meanwhile.
		presenter.present(vc, animated: true) { [weak self] in
			onPresented()
			guard let self, !self.closed else { return }
			self.unfollowPlayback = self.playback.addListener { [weak self] in self?.follow($0) }
			self.follow(self.playback.snapshot)
		}
	}

	// The holder publishes on the main thread. The film over with nothing after it, or the connection over: the
	// screen closes, an end of playback reported first as the local player does.
	private func follow(_ snapshot: RemotePlaybackSnapshot) {
		guard !closed else { return }
		// A failure goes once the TV loads or plays again.
		let clears = RemoteScreenModel.failureClears(from: screen.snapshot.phase, to: snapshot.phase)
		screen.sawPlayback = RemoteScreenModel.sawPlayback(before: screen.sawPlayback, phase: snapshot.phase)
		screen.snapshot = snapshot
		if clears { clearFailure() }
		guard let close = screen.model.closes else { return }
		switch close {
		case .playbackEnded:
			emit("onPlaybackEnded", markRemote(["positionSec": viewModel.position]))
			dismiss(reason: .playbackEnded)
		case .remoteEnded:
			dismiss(reason: .remoteEnded)
		}
	}

	/// The artwork's colors, once JS has them; the screen fades to them (remoteTintFadeMs).
	func updateTint(_ tint: RemoteTintRecord) {
		screen.colors = RemoteColors.of(top: tint.top, bottom: tint.bottom, accent: tint.accent)
	}

	/// A new config for the open screen, in place: another item sent, the TV's name, the tracks, the tint. The
	/// whole config is replaced and the failure goes; the screen stays on where the TV is. False when none is open.
	func update(config: RemotePlayerConfigRecord) -> Bool {
		guard viewController != nil, !closed else { return false }
		viewModel.apply(config: config.toPresentConfig())
		screen.targetName = config.targetName
		screen.colors = RemoteColors.of(top: config.tint?.top, bottom: config.tint?.bottom, accent: config.tint?.accent)
		// Another item: an end the TV reports before it holds it is the item before's. The item the TV plays
		// already (JS followed it through its list) ends this screen.
		screen.sawPlayback = RemoteScreenModel.sawPlaybackOnUpdate(
			itemId: config.metadata?.itemId, snapshot: screen.snapshot
		)
		clearFailure()
		// apply() starts the view model at the config's position: the TV's state again, as present() does.
		_ = playback.attachScreen(viewModel)
		return true
	}

	/// What JS says of a send that failed, shown with Play here when it offers it; nil takes it away.
	func showFailure(_ failure: RemotePlayerFailureRecord?) {
		guard let failure else {
			clearFailure()
			return
		}
		screen.failure = RemoteFailure(message: failure.message, canPlayHere: failure.canPlayHere)
	}

	// Play here: JS plays on the phone from the TV's position, and closes this screen first.
	private func playHere() {
		guard !closed else { return }
		emit("onPlayHereRequested", markRemote(["positionSec": viewModel.position]))
	}

	// Continue on the next episode's card: JS sends what comes after the list the TV got.
	private func continueNextUp() {
		guard !closed else { return }
		emit("onNextEpisodeRequested", markRemote(["reason": "nextUp", "positionSec": viewModel.position]))
	}

	// Both failures go: the one JS said, and the engine's own error.
	private func clearFailure() {
		screen.failure = nil
		viewModel.errorMessage = nil
	}

	/// Emits onDismiss, slides the screen away, then hands the engine back to the holder: never stop() nor
	/// shutdown(), which the holder decides. The module forgets the session only once the screen is gone, as it
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
		unfollowPlayback?()
		unfollowPlayback = nil
		playback.detachScreen(viewModel)
		viewModel.engine = nil
		viewController = nil
		onTornDown()
	}
}
#endif
