#if os(iOS)
import SwiftUI
import UIKit

/// Hosts the remote player's screen full screen, and nothing that drives the phone: the status bar stays as
/// the app has it, the phone turns as the app allows and sleeps on its own delay (the idle timer is left
/// alone), no MPVolumeView (the volume keys keep the system's HUD and the phone's volume) and no pinch.
final class RemotePlayerViewController: UIViewController {
	private let viewModel: PlayerViewModel
	private let targetName: String?

	init(viewModel: PlayerViewModel, targetName: String?) {
		self.viewModel = viewModel
		self.targetName = targetName
		super.init(nibName: nil, bundle: nil)
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) {
		fatalError("init(coder:) is not supported")
	}

	// No supportedInterfaceOrientations override: UIKit's default, as for the app's own screens, so the
	// screen turns with the phone where the app does (and the app's window lock still applies).

	override func viewDidLoad() {
		super.viewDidLoad()
		view.backgroundColor = .black

		let hosting = UIHostingController(
			rootView: RemotePlayerRootView(viewModel: viewModel, targetName: targetName)
		)
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
	}
}
#endif
