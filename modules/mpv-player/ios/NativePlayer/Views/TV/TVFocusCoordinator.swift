#if os(tvOS)
import SwiftUI
import UIKit
import os

/// Shared logger for the TV focus machinery — read from the simulator with:
/// xcrun simctl spawn booted log show --last 5m --info \
///   --predicate 'subsystem == "com.fredrikburmester.streamyfin"'
/// (`--info` is required: these are info-level records. os.Logger spelled
/// out because this module has its own `Logger` type that shadows it.)
enum TVFocusLog {
	static let log = os.Logger(
		subsystem: "com.fredrikburmester.streamyfin", category: "tvfocus")
}

/// The focus zones of the TV player — one per hosted SwiftUI layer that can
/// own the remote. `.none` is recognizer mode: nothing focusable anywhere,
/// the VC's press/pan recognizers own every press.
enum TVFocusZone: Hashable {
	case none
	case chrome
	case shelf
	case subtitleSearch
	case stillWatching
}

/// Published hand-off from the coordinator to the SwiftUI layer that just
/// became focusable: "your host is live and the engine has been pointed at
/// it — establish your preferred focus now". The epoch makes repeat
/// activations of the same zone distinct values so onChange always fires.
struct TVFocusRequest: Equatable {
	var zone: TVFocusZone
	var epoch: Int
}

/// UIKit-side focus orchestration for the TV player.
///
/// The division of labour: UIKit decides WHICH layer may hold focus, SwiftUI
/// decides WHICH control within it. The sequencing between the two halves is
/// what makes or breaks it:
///
/// 1. Every layer host starts — and between activations stays —
///    `isUserInteractionEnabled = false`, keeping its whole subtree out of
///    the focus system. Only one layer is ever focusable.
/// 2. A zone is only enabled once its SwiftUI content reports itself mounted
///    (`contentMounted`). Activation and mounting race in either order, so
///    both paths converge here. Enabling earlier is what let the focus
///    engine fall through to the React Native views BEHIND the player: the
///    host was focusable but empty, so the engine looked elsewhere.
/// 3. After enabling, `focusRequest` is published so the layer can assert
///    its own `@FocusState` target — and ONLY then, if that produced
///    nothing, is the engine pointed at the host as a fallback. That order
///    is the whole point: see enableAndKick.
///
/// The owning VC routes `preferredFocusEnvironments` here too, so
/// system-driven updates (initial window attach, restore after a
/// UIAlertController dismisses) also resolve into the active zone.
final class TVFocusCoordinator: ObservableObject {
	/// Observed by the layer views; see TVFocusRequest.
	@Published private(set) var focusRequest = TVFocusRequest(zone: .none, epoch: 0)

	private var hostViews: [TVFocusZone: UIView] = [:]
	/// Zones whose SwiftUI content is currently mounted. A zone can be
	/// activated before its content exists (the chrome sink and the row's
	/// onAppear fire in either order) — the pending activation completes
	/// when the content reports in.
	private var mountedZones: Set<TVFocusZone> = []
	private(set) var activeZone: TVFocusZone = .none

	func register(_ hostView: UIView, for zone: TVFocusZone) {
		hostViews[zone] = hostView
		hostView.isUserInteractionEnabled = false
	}

	/// What the owning VC reports as its preferredFocusEnvironments.
	var preferredEnvironments: [UIFocusEnvironment] {
		guard let hostView = hostViews[activeZone] else { return [] }
		return [hostView]
	}

	// MARK: - Zone activation

	func activate(_ zone: TVFocusZone) {
		guard zone != activeZone else { return }
		TVFocusLog.log.info(
			"zone \(String(describing: self.activeZone), privacy: .public) -> \(String(describing: zone), privacy: .public)"
		)
		activeZone = zone
		guard zone != .none else {
			// Recognizer mode: nothing anywhere may be focusable.
			for view in hostViews.values {
				view.isUserInteractionEnabled = false
			}
			return
		}
		// NOTE: the outgoing host is deliberately NOT disabled here. Going
		// dark first leaves a frame with nothing focused, and the engine
		// repairs a focus-less frame GEOMETRICALLY — it takes the left-most
		// item in reach, not the preferred one. That repair is the hop. The
		// outgoing layer keeps focus until the incoming one has claimed it;
		// retireOthers() runs at the end of the handover.
		if mountedZones.contains(zone) {
			enableAndKick(zone)
		} else {
			// Content not committed yet — contentMounted() finishes the job.
			TVFocusLog.log.info(
				"activation deferred: \(String(describing: zone), privacy: .public) content not mounted"
			)
		}
	}

	/// Called from a layer's onAppear once its focusable content exists.
	func contentMounted(_ zone: TVFocusZone) {
		guard !mountedZones.contains(zone) else { return }
		mountedZones.insert(zone)
		TVFocusLog.log.info("content mounted: \(String(describing: zone), privacy: .public)")
		if zone == activeZone {
			enableAndKick(zone)
		}
	}

	/// Called from a layer's onDisappear.
	func contentUnmounted(_ zone: TVFocusZone) {
		mountedZones.remove(zone)
	}

	/// Re-assert the active zone. The first activation can happen before the
	/// view joins a window — no focus system exists yet and the kick is
	/// dropped — so the VC calls this from viewDidAppear.
	func refresh() {
		guard activeZone != .none, mountedZones.contains(activeZone) else { return }
		enableAndKick(activeZone)
	}

	// MARK: - Focus placement

	/// Grace given to the handover to settle before it is checked. Three
	/// frames at 60Hz - long enough for a state write plus a render pass,
	/// short enough to stay inside the layer's own 0.2s fade-in.
	private static let establishGrace: TimeInterval = 0.05

	/// Hand a zone the remote, in three beats on separate runloop turns.
	///
	/// The beats are not ceremony; each one exists because of a specific
	/// failure:
	///
	/// - BEAT 1 publishes the request while the host is still OUT of the
	///   focus graph. The layer gates itself down to a single focusable
	///   control and names it. Nothing the engine does can interfere yet.
	/// - BEAT 2 joins the graph, one turn later. Separate turns because a
	///   focus claim made in the same transaction as the structural
	///   re-enable is dropped by the engine. And because the engine repairs
	///   a focus-less frame GEOMETRICALLY - left-most item wins, preferred
	///   focus is not consulted - the layer's gate is what makes that repair
	///   land on the target: by now it is the only candidate there is.
	/// - BEAT 3 checks the result, and only then retires the outgoing layer.
	///
	/// The fallback `requestFocusUpdate(to:)` is kept, but do not expect much
	/// of it: Apple documents it as having no effect unless the target
	/// already contains the focused item ("focus cannot be taken, only
	/// given"), which is exactly the case we would be invoking it for. It
	/// costs nothing and the log line tells us which path ran.
	private func enableAndKick(_ zone: TVFocusZone) {
		guard let hostView = hostViews[zone] else { return }
		focusRequest = TVFocusRequest(zone: zone, epoch: focusRequest.epoch + 1)
		DispatchQueue.main.async { [weak self] in
			// A newer activation supersedes this one entirely.
			guard let self, self.activeZone == zone else { return }
			hostView.isUserInteractionEnabled = true
			DispatchQueue.main.asyncAfter(deadline: .now() + Self.establishGrace) {
				guard self.activeZone == zone else { return }
				self.settle(zone, hostView: hostView)
			}
		}
	}

	private func settle(_ zone: TVFocusZone, hostView: UIView) {
		defer { retireOthers(than: zone) }
		guard let focusSystem = UIFocusSystem.focusSystem(for: hostView) else {
			TVFocusLog.log.info("settle skipped: no focus system (not in window yet)")
			return
		}
		if Self.focus(focusSystem.focusedItem, isInside: hostView) {
			TVFocusLog.log.info(
				"focus landed in \(String(describing: zone), privacy: .public): \(String(describing: focusSystem.focusedItem), privacy: .public)"
			)
			return
		}
		focusSystem.requestFocusUpdate(to: hostView)
		focusSystem.updateFocusIfNeeded()
		TVFocusLog.log.info(
			"fallback kick \(String(describing: zone), privacy: .public); engine picked: \(String(describing: focusSystem.focusedItem), privacy: .public)"
		)
	}

	/// Drop every other layer out of the focus graph, once the incoming one
	/// has had its chance to claim focus. Deliberately last: see activate().
	private func retireOthers(than zone: TVFocusZone) {
		for (hostZone, view) in hostViews where hostZone != zone {
			view.isUserInteractionEnabled = false
		}
	}

	/// Whether the focus system's current item lives under `host`. Walks
	/// `parentFocusEnvironment` rather than the view tree: SwiftUI's focus
	/// items are not guaranteed to be UIViews, but they are always focus
	/// environments parented into the hosting view.
	private static func focus(_ item: UIFocusItem?, isInside host: UIView) -> Bool {
		var environment: UIFocusEnvironment? = item
		while let current = environment {
			if current === host { return true }
			environment = current.parentFocusEnvironment
		}
		return false
	}
}

// MARK: - SwiftUI integration

/// Applied to a focusable layer's root: reports its mount state to the
/// coordinator, and runs `establish` when the coordinator reports the host
/// live so the layer can assert its `@FocusState` target.
///
/// Deliberately NOT here: `resetFocus(in:)` and a `Namespace`. Those exist
/// to re-arm `prefersDefaultFocus`, which is a separate mechanism keyed on
/// `focusScope(_:)` — Apple documents no interaction between it and
/// `@FocusState`, and every layer here now steers focus through
/// `.defaultFocus(_:_:priority:)` instead.
@available(tvOS 26.0, *)
struct TVFocusZoneModifier: ViewModifier {
	@ObservedObject var coordinator: TVFocusCoordinator
	let zone: TVFocusZone
	let establish: () -> Void

	func body(content: Content) -> some View {
		content
			.onAppear { coordinator.contentMounted(zone) }
			.onDisappear { coordinator.contentUnmounted(zone) }
			.onChange(of: coordinator.focusRequest) { request in
				guard request.zone == zone else { return }
				establish()
			}
	}
}

@available(tvOS 26.0, *)
extension View {
	func tvFocusZone(
		_ zone: TVFocusZone,
		coordinator: TVFocusCoordinator,
		establish: @escaping () -> Void = {}
	) -> some View {
		modifier(
			TVFocusZoneModifier(coordinator: coordinator, zone: zone, establish: establish))
	}

	/// The standard establish body, which every focusable layer wants: gate
	/// the layer down to a single focusable control, name it, and let the
	/// rest back in once focus has landed (the layer clears `gate`).
	///
	/// The gate is the load-bearing half. The engine repairs a focus-less
	/// frame geometrically - left-most item wins - and a layer joining the
	/// focus graph from nothing is exactly such a frame. Preferred focus is
	/// not consulted for that repair, so the only reliable way to be picked
	/// is to be the sole candidate. Layers whose target already IS the
	/// left-most control (the still-watching card, the search panel) can skip
	/// it and pass the default.
	///
	/// The `@FocusState` write matters too, and not just as a backstop:
	/// `.defaultFocus` is documented as evaluated when the WINDOW first
	/// appears, so for layers that mount per presentation it is decorative -
	/// and inside a ScrollView it is ignored outright (Apple FB706321), which
	/// is why the episode shelf opened on the left-most card instead of the
	/// episode you are actually watching.
	func tvFocusZone<Value: Hashable>(
		_ zone: TVFocusZone,
		coordinator: TVFocusCoordinator,
		focus: FocusState<Value?>.Binding,
		gate: Binding<Value?> = .constant(nil),
		target: @escaping () -> Value
	) -> some View {
		tvFocusZone(zone, coordinator: coordinator) {
			let value = target()
			TVFocusLog.log.info(
				"establish \(String(describing: zone), privacy: .public) -> \(String(describing: value), privacy: .public)"
			)
			// Gate BEFORE naming: the coordinator only joins the host to the
			// focus graph on the next runloop turn, so this is the frame in
			// which the layer gets to decide what the engine may pick.
			gate.wrappedValue = value
			focus.wrappedValue = value
			DispatchQueue.main.async {
				guard focus.wrappedValue != value else { return }
				TVFocusLog.log.info(
					"re-assert \(String(describing: zone), privacy: .public) -> \(String(describing: value), privacy: .public)"
				)
				focus.wrappedValue = value
			}
			// Backstop: if focus never lands the layer never clears the gate,
			// and a gated layer is a layer you cannot navigate.
			DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
				guard gate.wrappedValue != nil else { return }
				TVFocusLog.log.info(
					"gate released by backstop in \(String(describing: zone), privacy: .public)"
				)
				gate.wrappedValue = nil
			}
		}
	}

	/// Out of the focus graph while a gate is active and names something
	/// else. Applied to every member of a gated layer; see the gate note on
	/// tvFocusZone above.
	///
	/// Both modifiers, on purpose. `.focusable(false)` is the one that says
	/// what we mean, but its effect on views that are ALREADY focusable
	/// (Button, Menu) is not something Apple documents. `.disabled(true)`
	/// definitely removes a control from the focus graph and propagates
	/// through the environment, so it does not care that it is applied
	/// outside `.focused(_:equals:)`. Its cost is a dimmed control, which is
	/// invisible here: the gate is held for the frames in which the chrome is
	/// still fading up from zero.
	@ViewBuilder
	func tvFocusGated<Value: Equatable>(_ gate: Value?, _ id: Value) -> some View {
		if let gate, gate != id {
			focusable(false).disabled(true)
		} else {
			self
		}
	}
}
#endif
