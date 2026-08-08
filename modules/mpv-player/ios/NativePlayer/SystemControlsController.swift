#if os(iOS)
import AVFoundation
import Combine
import MediaPlayer
import UIKit

/// System volume access for the in-player slider. Backed by a hidden
/// MPVolumeView: keeping it in the view hierarchy suppresses the system
/// volume HUD (the player draws its own slider instead), and its internal
/// UISlider is the only sanctioned way to SET the system volume.
/// Hardware volume-button presses surface through KVO on the audio session's
/// outputVolume — the view model uses that to transiently reveal the slider.
final class SystemVolumeController: NSObject, ObservableObject {
	@Published var volume: Double = 0.5

	/// Add to the presented view controller's hierarchy (offscreen frame) to
	/// suppress the system volume HUD while the player is up.
	let volumeView = MPVolumeView(frame: CGRect(x: -2000, y: -2000, width: 1, height: 1))

	/// Set while the user drags our slider so KVO echoes of our own writes
	/// aren't mistaken for hardware presses.
	var isUserInteracting = false

	/// Fired on volume changes that did NOT come from our slider.
	var onExternalChange: (() -> Void)?

	private var observation: NSKeyValueObservation?
	/// KVO delivery lags our own writes by a few hundred ms, so a synchronous
	/// isUserInteracting flip alone would let late echoes of mid-drag writes
	/// snap the slider back after the finger lifts. Echoes inside this grace
	/// window after the last self-write are dropped too.
	private var lastSelfWriteAt: Date = .distantPast
	private let selfWriteGraceInterval: TimeInterval = 0.5

	override init() {
		super.init()
		volume = Double(AVAudioSession.sharedInstance().outputVolume)
		observation = AVAudioSession.sharedInstance().observe(
			\.outputVolume, options: [.new]
		) { [weak self] _, change in
			DispatchQueue.main.async {
				guard let self, let newValue = change.newValue else { return }
				guard !self.isUserInteracting,
					Date().timeIntervalSince(self.lastSelfWriteAt) > self.selfWriteGraceInterval
				else { return }
				self.volume = Double(newValue)
				self.onExternalChange?()
			}
		}
	}

	func setVolume(_ value: Double) {
		let clamped = min(max(value, 0), 1)
		volume = clamped
		lastSelfWriteAt = Date()
		guard
			let slider = volumeView.subviews.compactMap({ $0 as? UISlider }).first
		else { return }
		slider.value = Float(clamped)
	}

	deinit {
		observation?.invalidate()
	}
}

/// Screen brightness access for the in-player slider. External changes
/// (Control Center, auto-brightness) surface through the system notification
/// so the slider stays in sync.
final class SystemBrightnessController: ObservableObject {
	@Published var brightness: Double = Double(UIScreen.main.brightness)

	var isUserInteracting = false

	private var observer: NSObjectProtocol?

	init() {
		observer = NotificationCenter.default.addObserver(
			forName: UIScreen.brightnessDidChangeNotification,
			object: nil,
			queue: .main
		) { [weak self] _ in
			guard let self, !self.isUserInteracting else { return }
			self.brightness = Double(UIScreen.main.brightness)
		}
	}

	func setBrightness(_ value: Double) {
		let clamped = min(max(value, 0), 1)
		brightness = clamped
		UIScreen.main.brightness = CGFloat(clamped)
	}

	deinit {
		if let observer {
			NotificationCenter.default.removeObserver(observer)
		}
	}
}
#endif
