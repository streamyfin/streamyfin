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
	private let lockLandscape: Bool

	private let videoContainerView = UIView()
	private var hostingController: UIHostingController<PlayerControlsRootView>?
	private var cancellables: Set<AnyCancellable> = []
	private var isViewVisible = false

	init(engine: MPVPlayerEngine, viewModel: PlayerViewModel, lockLandscape: Bool) {
		self.engine = engine
		self.viewModel = viewModel
		self.lockLandscape = lockLandscape
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
		lockLandscape ? .landscape : .allButUpsideDown
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
			.sink { [weak self] _ in
				guard let self else { return }
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
}
#endif
