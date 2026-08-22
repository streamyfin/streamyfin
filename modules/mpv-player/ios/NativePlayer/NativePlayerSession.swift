import ExpoModulesCore
import UIKit

enum PlayerDismissReason: String {
	case closeButton
	case programmatic
	case playbackEnded
	case error
}

internal final class NoPresenterException: Exception, @unchecked Sendable {
	override var reason: String {
		"Could not find a view controller to present the native player from"
	}
}

/// One presentation lifecycle of the native player: owns the engine, the view
/// controller and the view model, and funnels every dismissal path through a
/// single teardown ordering (see dismiss(reason:completion:)).
final class NativePlayerSession {
	let engine = MPVPlayerEngine()
	let viewModel = PlayerViewModel()

	private var viewController: NativePlayerViewController?
	private let emit: (String, [String: Any]) -> Void
	private let onTornDown: () -> Void
	private let presenterProvider: () -> UIViewController?
	private var isDismissing = false

	init(
		emit: @escaping (String, [String: Any]) -> Void,
		onTornDown: @escaping () -> Void,
		presenterProvider: @escaping () -> UIViewController? = { nil }
	) {
		self.emit = emit
		self.onTornDown = onTornDown
		self.presenterProvider = presenterProvider

		viewModel.engine = engine
		viewModel.emit = emit
		viewModel.onDismissRequested = { [weak self] reason in
			self?.dismiss(reason: reason)
		}
		engine.delegate = viewModel
	}

	// MARK: - Presentation

	func present(config: PlayerPresentConfigRecord, promise: Promise) throws {
		guard let presenter = resolvePresenter() else {
			throw NoPresenterException()
		}

		try engine.start()

		viewModel.apply(config: config)

		let vc = NativePlayerViewController(
			engine: engine,
			viewModel: viewModel,
			lockLandscape: config.ui.orientationLock == "landscape"
		)
		vc.modalPresentationStyle = .fullScreen
		vc.modalTransitionStyle = .crossDissolve
		#if os(iOS)
		vc.modalPresentationCapturesStatusBarAppearance = true
		#endif
		viewController = vc

		// Kick the stream load off immediately so it races the rotation wait
		// and the presentation fade instead of waiting for them.
		startStream(config: config)

		presentAfterRotation(
			vc,
			from: presenter,
			waitingForLandscape: config.ui.orientationLock == "landscape",
			promise: promise
		)
	}

	/// The JS coordinator locks the window to landscape (expo-screen-orientation)
	/// right before calling present, which starts rotating the whole app.
	/// Presenting while that rotation is in flight makes UIKit run a second
	/// rotation pass for the incoming landscape-only VC (a visible double
	/// rotate) and can leave the overlay laid out with portrait safe-area
	/// insets (top bar sitting too low). Wait until the scene reports
	/// landscape, then one extra beat for the rotation animation to finish,
	/// and present into a settled window.
	private func presentAfterRotation(
		_ vc: NativePlayerViewController,
		from presenter: UIViewController,
		waitingForLandscape: Bool,
		promise: Promise
	) {
		#if os(tvOS)
		// No interface orientation on tvOS — present immediately.
		presenter.present(vc, animated: true) {
			promise.resolve()
		}
		#else
		let scene = presenter.view.window?.windowScene
		guard waitingForLandscape, let scene, !scene.interfaceOrientation.isLandscape else {
			presenter.present(vc, animated: true) {
				promise.resolve()
			}
			return
		}

		// ~1.5s at 30Hz before giving up and presenting anyway (the VC's own
		// landscape mask then rotates as part of the presentation, as before).
		var attemptsLeft = 45
		func poll() {
			if scene.interfaceOrientation.isLandscape || attemptsLeft <= 0 {
				// interfaceOrientation flips at the START of the rotation
				// animation — the beat lets the animation land first.
				DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
					// The session can die during the wait (load error, app
					// reload) — presenting then would put a zombie player over
					// a shut-down engine.
					guard let self, !self.isDismissing, self.viewController === vc else {
						promise.resolve()
						return
					}
					presenter.present(vc, animated: true) {
						promise.resolve()
					}
				}
			} else {
				attemptsLeft -= 1
				DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 / 30.0) {
					poll()
				}
			}
		}
		poll()
		#endif
	}

	/// In-place stream swap while presented: track/bitrate re-negotiation and
	/// episode changes. The renderer replaces the current file on the live mpv
	/// handle — no destroy/restart dance is needed on this path.
	func load(config: PlayerPresentConfigRecord) {
		viewModel.prepareForReload()
		viewModel.apply(config: config)
		startStream(config: config, force: true)
	}

	private func startStream(config: PlayerPresentConfigRecord, force: Bool = false) {
		guard let loadConfig = config.stream.toVideoLoadConfig() else { return }
		engine.loadVideo(config: loadConfig, force: force)
		engine.setPictureInPictureAutoStartEnabled(config.ui.allowPip)
		// Unconditional: mpv's speed property persists on the handle across
		// loadfile, so an in-place swap from a 2× stream to a 1× config must
		// explicitly write 1.0 or the old speed carries over.
		engine.setSpeed(speed: config.ui.initialPlaybackSpeed)
		viewModel.speed = config.ui.initialPlaybackSpeed
		// Same persistence rule as speed: sync offsets and gain survive on
		// the mpv handle across loadfile, so write the view model's current
		// values on every swap (apply() resets them when the item changes).
		engine.setSubtitleDelay(viewModel.subtitleDelay)
		engine.setAudioDelay(viewModel.audioDelay)
		engine.setVolumeBoost(viewModel.volumeBoostPercent)
		engine.setDialogueBoost(viewModel.dialogueBoostEnabled)
		engine.setMonoDownmix(viewModel.monoAudioEnabled)
		if let style = config.subtitleStyle {
			applySubtitleStyle(style)
		}
		// Zoom survives in-place swaps (layer gravity), but the subtitle
		// position compensation depends on the NEW video's aspect ratio.
		viewModel.applyZoomState()
		if let metadata = config.metadata {
			applyNowPlayingMetadata(metadata)
		}
	}

	private func applySubtitleStyle(_ style: SubtitleStyleRecord) {
		if let fontSize = style.fontSize { engine.setSubtitleFontSize(fontSize) }
		if let scale = style.scale { engine.setSubtitleScale(scale) }
		if let marginY = style.marginY { engine.setSubtitleMarginY(marginY) }
		if let alignX = style.alignX { engine.setSubtitleAlignX(alignX) }
		if let alignY = style.alignY { engine.setSubtitleAlignY(alignY) }
		if let backgroundColor = style.backgroundColor { engine.setSubtitleBackgroundColor(backgroundColor) }
		if let borderStyle = style.borderStyle { engine.setSubtitleBorderStyle(borderStyle) }
		if let assOverride = style.assOverride { engine.setSubtitleAssOverride(assOverride) }
	}

	func applyNowPlayingMetadata(_ metadata: MetadataRecord) {
		var dict: [String: String] = [:]
		if let title = metadata.title { dict["title"] = title }
		if let subtitle = metadata.subtitle { dict["artist"] = subtitle }
		if let artworkUri = metadata.artworkUri { dict["artworkUri"] = artworkUri }
		if !dict.isEmpty {
			engine.setNowPlayingMetadata(dict, artworkHeaders: metadata.artworkHeaders)
		}
	}

	private func resolvePresenter() -> UIViewController? {
		if let fromContext = presenterProvider(), fromContext.presentedViewController == nil {
			return fromContext
		}
		// Fallback: walk the key window's presented chain.
		let keyWindow = UIApplication.shared.connectedScenes
			.compactMap { $0 as? UIWindowScene }
			.flatMap { $0.windows }
			.first { $0.isKeyWindow }
		var top = keyWindow?.rootViewController
		while let presented = top?.presentedViewController, !presented.isBeingDismissed {
			top = presented
		}
		return top
	}

	// MARK: - Teardown

	/// Every dismissal path (close button, programmatic dismiss(), EOF
	/// auto-close, fatal error) funnels through here. Ordering matters:
	/// 1. stop UI timers, 2. disarm/stop PiP, 3. emit onDismiss from a
	/// coherent position snapshot BEFORE engine teardown so JS reports the
	/// final progress correctly, 4. dismiss the VC, 5. shut the engine down
	/// in the completion so the last frame stays up during the fade.
	func dismiss(reason: PlayerDismissReason, completion: (() -> Void)? = nil) {
		guard !isDismissing else {
			completion?()
			return
		}
		isDismissing = true

		viewModel.willTeardown()
		engine.setPictureInPictureAutoStartEnabled(false)
		if engine.isPictureInPictureActive() {
			engine.stopPictureInPicture()
		}

		let position = engine.getCurrentPosition()
		let duration = engine.getDuration()
		emit("onDismiss", [
			"positionSec": position,
			"durationSec": duration,
			"reason": reason.rawValue,
		])

		let finish = { [weak self] in
			guard let self else { return }
			// shutdown() performs mpv_terminate_destroy on a background queue
			// (renderer.stop()) and hands the audio session back — never
			// reorder this to before the VC dismissal completes.
			self.engine.shutdown()
			self.viewController = nil
			self.onTornDown()
			completion?()
		}

		if let vc = viewController, let presenter = vc.presentingViewController {
			presenter.dismiss(animated: true) {
				// The landscape lock died with the VC, but iOS never re-reads
				// the hierarchy's supported orientations on its own after a
				// dismissal — the JS-side expo-screen-orientation unlock runs
				// on onDismiss, while this VC is still up, so its
				// re-evaluation resolves against our landscape mask. Without
				// this the app stays stuck in landscape until some navigation
				// forces a re-evaluation.
				#if os(iOS)
				presenter.setNeedsUpdateOfSupportedInterfaceOrientations()
				#endif
				finish()
			}
		} else {
			finish()
		}
	}

	/// Synchronous teardown for module destruction (app reload). No events —
	/// the JS side is going away with us.
	func teardownImmediately() {
		guard !isDismissing else { return }
		isDismissing = true
		viewModel.willTeardown()
		let presenter = viewController?.presentingViewController
		presenter?.dismiss(animated: false)
		#if os(iOS)
		presenter?.setNeedsUpdateOfSupportedInterfaceOrientations()
		#endif
		engine.shutdown()
		viewController = nil
	}
}
