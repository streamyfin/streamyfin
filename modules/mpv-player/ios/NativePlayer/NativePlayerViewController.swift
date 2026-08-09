#if os(iOS)
import Combine
import SwiftUI
import UIKit

/// Full-screen presented player: hosts the engine's display layer and a
/// SwiftUI controls overlay (child UIHostingController). Owns orientation,
/// status bar, home indicator and keep-awake for the duration of playback.
final class NativePlayerViewController: UIViewController {
	private let engine: MPVPlayerEngine
	private let viewModel: PlayerViewModel
	/// Starts from the config's lock and changes when the user taps Rotate.
	private var orientationMask: UIInterfaceOrientationMask

	private let videoContainerView = UIView()
	private var hostingController: UIHostingController<PlayerControlsRootView>?
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

	// MARK: - System chrome

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

		let hosting = UIHostingController(rootView: PlayerControlsRootView(viewModel: viewModel))
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
	}

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
		UIApplication.shared.setStatusBarHidden(!viewModel.controlsVisible, with: .none)
	}

	override func viewWillDisappear(_ animated: Bool) {
		super.viewWillDisappear(animated)
		isViewVisible = false
		UIApplication.shared.isIdleTimerDisabled = false
		// Hand the bar back visible — the app-level state persists past this
		// VC, and the RN screens underneath expect the bar shown.
		UIApplication.shared.setStatusBarHidden(false, with: .fade)
	}
}

extension NativePlayerViewController: UIGestureRecognizerDelegate {
	func gestureRecognizer(
		_ gestureRecognizer: UIGestureRecognizer,
		shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
	) -> Bool {
		true
	}
}
#endif
