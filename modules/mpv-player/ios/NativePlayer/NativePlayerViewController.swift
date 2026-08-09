import Combine
import SwiftUI
import UIKit
#if os(tvOS)
import AVKit
import CoreMedia
#endif

/// Full-screen presented player: hosts the engine's display layer and a
/// SwiftUI controls overlay (child UIHostingController). On iOS it owns
/// orientation, status bar, home indicator and keep-awake for the duration of
/// playback; on tvOS it owns the Siri Remote press handling (SwiftUI focus is
/// only used INSIDE panels/shelves in later phases).
final class NativePlayerViewController: UIViewController {
	private let engine: MPVPlayerEngine
	private let viewModel: PlayerViewModel
	#if os(iOS)
	/// Starts from the config's lock and changes when the user taps Rotate.
	private var orientationMask: UIInterfaceOrientationMask
	#endif

	private let videoContainerView = UIView()
	#if os(tvOS)
	private var hostingController: UIHostingController<AnyView>?
	#else
	private var hostingController: UIHostingController<PlayerControlsRootView>?
	#endif
	private var cancellables: Set<AnyCancellable> = []
	private var isViewVisible = false
	#if os(tvOS)
	/// Whether the current pan gesture is driving the scrub (a pan that
	/// merely revealed hidden chrome must not).
	private var panIsScrubbing = false
	/// All transport recognizers — disabled while the options panel is open
	/// so SwiftUI focus owns the remote (a recognizer that fires on .select
	/// would otherwise eat the press before the focused Button gets it).
	private var remoteRecognizers: [UIGestureRecognizer] = []
	#endif

	init(engine: MPVPlayerEngine, viewModel: PlayerViewModel, lockLandscape: Bool) {
		self.engine = engine
		self.viewModel = viewModel
		#if os(iOS)
		self.orientationMask = lockLandscape ? .landscape : .allButUpsideDown
		#endif
		super.init(nibName: nil, bundle: nil)
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) {
		fatalError("init(coder:) is not supported")
	}

	// MARK: - System chrome (iOS only — tvOS has no status bar / orientation)

	#if os(iOS)
	// Presenting a full-screen modal that only supports landscape makes UIKit
	// rotate automatically. The JS coordinator additionally locks orientation
	// via expo-screen-orientation BEFORE presenting (same as the JS player's
	// useOrientation) — expo-screen-orientation implements
	// application(_:supportedInterfaceOrientationsForWindow:), and presenting
	// a landscape-only VC while the window mask is portrait-only would crash
	// with UIApplicationInvalidInterfaceOrientation.
	override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
		orientationMask
	}

	/// The in-player rotate button: flip between landscape and portrait and
	/// lock there. iOS has no "unlock and rotate once", so the button always
	/// forces the opposite orientation and the lock follows it.
	private func rotateInterface() {
		guard let scene = view.window?.windowScene else { return }
		let toPortrait = scene.interfaceOrientation.isLandscape
		orientationMask = toPortrait ? .portrait : .landscape
		setNeedsUpdateOfSupportedInterfaceOrientations()
		scene.requestGeometryUpdate(
			.iOS(interfaceOrientations: orientationMask)
		)
		// When the landscape-on-open setting is active, JS holds a WINDOW-level
		// landscape mask via expo-screen-orientation that outvotes the
		// geometry request above — the coordinator must re-lock to match.
		viewModel.emit?("onOrientationChangeRequested", [
			"orientation": toPortrait ? "portrait" : "landscape",
		])
	}

	override var prefersStatusBarHidden: Bool {
		!viewModel.controlsVisible
	}

	override var preferredStatusBarStyle: UIStatusBarStyle {
		.lightContent
	}

	override var prefersHomeIndicatorAutoHidden: Bool {
		!viewModel.controlsVisible
	}
	#endif

	// MARK: - Lifecycle

	override func viewDidLoad() {
		super.viewDidLoad()
		view.backgroundColor = .black

		#if os(iOS)
		viewModel.onRotateRequested = { [weak self] in
			self?.rotateInterface()
		}
		#endif

		videoContainerView.backgroundColor = .black
		videoContainerView.clipsToBounds = true
		view.addSubview(videoContainerView)

		engine.displayLayer.frame = view.bounds
		videoContainerView.layer.addSublayer(engine.displayLayer)

		#if os(tvOS)
		// The TV chrome is tvOS 26+ by design (native glass menus etc.) —
		// the JS chooser never routes older boxes here, so pre-26 gets a
		// bare spinner-less surface as a defensive fallback only.
		let tvRoot: AnyView
		if #available(tvOS 26.0, *) {
			tvRoot = AnyView(TVPlayerRootView(viewModel: viewModel))
		} else {
			tvRoot = AnyView(EmptyView())
		}
		let hosting = UIHostingController(rootView: tvRoot)
		#else
		let hosting = UIHostingController(rootView: PlayerControlsRootView(viewModel: viewModel))
		#endif
		hosting.view.backgroundColor = .clear
		addChild(hosting)
		hosting.view.translatesAutoresizingMaskIntoConstraints = false
		view.addSubview(hosting.view)
		NSLayoutConstraint.activate([
			hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
			hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
			hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
			hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
		])
		hosting.didMove(toParent: self)
		hostingController = hosting

		#if os(iOS)
		viewModel.$controlsVisible
			.removeDuplicates()
			.receive(on: DispatchQueue.main)
			.sink { [weak self] visible in
				guard let self else { return }
				// Deprecated, and knowingly so: RN's required
				// UIViewControllerBasedStatusBarAppearance=false disables
				// prefersStatusBarHidden app-wide, so the app-level setter is
				// the only working control — the same call RN's own StatusBar
				// module makes. (iPhone landscape masks the whole issue: no
				// status bar there ever.)
				UIApplication.shared.setStatusBarHidden(!visible, with: .fade)
				UIView.animate(withDuration: 0.2) {
					self.setNeedsStatusBarAppearanceUpdate()
					self.setNeedsUpdateOfHomeIndicatorAutoHidden()
				}
			}
			.store(in: &cancellables)
		#endif

		// Keep-awake follows playback: paused video releases the idle timer so
		// the screen can sleep (mirror of the JS player's deactivateKeepAwake
		// on pause).
		viewModel.$isPlaying
			.removeDuplicates()
			.receive(on: DispatchQueue.main)
			.sink { [weak self] isPlaying in
				guard let self, self.isViewVisible else { return }
				UIApplication.shared.isIdleTimerDisabled = isPlaying
			}
			.store(in: &cancellables)

		#if os(iOS)
		// A hidden MPVolumeView in the hierarchy suppresses the system volume
		// HUD; the player draws its own slider instead. Skipped when the
		// slider is hidden by settings so the system HUD behaves normally.
		if viewModel.showVolumeSlider {
			view.addSubview(viewModel.volumeController.volumeView)
		}
		// Pinch to zoom-to-fill. UIKit-level (not a SwiftUI gesture) so the
		// two-finger pinch can be observed without entering the SwiftUI gesture
		// arena, where it would fight the surface drag for the same touches.
		// The recognizer is always attached — enable/lock state is re-checked
		// per pinch in the view model, so config swaps need no re-wiring.
		let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
		pinch.cancelsTouchesInView = false
		// Without a delegate, whichever gesture begins first excludes the other
		// for the whole touch sequence — the overlay's 12pt surface drag usually
		// wins (first finger moves before the second lands) and the pinch is
		// silently starved. Simultaneous recognition lets the pinch always fire;
		// the overlay stands down via isPinching once it does.
		pinch.delegate = self
		view.addGestureRecognizer(pinch)
		#endif

		#if os(tvOS)
		setupRemotePressRecognizers()
		// Zoom toggles re-run layout — the layer frame carries the fill.
		viewModel.$isZoomedToFill
			.removeDuplicates()
			.receive(on: DispatchQueue.main)
			.sink { [weak self] _ in
				self?.view.setNeedsLayout()
				self?.view.layoutIfNeeded()
			}
			.store(in: &cancellables)
		// HDR: the old TV player requests matching display criteria from the
		// window's AVDisplayManager — without this, HDR plays as SDR.
		viewModel.onHDRModeDetected = { [weak self] mode, fps in
			self?.applyDisplayCriteria(for: mode, fps: Float(fps))
		}
		#endif
	}

	#if os(iOS)
	@objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
		switch recognizer.state {
		case .began:
			viewModel.pinchBegan()
		case .changed:
			viewModel.pinchChanged(scale: Double(recognizer.scale))
		case .ended, .cancelled, .failed:
			viewModel.pinchEnded()
		default:
			break
		}
	}
	#endif

	override func viewDidLayoutSubviews() {
		super.viewDidLayoutSubviews()
		// The video fills the physical screen (NOT the safe area); the SwiftUI
		// overlay reads safe areas itself so controls avoid the notch/home
		// indicator while scrims extend under them.
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		videoContainerView.frame = view.bounds
		engine.displayLayer.frame = zoomAwareLayerFrame()
		CATransaction.commit()
	}

	/// tvOS zoom-to-fill: AVSampleBufferDisplayLayer.videoGravity has a
	/// history of silently not applying (and mpv's VO owns the layer), so
	/// fill is implemented by sizing the layer to the aspect-fill rect —
	/// the clipping container crops the overflow. The layer's aspect then
	/// matches the video's, making gravity irrelevant. iOS keeps the
	/// gravity-based fill (proven, and PiP depends on the layer geometry).
	private func zoomAwareLayerFrame() -> CGRect {
		let bounds = videoContainerView.bounds
		#if os(tvOS)
		guard viewModel.isZoomedToFill, bounds.width > 0, bounds.height > 0 else {
			return bounds
		}
		let videoAR =
			CGFloat(viewModel.videoWidth ?? 1920)
			/ CGFloat(max(viewModel.videoHeight ?? 1080, 1))
		let screenAR = bounds.width / bounds.height
		let size: CGSize =
			videoAR > screenAR
			? CGSize(width: bounds.height * videoAR, height: bounds.height)
			: CGSize(width: bounds.width, height: bounds.width / videoAR)
		return CGRect(
			x: (bounds.width - size.width) / 2,
			y: (bounds.height - size.height) / 2,
			width: size.width,
			height: size.height
		)
		#else
		return bounds
		#endif
	}

	override func viewDidAppear(_ animated: Bool) {
		super.viewDidAppear(animated)
		isViewVisible = true
		UIApplication.shared.isIdleTimerDisabled = viewModel.isPlaying
		#if os(iOS)
		UIApplication.shared.setStatusBarHidden(!viewModel.controlsVisible, with: .none)
		#endif
	}

	override func viewWillDisappear(_ animated: Bool) {
		super.viewWillDisappear(animated)
		isViewVisible = false
		UIApplication.shared.isIdleTimerDisabled = false
		#if os(iOS)
		// Hand the bar back visible — the app-level state persists past this
		// VC, and the RN screens underneath expect the bar shown.
		UIApplication.shared.setStatusBarHidden(false, with: .fade)
		#endif
		#if os(tvOS)
		resetDisplayCriteria()
		#endif
	}

	// MARK: - tvOS remote input

	#if os(tvOS)
	/// VC-level press recognizers own the transport gestures; SwiftUI focus is
	/// reserved for panels/shelves (later phases). Consuming Menu here is
	/// mandatory: an unhandled Menu press on a presented full-screen VC would
	/// suspend the app instead of closing the player.
	private func setupRemotePressRecognizers() {
		// Menu stays enabled even while the options panel owns the remote:
		// if focus ever fails to land inside the panel, an unhandled Menu
		// press would suspend the app instead of closing the panel. The
		// handler is panel-aware; the panel's onExitCommand is the backup.
		addPressRecognizer(
			for: .menu, action: #selector(handleMenuPress), disabledWhilePanelOpen: false)
		// Play/Pause stays live even in focus mode: it doubles as the
		// skip/play-now shortcut while a pill or countdown is showing.
		addPressRecognizer(
			for: .playPause, action: #selector(handlePlayPausePress),
			disabledWhilePanelOpen: false)
		addPressRecognizer(for: .select, action: #selector(handleSelectPress))
		addPressRecognizer(for: .leftArrow, action: #selector(handleLeftPress))
		addPressRecognizer(for: .rightArrow, action: #selector(handleRightPress))
		addPressRecognizer(for: .downArrow, action: #selector(handleDownPress))
		addPressRecognizer(for: .upArrow, action: #selector(handleDownPress))

		let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
		view.addGestureRecognizer(pan)
		remoteRecognizers.append(pan)

		// Focus mode: whenever the button chrome is up, SwiftUI focus owns
		// the remote and the transport recognizers go quiet (a recognizer
		// firing on .select would eat the press before the focused Button
		// gets it). Scrubbing keeps them live — the bar shows without
		// focusable content in that state. The native Menu popups present in
		// their own window, so they never see these recognizers at all.
		Publishers.CombineLatest4(
			viewModel.$controlsVisible, viewModel.$isScrubbing,
			viewModel.$showEpisodeList, viewModel.$showStillWatching
		)
		.map { visible, scrubbing, shelf, stillWatching in
			(visible && !scrubbing) || shelf || stillWatching
		}
		.removeDuplicates()
		.receive(on: DispatchQueue.main)
		.sink { [weak self] focusMode in
			guard let self else { return }
			for recognizer in self.remoteRecognizers {
				recognizer.isEnabled = !focusMode
			}
			// No forced focus-engine kick here: SwiftUI requests focus itself
			// when focusable content mounts, and a UIKit-level update would
			// resolve to the left-most button, stomping the row's remembered
			// default (prefersDefaultFocus/FocusState restore).
		}
		.store(in: &cancellables)
	}

	private func addPressRecognizer(
		for pressType: UIPress.PressType, action: Selector,
		disabledWhilePanelOpen: Bool = true
	) {
		let recognizer = UITapGestureRecognizer(target: self, action: action)
		recognizer.allowedPressTypes = [NSNumber(value: pressType.rawValue)]
		view.addGestureRecognizer(recognizer)
		if disabledWhilePanelOpen {
			remoteRecognizers.append(recognizer)
		}
	}

	@objc private func handleMenuPress() {
		// Mirror of useRemoteControl's useTVBackPress flow, extended for the
		// scrub state (open native Menu popups consume Menu in their own
		// window before this recognizer ever sees it): an armed scrub is
		// abandoned first, visible chrome is hidden next; only a Menu press
		// from the bare-video state asks to leave playback.
		if viewModel.showEpisodeList {
			viewModel.showEpisodeList = false
		} else if viewModel.countdownRemaining != nil {
			viewModel.cancelCountdown()
		} else if viewModel.isScrubbing {
			viewModel.cancelScrub()
		} else if viewModel.controlsVisible {
			viewModel.toggleControls()
		} else if viewModel.seekFeedbackVisible {
			viewModel.hideSeekFeedback()
		} else {
			presentExitConfirmation()
		}
	}

	@objc private func handlePlayPausePress() {
		if viewModel.countdownRemaining != nil {
			viewModel.playNextEpisode()
		} else if viewModel.isScrubbing {
			// An armed scrub outranks an active segment: a scrub armed inside
			// an intro must commit its target, not skip the intro.
			// Play/Pause on an armed scrub means "jump there and play" even
			// when playback was paused before the scrub began.
			viewModel.endScrub()
			if engine.isPaused() {
				engine.play()
			}
		} else {
			// Never skips a segment: Play/Pause is playback only. Skipping
			// is Select's job — the pill with the chrome hidden, the focused
			// row button in the full chrome.
			viewModel.togglePlayPause()
		}
	}

	@objc private func handleSelectPress() {
		// Reachable with the chrome hidden or while any scrub is armed (the
		// idle full chrome disables this recognizer, and the bar disables
		// itself mid-scrub so this is Select's sole owner): commit an armed
		// scrub, otherwise summon the chrome.
		if viewModel.countdownRemaining != nil {
			viewModel.playNextEpisode()
		} else if viewModel.isScrubbing {
			// Same precedence as Play/Pause: commit the armed scrub even
			// while a segment is active.
			viewModel.endScrub()
		} else if viewModel.activeSegment != nil {
			viewModel.skipActiveSegment()
		} else {
			viewModel.showControls()
		}
	}

	/// Left/right clickpad-edge clicks (arrow keys in the simulator) with
	/// the chrome hidden jump by the configured skip amounts — WITHOUT
	/// summoning the chrome, which would flip the remote into focus
	/// navigation mid-jump. While a scrub is armed they nudge the target.
	@objc private func handleLeftPress() {
		if viewModel.isScrubbing {
			nudgeScrub(by: -viewModel.seekBackwardSec)
		} else {
			viewModel.seekBackward()
			viewModel.flashSeekFeedback()
		}
	}

	@objc private func handleRightPress() {
		if viewModel.isScrubbing {
			nudgeScrub(by: viewModel.seekForwardSec)
		} else {
			viewModel.seekForward()
			viewModel.flashSeekFeedback()
		}
	}

	/// Clickpad top/bottom-edge clicks (up/down keys in the simulator):
	/// summon the chrome, like Select.
	@objc private func handleDownPress() {
		guard viewModel.errorMessage == nil, !viewModel.isScrubbing else { return }
		viewModel.showControls()
	}

	// MARK: tvOS scrubbing (Apple TV convention: pan to arm a position,
	// Select/Play to commit, Menu to abandon — viewModel.beginScrub already
	// pauses, endScrub seeks and resumes)

	/// Seconds moved per pan point at rest — a slow drag gives fine control.
	private static let panBaseSecondsPerPoint: Double = 0.05
	/// Finger velocity (points/sec) at which acceleration reaches 2x base.
	private static let panAccelerationReferenceVelocity: Double = 1000
	/// Curve exponent: >1 keeps slow drags fine and rewards hard flicks.
	private static let panAccelerationPower: Double = 1.5
	/// Acceleration ceiling so a violent flick can't cross a whole film.
	private static let panMaxSecondsPerPoint: Double = 1.0

	@objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
		switch gesture.state {
		case .began:
			// A predominantly-vertical swipe never scrubs — it summons the
			// chrome (focus mode) instead.
			let velocity = gesture.velocity(in: view)
			if !viewModel.isScrubbing, abs(velocity.y) > abs(velocity.x) {
				panIsScrubbing = false
				if viewModel.errorMessage == nil {
					viewModel.showControls()
				}
				return
			}
			// Horizontal pan with the chrome hidden arms a scrub.
			guard viewModel.isReadyToSeek,
				viewModel.duration > 0, viewModel.errorMessage == nil
			else {
				panIsScrubbing = false
				return
			}
			panIsScrubbing = true
			if !viewModel.isScrubbing {
				viewModel.beginScrub()
			}
			gesture.setTranslation(.zero, in: view)
		case .changed:
			guard panIsScrubbing, viewModel.duration > 0 else { return }
			// Incremental deltas scaled by finger velocity (system-player
			// feel): the same physical distance covers seconds when dragged
			// slowly and minutes when flicked.
			let dx = Double(gesture.translation(in: view).x)
			gesture.setTranslation(.zero, in: view)
			let speed = abs(Double(gesture.velocity(in: view).x))
			let boost = pow(speed / Self.panAccelerationReferenceVelocity, Self.panAccelerationPower)
			let rate = min(Self.panBaseSecondsPerPoint * (1 + boost), Self.panMaxSecondsPerPoint)
			viewModel.updateScrub(
				fraction: (viewModel.scrubPosition + dx * rate) / viewModel.duration)
		case .ended, .cancelled, .failed:
			// Lifting the finger keeps the scrub armed; consecutive pans
			// accumulate from the armed position.
			panIsScrubbing = false
		default:
			break
		}
	}

	private func nudgeScrub(by delta: Double) {
		guard viewModel.duration > 0 else { return }
		viewModel.updateScrub(
			fraction: (viewModel.scrubPosition + delta) / viewModel.duration)
	}

	/// JS-player parity: Menu with no chrome up asks before leaving playback.
	/// While the alert is presented the system routes presses to it (Menu
	/// triggers the cancel action), so our recognizers stay quiet.
	private func presentExitConfirmation() {
		guard presentedViewController == nil else { return }
		// JS parity (handleWillExit): the countdown must not swap the episode
		// underneath the exit alert. Sticky-cancel is fine — a user who was
		// asked "stop playback?" and said no is deliberately still watching.
		viewModel.cancelCountdown()

		let message: String
		if let itemTitle = viewModel.metadata?.title, !itemTitle.isEmpty {
			let template = viewModel.str("stopPlayingTitle", "Stop playing \"%TITLE%\"?")
			message = template.contains("%TITLE%")
				? template.replacingOccurrences(of: "%TITLE%", with: itemTitle)
				: template
		} else {
			message = viewModel.str("stopPlayingConfirm", "Are you sure you want to stop playback?")
		}

		let alert = UIAlertController(
			title: viewModel.str("stopPlayback", "Stop playback"),
			message: message,
			preferredStyle: .alert
		)
		alert.addAction(UIAlertAction(title: viewModel.str("cancel", "Cancel"), style: .cancel))
		alert.addAction(
			UIAlertAction(title: viewModel.str("stop", "Stop"), style: .destructive) { [weak self] _ in
				self?.viewModel.close()
			})
		present(alert, animated: true)
	}

	// MARK: tvOS HDR display criteria (port of MpvPlayerView's extension —
	// createHDRFormatDescription + avDisplayManager.preferredDisplayCriteria)

	private func applyDisplayCriteria(for hdrMode: HDRMode, fps: Float) {
		guard #available(tvOS 17.0, *), let window = view.window else { return }
		let manager = window.avDisplayManager
		if hdrMode == .sdr {
			manager.preferredDisplayCriteria = nil
			return
		}
		guard let formatDescription = createHDRFormatDescription(hdrMode: hdrMode) else {
			return
		}
		manager.preferredDisplayCriteria = AVDisplayCriteria(
			refreshRate: fps,
			formatDescription: formatDescription
		)
	}

	private func resetDisplayCriteria() {
		guard #available(tvOS 17.0, *), let window = view.window else { return }
		window.avDisplayManager.preferredDisplayCriteria = nil
	}

	private func createHDRFormatDescription(hdrMode: HDRMode) -> CMFormatDescription? {
		var formatDescription: CMFormatDescription?
		var extensions: [String: Any] = [
			kCMFormatDescriptionExtension_FullRangeVideo as String: true
		]
		switch hdrMode {
		case .hdr10, .dolbyVision:
			extensions[kCMFormatDescriptionExtension_ColorPrimaries as String] =
				kCMFormatDescriptionColorPrimaries_ITU_R_2020
			extensions[kCMFormatDescriptionExtension_TransferFunction as String] =
				kCMFormatDescriptionTransferFunction_SMPTE_ST_2084_PQ
			extensions[kCMFormatDescriptionExtension_YCbCrMatrix as String] =
				kCMFormatDescriptionYCbCrMatrix_ITU_R_2020
		case .hlg:
			extensions[kCMFormatDescriptionExtension_ColorPrimaries as String] =
				kCMFormatDescriptionColorPrimaries_ITU_R_2020
			extensions[kCMFormatDescriptionExtension_TransferFunction as String] =
				kCMFormatDescriptionTransferFunction_ITU_R_2100_HLG
			extensions[kCMFormatDescriptionExtension_YCbCrMatrix as String] =
				kCMFormatDescriptionYCbCrMatrix_ITU_R_2020
		case .sdr:
			return nil
		}
		let status = CMVideoFormatDescriptionCreate(
			allocator: kCFAllocatorDefault,
			codecType: kCMVideoCodecType_HEVC,
			width: 3840,
			height: 2160,
			extensions: extensions as CFDictionary,
			formatDescriptionOut: &formatDescription
		)
		return status == noErr ? formatDescription : nil
	}
	#endif
}
#if os(iOS)
// Simultaneous recognition for the pinch (see setup). iOS-only: the tvOS
// press/pan recognizers never set a delegate and must keep default
// exclusivity.
extension NativePlayerViewController: UIGestureRecognizerDelegate {
	func gestureRecognizer(
		_ gestureRecognizer: UIGestureRecognizer,
		shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
	) -> Bool {
		true
	}
}
#endif
