import Combine
import SwiftUI
import UIKit

/// Full-screen presented player: hosts the engine's display layer and a
/// SwiftUI controls overlay (child UIHostingController). On iOS it owns
/// orientation, status bar, home indicator and keep-awake for the duration of
/// playback; on tvOS it owns the Siri Remote press handling (SwiftUI focus is
/// only used INSIDE panels/shelves in later phases).
final class NativePlayerViewController: UIViewController {
	private let engine: MPVPlayerEngine
	private let viewModel: PlayerViewModel
	/// Starts from the config's lock and changes when the user taps Rotate.
	private var orientationMask: UIInterfaceOrientationMask

	private let videoContainerView = UIView()
	#if os(tvOS)
	private var hostingController: UIHostingController<TVPlayerRootView>?
	#else
	private var hostingController: UIHostingController<PlayerControlsRootView>?
	#endif
	private var cancellables: Set<AnyCancellable> = []
	private var isViewVisible = false

	init(engine: MPVPlayerEngine, viewModel: PlayerViewModel, lockLandscape: Bool) {
		self.engine = engine
		self.viewModel = viewModel
		self.orientationMask = lockLandscape ? .landscape : .allButUpsideDown
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

		viewModel.onRotateRequested = { [weak self] in
			self?.rotateInterface()
		}

		videoContainerView.backgroundColor = .black
		videoContainerView.clipsToBounds = true
		view.addSubview(videoContainerView)

		engine.displayLayer.frame = view.bounds
		videoContainerView.layer.addSublayer(engine.displayLayer)

		#if os(tvOS)
		let hosting = UIHostingController(rootView: TVPlayerRootView(viewModel: viewModel))
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
			.sink { [weak self] _ in
				guard let self else { return }
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
		#endif

		#if os(tvOS)
		setupRemotePressRecognizers()
		#endif
	}

	override func viewDidLayoutSubviews() {
		super.viewDidLayoutSubviews()
		// The video fills the physical screen (NOT the safe area); the SwiftUI
		// overlay reads safe areas itself so controls avoid the notch/home
		// indicator while scrims extend under them.
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		videoContainerView.frame = view.bounds
		engine.displayLayer.frame = videoContainerView.bounds
		CATransaction.commit()
	}

	override func viewDidAppear(_ animated: Bool) {
		super.viewDidAppear(animated)
		isViewVisible = true
		UIApplication.shared.isIdleTimerDisabled = viewModel.isPlaying
	}

	override func viewWillDisappear(_ animated: Bool) {
		super.viewWillDisappear(animated)
		isViewVisible = false
		UIApplication.shared.isIdleTimerDisabled = false
	}

	// MARK: - tvOS remote input

	#if os(tvOS)
	/// VC-level press recognizers own the transport gestures; SwiftUI focus is
	/// reserved for panels/shelves (later phases). Consuming Menu here is
	/// mandatory: an unhandled Menu press on a presented full-screen VC would
	/// suspend the app instead of closing the player.
	private func setupRemotePressRecognizers() {
		addPressRecognizer(for: .menu, action: #selector(handleMenuPress))
		addPressRecognizer(for: .playPause, action: #selector(handlePlayPausePress))
		addPressRecognizer(for: .select, action: #selector(handleSelectPress))
		addPressRecognizer(for: .leftArrow, action: #selector(handleLeftPress))
		addPressRecognizer(for: .rightArrow, action: #selector(handleRightPress))
	}

	private func addPressRecognizer(for pressType: UIPress.PressType, action: Selector) {
		let recognizer = UITapGestureRecognizer(target: self, action: action)
		recognizer.allowedPressTypes = [NSNumber(value: pressType.rawValue)]
		view.addGestureRecognizer(recognizer)
	}

	@objc private func handleMenuPress() {
		// Mirror of useRemoteControl's useTVBackPress flow: visible chrome is
		// hidden first; only a Menu press from the bare-video state asks to
		// leave playback.
		if viewModel.controlsVisible {
			viewModel.toggleControls()
		} else {
			presentExitConfirmation()
		}
	}

	@objc private func handlePlayPausePress() {
		viewModel.togglePlayPause()
	}

	@objc private func handleSelectPress() {
		viewModel.toggleControls()
	}

	/// Left/right clickpad-edge clicks (arrow keys in the simulator) jump by
	/// the configured skip amounts; the chrome comes up so the landing
	/// position is visible, then auto-hides.
	@objc private func handleLeftPress() {
		viewModel.showControls()
		viewModel.seekBackward()
	}

	@objc private func handleRightPress() {
		viewModel.showControls()
		viewModel.seekForward()
	}

	/// JS-player parity: Menu with no chrome up asks before leaving playback.
	/// While the alert is presented the system routes presses to it (Menu
	/// triggers the cancel action), so our recognizers stay quiet.
	private func presentExitConfirmation() {
		guard presentedViewController == nil else { return }

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
	#endif
}
