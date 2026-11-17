#if os(iOS)
import SwiftUI
import UIKit

/// Hosts the remote player's screen full screen, and nothing that drives the phone: the status bar stays as
/// the app has it, the phone turns as the app allows and sleeps on its own delay (the idle timer is left
/// alone), no MPVolumeView (the volume keys keep the system's HUD and the phone's volume) and no pinch.
final class RemotePlayerViewController: UIViewController {
	private let viewModel: PlayerViewModel
	private let screen: RemoteScreenModel
	private let targetName: String?
	/// Set as a drag begins: it started on a scrolled column, or it scrubs the bar. Either keeps the screen open.
	private var dragStartedScrolled = false
	private var dragScrubbed = false

	init(viewModel: PlayerViewModel, screen: RemoteScreenModel, targetName: String?) {
		self.viewModel = viewModel
		self.screen = screen
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
			rootView: RemotePlayerRootView(viewModel: viewModel, screen: screen, targetName: targetName)
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

		// Watches every drag alongside the screen's own gestures (the bar's scrub, the column's scroll, the buttons)
		// and takes none of them; RemoteGestures decides on release whether it closes like the chevron.
		let dragDown = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
		dragDown.cancelsTouchesInView = false
		dragDown.delegate = self
		view.addGestureRecognizer(dragDown)
	}

	@objc private func dragged(_ pan: UIPanGestureRecognizer) {
		switch pan.state {
		case .began, .changed:
			if viewModel.isScrubbing { dragScrubbed = true }
		case .ended:
			guard !dragScrubbed, !dragStartedScrolled else { return }
			let close = RemoteGestures.shouldDismissOnDrag(
				distance: Double(pan.translation(in: view).y),
				velocity: Double(pan.velocity(in: view).y),
				height: Double(view.bounds.height)
			)
			if close { viewModel.close() }
		default:
			break
		}
	}
}

extension RemotePlayerViewController: UIGestureRecognizerDelegate {
	func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
		dragScrubbed = viewModel.isScrubbing
		dragStartedScrolled = false
		// The column's scroll view, if the drag starts in it: scrolled down, the drag scrolls it back instead.
		var hit = view.hitTest(gestureRecognizer.location(in: view), with: nil)
		while let candidate = hit, candidate !== view {
			if let scroll = candidate as? UIScrollView {
				dragStartedScrolled = scroll.contentOffset.y > -scroll.adjustedContentInset.top + 1
				break
			}
			hit = candidate.superview
		}
		return true
	}

	func gestureRecognizer(
		_ gestureRecognizer: UIGestureRecognizer,
		shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
	) -> Bool {
		true
	}
}
#endif
