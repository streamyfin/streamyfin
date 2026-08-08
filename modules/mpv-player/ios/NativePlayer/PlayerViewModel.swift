#if os(iOS)
import Combine
import Foundation
import QuartzCore
import UIKit

/// Fast-ticking playback clock, deliberately isolated from PlayerViewModel.
/// The display link writes ~30Hz while playing; if those writes fired
/// PlayerViewModel.objectWillChange, every observing view would rebuild each
/// frame — and rebuilding the button behind a presented UIMenu makes iOS
/// gray out its items and drop their actions. Only views that render
/// time/progress observe this object; the menu-bearing bars observe
/// PlayerViewModel alone and must never take a dependency on it.
final class PlaybackTimeModel: ObservableObject {
	/// Interpolated position for smooth scrubber/time-label motion between
	/// the renderer's 1Hz ticks, seconds. Never weaken the renderer's
	/// progress throttle instead — it is battery-critical.
	@Published var displayPosition: Double = 0
	@Published var cacheSeconds: Double = 0
}

/// Bridges MPVPlayerEngine callbacks into SwiftUI state and dual-emits every
/// engine event to the JS coordinator via `emit`. Also owns pure-UI behavior:
/// auto-hide, scrubbing state, display-position interpolation between the
/// renderer's 1Hz ticks, segment pills and the next-episode countdown.
///
/// All engine callbacks arrive on the main thread (the engine dispatches
/// them), and all UI intents come from SwiftUI — so no locking is needed.
final class PlayerViewModel: NSObject, ObservableObject {
	weak var engine: MPVPlayerEngine?
	var emit: ((String, [String: Any]) -> Void)?
	var onDismissRequested: ((PlayerDismissReason) -> Void)?
	/// Set by the view controller — it owns the orientation mask.
	var onRotateRequested: (() -> Void)?

	// MARK: - Playback state

	@Published var isPlaying = false
	@Published var isBuffering = true
	@Published var isReadyToSeek = false
	/// Authoritative position from the renderer (~1Hz), seconds. Not
	/// published on purpose — no view renders it, and publishing would fire
	/// objectWillChange once per second for every observer.
	private(set) var position: Double = 0
	@Published var duration: Double = 0
	/// The ticking values live here, not on this object — see
	/// PlaybackTimeModel. Views that render them observe `time` explicitly.
	let time = PlaybackTimeModel()

	/// Proxies so internal logic keeps reading/writing the clock naturally.
	/// Views must NOT rely on these for updates — observe `time`.
	var displayPosition: Double {
		get { time.displayPosition }
		set { time.displayPosition = newValue }
	}
	var cacheSeconds: Double {
		get { time.cacheSeconds }
		set { time.cacheSeconds = newValue }
	}
	@Published var speed: Double = 1.0
	@Published var isPipActive = false
	@Published var errorMessage: String?
	@Published var isZoomedToFill = false
	@Published var subtitleScale: Double = 1.0
	/// Session-scoped A/V sync offsets (seconds) and softvol gain (percent).
	/// Reset to neutral when the played item changes; re-applied to the
	/// engine on every stream swap because mpv properties persist on the
	/// handle across loadfile.
	@Published var subtitleDelay: Double = 0
	@Published var audioDelay: Double = 0
	@Published var volumeBoostPercent = 100

	// MARK: - UI state

	@Published var controlsVisible = true
	/// VLC-style lock mode: chrome hidden and taps ignored except for a
	/// transient unlock pill. Survives episode changes on purpose — it's a
	/// hands-off viewing mode.
	@Published var controlsLocked = false
	@Published var unlockButtonRevealed = false
	/// Hardware volume press while the chrome is hidden briefly shows just the
	/// volume slider (mirror of the JS AudioSlider auto-reveal).
	@Published var volumeSliderRevealed = false
	/// Vertical brightness drag while the chrome is hidden shows just the
	/// brightness slider as feedback.
	@Published var brightnessSliderRevealed = false
	@Published var isScrubbing = false
	@Published var scrubPosition: Double = 0
	@Published var showTechnicalInfo = false
	@Published var showEpisodeList = false

	// MARK: - Content state

	@Published var metadata: MetadataRecord?
	@Published var chapters: [ChapterRecord] = []
	@Published var segments: [MediaSegmentRecord] = []
	@Published var activeSegment: MediaSegmentRecord?
	@Published var nextEpisode: NextEpisodeRecord?
	/// Non-nil while the next-episode countdown card is up.
	@Published var countdownRemaining: Double?
	/// The "Are you still watching?" card, shown at EOF when the autoplay
	/// episode cap is reached (nextEpisode.stillWatchingRequired).
	@Published var showStillWatching = false
	@Published var subtitleMenu: [TrackMenuItemRecord] = []
	@Published var audioMenu: [TrackMenuItemRecord] = []
	@Published var qualityMenu: [TrackMenuItemRecord] = []
	@Published var episodeList: [EpisodeListItemRecord] = []
	@Published var trickplay: TrickplayProvider?

	/// System volume/brightness for the side sliders. The controllers exist
	/// unconditionally (cheap); the show* flags gate the UI.
	let volumeController = SystemVolumeController()
	let brightnessController = SystemBrightnessController()

	private(set) var playMethod: String?
	private(set) var transcodeReasons: [String] = []
	private(set) var seekForwardSec: Double = 10
	private(set) var seekBackwardSec: Double = 10
	private(set) var hapticsEnabled = true
	private(set) var showVolumeSlider = true
	private(set) var showBrightnessSlider = true
	private(set) var videoWidth: Int?
	private(set) var videoHeight: Int?
	private(set) var uiStrings: [String: String] = [:]

	/// Localized label from JS i18n with an English fallback.
	func str(_ key: String, _ fallback: String) -> String {
		let value = uiStrings[key]
		return (value?.isEmpty == false) ? value! : fallback
	}

	// MARK: - Internals

	private var autoHideTask: Task<Void, Never>?
	private var countdownTask: Task<Void, Never>?
	private var volumeRevealTask: Task<Void, Never>?
	private var brightnessRevealTask: Task<Void, Never>?
	private var unlockRevealTask: Task<Void, Never>?
	/// Chapter under the thumb during a scrub — a haptic tick fires when it
	/// changes (crossing a chapter mark).
	private var lastScrubChapterIndex: Int?
	private lazy var selectionGenerator = UISelectionFeedbackGenerator()
	private var displayLink: CADisplayLink?
	private var lastTickTimestamp: CFTimeInterval = 0
	/// User canceled the countdown — stays canceled until the next load().
	private var countdownCanceled = false
	/// An episode-change request was already emitted for this item (countdown
	/// fire or explicit tap/selection) — without this latch the arm condition
	/// re-triggers on the next progress tick (JS is still negotiating the next
	/// stream) and a second onNextEpisodeRequested fires mid-swap.
	private var countdownFired = false
	/// Set on every user/remote seek; the next progress tick reports
	/// didSeek=true so the JS coordinator sends an immediate progress report.
	private var pendingSeekReport = false
	/// Item the current config belongs to — gates the countdownCanceled reset.
	private var currentItemId: String?
	private var isTearingDown = false
	/// Scrubbing pauses playback; resume on release only if it was playing.
	private var wasPlayingBeforeScrub = false
	private lazy var impactGenerator = UIImpactFeedbackGenerator(style: .light)

	private let autoHideDelay: TimeInterval = 4
	/// Menus render as UIMenu whose open state SwiftUI cannot observe, so
	/// opening one grants a longer auto-hide grace period instead. Hiding
	/// unmounts the bar, which grays out an open menu — so err long.
	private let menuAutoHideDelay: TimeInterval = 15
	/// More than this far into a chapter, "previous chapter" restarts it.
	private let chapterRestartThreshold: Double = 3

	static let subtitleScalePresets: [Double] = [0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0]
	/// Sync offsets in seconds; positive delays the track. Presets rather
	/// than a stepper so both fit the existing UIMenu-based UI.
	static let syncOffsetPresets: [Double] = [-5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5]
	static let volumeBoostPresets: [Int] = [100, 125, 150, 200]

	override init() {
		super.init()
		volumeController.onExternalChange = { [weak self] in
			self?.revealVolumeSliderTransiently()
		}
	}

	/// Light impact on control interactions; disabled via settings
	/// (disableHapticFeedback → ui.hapticsEnabled=false).
	func haptic() {
		guard hapticsEnabled else { return }
		impactGenerator.impactOccurred()
	}

	// MARK: - Config application

	func apply(config: PlayerPresentConfigRecord) {
		// The sticky countdown cancel survives same-item swaps (track/bitrate
		// re-negotiation goes through load() too) and resets only when the
		// played item actually changes.
		let newItemId = config.metadata?.itemId
		if newItemId == nil || newItemId != currentItemId {
			countdownCanceled = false
			countdownFired = false
			// Sync offsets and gain are per-item compensations — a same-item
			// swap (track/bitrate renegotiation) keeps them, a new item
			// starts neutral.
			subtitleDelay = 0
			audioDelay = 0
			volumeBoostPercent = 100
		}
		currentItemId = newItemId
		metadata = config.metadata
		chapters = config.chapters.sorted { $0.startSec < $1.startSec }
		segments = config.segments
		nextEpisode = config.nextEpisode
		episodeList = config.episodeList
		subtitleMenu = config.tracks?.subtitles ?? []
		audioMenu = config.tracks?.audio ?? []
		qualityMenu = config.tracks?.quality ?? []
		trickplay = config.trickplay.map { TrickplayProvider(config: $0) }
		playMethod = config.stream.playMethod
		transcodeReasons = config.stream.transcodeReasons
		videoWidth = config.stream.videoWidth
		videoHeight = config.stream.videoHeight
		// Skip times are persisted settings that arrive unvalidated; a
		// non-finite value would trap in seekSymbol's Int() and poison
		// seek targets.
		seekForwardSec = config.ui.seekForwardSec.isFinite ? max(1, config.ui.seekForwardSec) : 10
		seekBackwardSec = config.ui.seekBackwardSec.isFinite ? max(1, config.ui.seekBackwardSec) : 10
		hapticsEnabled = config.ui.hapticsEnabled
		showVolumeSlider = config.ui.showVolumeSlider
		showBrightnessSlider = config.ui.showBrightnessSlider
		subtitleScale = config.subtitleStyle?.scale ?? 1.0
		uiStrings = config.ui.strings
		position = config.stream.startPositionSec ?? 0
		displayPosition = position
		showControls()
	}

	/// Reset transient state before an in-place stream swap (re-negotiation
	/// or episode change) — the view controller stays presented.
	func prepareForReload() {
		isBuffering = true
		isReadyToSeek = false
		isScrubbing = false
		scrubPosition = 0
		duration = 0
		cacheSeconds = 0
		activeSegment = nil
		cancelCountdownTask()
		countdownRemaining = nil
		showStillWatching = false
		showEpisodeList = false
		errorMessage = nil
	}

	// MARK: - Late-arriving data pushes (from JS)

	func updateSegments(_ newSegments: [MediaSegmentRecord]) {
		segments = newSegments
	}

	func updateNextEpisode(_ next: NextEpisodeRecord?) {
		nextEpisode = next
	}

	func updateChapters(_ newChapters: [ChapterRecord]) {
		chapters = newChapters.sorted { $0.startSec < $1.startSec }
	}

	func updateTrickplay(_ config: TrickplayRecord?) {
		trickplay = config.map { TrickplayProvider(config: $0) }
	}

	func updateTrackMenus(_ menus: TrackMenusRecord) {
		subtitleMenu = menus.subtitles
		audioMenu = menus.audio
		qualityMenu = menus.quality
	}

	func updateMetadata(_ newMetadata: MetadataRecord) {
		metadata = newMetadata
	}

	func updateEpisodeList(_ episodes: [EpisodeListItemRecord]) {
		episodeList = episodes
	}

	// MARK: - User intents

	func toggleControls() {
		if controlsLocked {
			// Locked chrome swallows taps; they only toggle the unlock pill.
			if unlockButtonRevealed {
				unlockRevealTask?.cancel()
				unlockButtonRevealed = false
			} else {
				revealUnlockButton()
			}
			return
		}
		if controlsVisible {
			controlsVisible = false
			autoHideTask?.cancel()
		} else {
			showControls()
		}
	}

	func showControls() {
		controlsVisible = true
		scheduleAutoHide()
	}

	/// Every control interaction calls this to keep the overlay up.
	func scheduleAutoHide(delay: TimeInterval? = nil) {
		autoHideTask?.cancel()
		let effectiveDelay = delay ?? autoHideDelay
		autoHideTask = Task { [weak self] in
			try? await Task.sleep(nanoseconds: UInt64(effectiveDelay * 1_000_000_000))
			guard !Task.isCancelled, let self else { return }
			await MainActor.run {
				if self.canAutoHide {
					self.controlsVisible = false
				} else {
					// Re-check once conditions may have changed.
					self.scheduleAutoHide()
				}
			}
		}
	}

	private var canAutoHide: Bool {
		isPlaying && !isScrubbing && !isBuffering && !showEpisodeList && !showTechnicalInfo && errorMessage == nil
	}

	func menuInteractionStarted() {
		scheduleAutoHide(delay: menuAutoHideDelay)
	}

	func togglePlayPause() {
		guard let engine else { return }
		haptic()
		if engine.isPaused() {
			engine.play()
		} else {
			engine.pause()
		}
		scheduleAutoHide()
	}

	func seek(to target: Double) {
		let clamped = max(0, duration > 0 ? min(target, duration) : target)
		pendingSeekReport = true
		position = clamped
		displayPosition = clamped
		engine?.seekTo(position: clamped)
		scheduleAutoHide()
	}

	func seekForward() {
		haptic()
		seek(to: displayPosition + seekForwardSec)
	}

	func seekBackward() {
		haptic()
		seek(to: displayPosition - seekBackwardSec)
	}

	// MARK: Scrubbing

	func beginScrub() {
		isScrubbing = true
		scrubPosition = displayPosition
		lastScrubChapterIndex = chapters.isEmpty ? nil : chapterIndex(at: scrubPosition)
		// Pause while scrubbing; endScrub resumes only if it was playing
		// (mirror of the JS player's useVideoSlider).
		wasPlayingBeforeScrub = isPlaying
		if wasPlayingBeforeScrub {
			engine?.pause()
		}
		autoHideTask?.cancel()
	}

	func updateScrub(fraction: Double) {
		// min/max propagate NaN, so a non-finite fraction would reach
		// scrubPosition and SwiftUI frame math unclamped.
		guard duration > 0, fraction.isFinite else { return }
		scrubPosition = min(max(fraction, 0), 1) * duration
		// Haptic tick when the thumb crosses a chapter mark.
		if hapticsEnabled, !chapters.isEmpty {
			let index = chapterIndex(at: scrubPosition)
			if index != lastScrubChapterIndex {
				lastScrubChapterIndex = index
				selectionGenerator.selectionChanged()
			}
		}
	}

	func endScrub() {
		let target = scrubPosition
		isScrubbing = false
		seek(to: target)
		if wasPlayingBeforeScrub {
			wasPlayingBeforeScrub = false
			engine?.play()
		}
	}

	// MARK: - Sync offsets, volume boost, rotation

	func setSubtitleDelay(_ seconds: Double) {
		subtitleDelay = seconds
		engine?.setSubtitleDelay(seconds)
		scheduleAutoHide()
	}

	func setAudioDelay(_ seconds: Double) {
		audioDelay = seconds
		engine?.setAudioDelay(seconds)
		scheduleAutoHide()
	}

	func setVolumeBoost(_ percent: Int) {
		volumeBoostPercent = percent
		engine?.setVolumeBoost(percent)
		scheduleAutoHide()
	}

	func requestRotate() {
		haptic()
		onRotateRequested?()
		scheduleAutoHide()
	}

	// MARK: - Still watching?

	/// Advance to the next episode. Emitted as a user tap so the JS
	/// coordinator resets the autoplay chain counter before advancing.
	func continueWatchingTapped() {
		haptic()
		showStillWatching = false
		emit?("onNextEpisodeRequested", [
			"reason": "userTap",
			"positionSec": displayPosition,
		])
	}

	func stillWatchingCloseTapped() {
		haptic()
		showStillWatching = false
		onDismissRequested?(.playbackEnded)
	}

	// MARK: - Lock mode

	func lockControls() {
		haptic()
		controlsLocked = true
		controlsVisible = false
		autoHideTask?.cancel()
		// Brief confirmation so the lock doesn't look like a plain hide.
		revealUnlockButton()
	}

	func unlockControls() {
		haptic()
		unlockRevealTask?.cancel()
		unlockButtonRevealed = false
		controlsLocked = false
		showControls()
	}

	private func revealUnlockButton() {
		unlockButtonRevealed = true
		unlockRevealTask?.cancel()
		unlockRevealTask = Task { [weak self] in
			try? await Task.sleep(nanoseconds: 2_500_000_000)
			guard !Task.isCancelled, let self else { return }
			await MainActor.run { self.unlockButtonRevealed = false }
		}
	}

	// MARK: Chapters

	/// Index of the chapter containing `position` (largest startSec <= it).
	func chapterIndex(at position: Double) -> Int {
		var index = -1
		for (i, chapter) in chapters.enumerated() {
			if chapter.startSec <= position {
				index = i
			} else {
				break
			}
		}
		return index
	}

	func chapterName(at position: Double) -> String? {
		let idx = chapterIndex(at: position)
		guard idx >= 0, idx < chapters.count else { return nil }
		let name = chapters[idx].name
		return (name?.isEmpty == false) ? name : nil
	}

	var currentChapterIndex: Int { chapterIndex(at: displayPosition) }

	var currentChapterName: String? { chapterName(at: displayPosition) }

	var hasPreviousChapter: Bool { !chapters.isEmpty && currentChapterIndex >= 0 }

	var hasNextChapter: Bool {
		!chapters.isEmpty && currentChapterIndex < chapters.count - 1
	}

	func goToNextChapter() {
		let idx = currentChapterIndex
		guard idx < chapters.count - 1 else { return }
		haptic()
		seek(to: chapters[idx + 1].startSec)
	}

	/// More than 3s into the current chapter restarts it; otherwise jumps to
	/// the previous one (mirror of useChapterNavigation.ts).
	func goToPreviousChapter() {
		let idx = currentChapterIndex
		guard idx >= 0 else { return }
		haptic()
		let chapterStart = chapters[idx].startSec
		if displayPosition - chapterStart > chapterRestartThreshold {
			seek(to: chapterStart)
		} else if idx > 0 {
			seek(to: chapters[idx - 1].startSec)
		} else {
			seek(to: chapterStart)
		}
	}

	// MARK: Zoom to fill

	func toggleZoomToFill() {
		haptic()
		isZoomedToFill.toggle()
		applyZoomState()
		scheduleAutoHide()
	}

	/// Applies the zoom mode + burned-in-subtitle position compensation to the
	/// engine (mirror of direct-player.tsx handleZoomToggle). Also called after
	/// an in-place stream swap so a persisted zoom compensates for the NEW
	/// video's aspect ratio.
	func applyZoomState() {
		guard let engine else { return }
		engine.setZoomedToFill(isZoomedToFill)
		guard isZoomedToFill else {
			engine.setSubtitlePosition(100)
			return
		}
		let videoAR = Double(videoWidth ?? 1920) / Double(max(videoHeight ?? 1080, 1))
		let layerSize = engine.displayLayer.bounds.size
		let screenSize = (layerSize.width > 0 && layerSize.height > 0)
			? layerSize
			: UIScreen.main.bounds.size
		let screenAR = Double(screenSize.width) / Double(max(screenSize.height, 1))
		if screenAR > videoAR {
			// Screen wider than video: filling crops top/bottom. Raise the
			// subtitles by 70% of the bottom crop so they stay visible (the
			// remaining 30% keeps a comfortable margin from the edge).
			let bottomCropPercent = 50.0 * (1.0 - videoAR / screenAR)
			engine.setSubtitlePosition(Int((100.0 - bottomCropPercent * 0.7).rounded()))
		} else {
			// Sides are cropped but the bottom stays visible — no adjustment.
			engine.setSubtitlePosition(100)
		}
	}

	// MARK: Volume slider reveal

	/// Hardware volume press (or a drag on the transiently revealed pill)
	/// while the chrome is hidden: show just the volume slider for a second.
	/// The system HUD is suppressed by the hidden MPVolumeView, so without
	/// this the press would have no visible feedback.
	func revealVolumeSliderTransiently() {
		guard showVolumeSlider, !controlsVisible, !isTearingDown else { return }
		volumeSliderRevealed = true
		volumeRevealTask?.cancel()
		volumeRevealTask = Task { [weak self] in
			try? await Task.sleep(nanoseconds: 1_000_000_000)
			guard !Task.isCancelled, let self else { return }
			await MainActor.run { self.volumeSliderRevealed = false }
		}
	}

	/// Same as the volume reveal, for the brightness gesture: the vertical
	/// drag needs its pill as feedback while the chrome is hidden.
	func revealBrightnessSliderTransiently() {
		guard showBrightnessSlider, !controlsVisible, !isTearingDown else { return }
		brightnessSliderRevealed = true
		brightnessRevealTask?.cancel()
		brightnessRevealTask = Task { [weak self] in
			try? await Task.sleep(nanoseconds: 1_000_000_000)
			guard !Task.isCancelled, let self else { return }
			await MainActor.run { self.brightnessSliderRevealed = false }
		}
	}

	// MARK: Tracks / speed

	func selectSubtitle(_ item: TrackMenuItemRecord) {
		// Selection semantics live in JS (identity resolution / stream
		// re-negotiation). Optimistically checkmark only items that do not
		// force a reload; JS pushes updateTrackMenus with the truth after
		// applying either way.
		if !item.requiresReload {
			setSelected(index: item.jellyfinIndex, in: &subtitleMenu)
		}
		emit?("onTrackSelectionRequested", [
			"kind": "subtitle",
			"jellyfinIndex": item.jellyfinIndex,
			"positionSec": displayPosition,
		])
		scheduleAutoHide()
	}

	func selectAudio(_ item: TrackMenuItemRecord) {
		if !item.requiresReload {
			setSelected(index: item.jellyfinIndex, in: &audioMenu)
		}
		emit?("onTrackSelectionRequested", [
			"kind": "audio",
			"jellyfinIndex": item.jellyfinIndex,
			"positionSec": displayPosition,
		])
		scheduleAutoHide()
	}

	private func setSelected(index: Int, in menu: inout [TrackMenuItemRecord]) {
		// Expo's @Field wrapper is a class, so mutating `selected` changes a
		// shared box without changing the struct — @Published can't see it.
		// Announce the change manually; JS pushes authoritative menus right
		// after anyway (updateTrackMenus).
		objectWillChange.send()
		for i in menu.indices {
			menu[i].selected = menu[i].jellyfinIndex == index
		}
	}

	func setSpeed(_ newSpeed: Double) {
		speed = newSpeed
		engine?.setSpeed(speed: newSpeed)
		emit?("onSpeedChange", ["speed": newSpeed])
		scheduleAutoHide()
	}

	/// Bitrate change always re-negotiates the stream in JS — no optimistic
	/// checkmark; the fresh config carries the new selection.
	func selectQuality(_ item: TrackMenuItemRecord) {
		emit?("onQualitySelected", [
			"bitrateValue": item.jellyfinIndex,
			"positionSec": displayPosition,
		])
		scheduleAutoHide()
	}

	/// Applies live on the engine and notifies JS, which persists the global
	/// mpvSubtitleScale setting (mirror of the JS in-player subtitle scale).
	func setSubtitleScale(_ scale: Double) {
		subtitleScale = scale
		engine?.setSubtitleScale(scale)
		emit?("onSubtitleScaleChange", ["scale": scale])
		scheduleAutoHide()
	}

	// MARK: Segments / episodes

	func skipActiveSegment() {
		guard let segment = activeSegment else { return }
		haptic()
		if segment.type == "Outro" {
			cancelCountdown()
		}
		seek(to: segment.endSec)
	}

	func playNextEpisode() {
		disarmCountdownForEpisodeChange()
		emit?("onNextEpisodeRequested", [
			"reason": "userTap",
			"positionSec": displayPosition,
		])
	}

	func playPreviousEpisode() {
		disarmCountdownForEpisodeChange()
		emit?("onPreviousEpisodeRequested", [
			"positionSec": displayPosition,
		])
	}

	/// Sticky until the next load() — the countdown must not re-arm while
	/// the user keeps watching the credits they explicitly chose to watch.
	func cancelCountdown() {
		countdownCanceled = true
		cancelCountdownTask()
		countdownRemaining = nil
	}

	func selectEpisode(_ episode: EpisodeListItemRecord) {
		showEpisodeList = false
		guard !episode.isCurrent else { return }
		disarmCountdownForEpisodeChange()
		emit?("onEpisodeSelected", [
			"itemId": episode.itemId,
			"positionSec": displayPosition,
		])
	}

	// MARK: PiP / close

	func togglePictureInPicture() {
		guard let engine else { return }
		if engine.isPictureInPictureActive() {
			engine.stopPictureInPicture()
		} else {
			engine.startPictureInPicture()
		}
		scheduleAutoHide()
	}

	func close() {
		haptic()
		onDismissRequested?(.closeButton)
	}

	func dismissError() {
		onDismissRequested?(.error)
	}

	// MARK: - Teardown

	func willTeardown() {
		isTearingDown = true
		autoHideTask?.cancel()
		cancelCountdownTask()
		volumeRevealTask?.cancel()
		brightnessRevealTask?.cancel()
		unlockRevealTask?.cancel()
		stopDisplayLink()
	}

	// MARK: - Countdown

	private func startCountdown(seconds: Double) {
		guard countdownTask == nil else { return }
		// Deliberately does NOT reveal the chrome — the card renders outside
		// the controlsVisible layer, so it shows on its own over clean video.
		countdownRemaining = seconds
		countdownTask = Task { [weak self] in
			while !Task.isCancelled {
				try? await Task.sleep(nanoseconds: 1_000_000_000)
				guard !Task.isCancelled, let self else { return }
				let done: Bool = await MainActor.run {
					guard let remaining = self.countdownRemaining else { return true }
					let next = remaining - 1
					if next <= 0 {
						self.countdownRemaining = nil
						// Clear the handle so a completed countdown doesn't
						// block startCountdown's already-running guard forever.
						self.countdownTask = nil
						self.countdownFired = true
						self.emit?("onNextEpisodeRequested", [
							"reason": "countdown",
							"positionSec": self.displayPosition,
						])
						return true
					}
					self.countdownRemaining = next
					return false
				}
				if done { break }
			}
		}
	}

	private func cancelCountdownTask() {
		countdownTask?.cancel()
		countdownTask = nil
	}

	/// An episode change was explicitly requested — stop any running countdown
	/// and keep the auto-advance disarmed until the next item's config applies,
	/// so a countdown firing mid-swap can't override the user's choice.
	private func disarmCountdownForEpisodeChange() {
		countdownFired = true
		cancelCountdownTask()
		countdownRemaining = nil
	}

	// MARK: - Segment tracking

	private func updateActiveSegment(for currentPosition: Double) {
		let active = segments.first { currentPosition >= $0.startSec && currentPosition < $0.endSec }

		if active?.type != activeSegment?.type || active?.startSec != activeSegment?.startSec {
			activeSegment = active
		}

		// Only credits that run to (within 5s of) the video end auto-arm the
		// countdown — auto-advancing out of credits with a mid/post-credits
		// scene after them would skip content (JS parity: useCreditSkipper's
		// hasContentAfterCredits gate). The Skip Credits pill stays available
		// in that case instead.
		var inFinalCredits = false
		if let active, active.type == "Outro", duration > 0 {
			inFinalCredits = duration - active.endSec <= 5
		}
		// Items without credits markers still get the countdown near the end
		// (JS parity: remainingTime < countdown length arms it too).
		var nearEnd = false
		if let next = nextEpisode, next.countdownSeconds > 0, duration > 0 {
			nearEnd = currentPosition > 0 && duration - currentPosition <= next.countdownSeconds
		}

		if inFinalCredits || nearEnd,
		   let next = nextEpisode, next.countdownSeconds > 0,
		   !countdownCanceled, !countdownFired,
		   countdownRemaining == nil, countdownTask == nil {
			// Never count longer than the video has left: the nearEnd case
			// arms with <= countdownSeconds of video remaining and EOF
			// advances the episode regardless, so an uncapped timer would
			// visibly lag the actual switch. In-credits arming keeps the full
			// configured countdown (the advance intentionally cuts credits
			// short there).
			let remaining = max(1, duration - currentPosition)
			startCountdown(seconds: min(next.countdownSeconds, remaining))
		}

		// Keep a running countdown honest against playback (1Hz quantization,
		// timer drift, speed changes): it must reach 0 no later than the
		// video ends, because EOF is what actually triggers the switch.
		if let counting = countdownRemaining, duration > 0 {
			let remaining = max(0, duration - currentPosition)
			if remaining < counting {
				countdownRemaining = remaining
			}
		}

		// Leaving the countdown window (e.g. the user seeked back) tears the
		// card down; a user cancel stays sticky via countdownCanceled.
		if !inFinalCredits, !nearEnd, countdownRemaining != nil {
			cancelCountdownTask()
			countdownRemaining = nil
		}
	}

	// MARK: - Display-position interpolation

	private func updateDisplayLinkState() {
		if isPlaying && !isTearingDown {
			startDisplayLink()
		} else {
			stopDisplayLink()
		}
	}

	private func startDisplayLink() {
		guard displayLink == nil else { return }
		let link = CADisplayLink(target: self, selector: #selector(displayLinkTick))
		link.preferredFrameRateRange = CAFrameRateRange(minimum: 10, maximum: 30, preferred: 30)
		link.add(to: .main, forMode: .common)
		displayLink = link
		lastTickTimestamp = CACurrentMediaTime()
	}

	private func stopDisplayLink() {
		displayLink?.invalidate()
		displayLink = nil
	}

	@objc private func displayLinkTick() {
		guard isPlaying, !isScrubbing else { return }
		let now = CACurrentMediaTime()
		let elapsed = now - lastTickTimestamp
		lastTickTimestamp = now
		var next = displayPosition + elapsed * speed
		if duration > 0 {
			next = min(next, duration)
		}
		displayPosition = next
	}
}

// MARK: - MPVPlayerEngineDelegate

extension PlayerViewModel: MPVPlayerEngineDelegate {
	func engine(_ engine: MPVPlayerEngine, didLoad url: URL) {
		emit?("onLoad", ["url": url.absoluteString])
	}

	func engine(_ engine: MPVPlayerEngine, didUpdateProgress position: Double, duration: Double, cacheSeconds: Double) {
		guard !isTearingDown else { return }
		self.position = position
		// This callback is 1Hz and duration is @Published — only assign on a
		// real change, or every observer re-renders once per second (which
		// grays out any open menu, see PlaybackTimeModel).
		if self.duration != duration {
			self.duration = duration
		}
		self.cacheSeconds = cacheSeconds
		if !isScrubbing {
			// Snap the interpolated position on every authoritative tick.
			displayPosition = position
			lastTickTimestamp = CACurrentMediaTime()
		}
		updateActiveSegment(for: position)

		var payload: [String: Any] = [
			"position": position,
			"duration": duration,
			"progress": duration > 0 ? position / duration : 0,
			"cacheSeconds": cacheSeconds,
		]
		if pendingSeekReport {
			pendingSeekReport = false
			payload["didSeek"] = true
		}
		emit?("onProgress", payload)
	}

	func engine(_ engine: MPVPlayerEngine, didChangePause isPaused: Bool) {
		guard !isTearingDown else { return }
		isPlaying = !isPaused
		updateDisplayLinkState()
		if isPaused {
			// Paused: keep the controls up.
			showControls()
			autoHideTask?.cancel()
		} else {
			scheduleAutoHide()
		}
		emit?("onPlaybackStateChange", [
			"isPaused": isPaused,
			"isPlaying": !isPaused,
		])
	}

	func engine(_ engine: MPVPlayerEngine, didChangeLoading isLoading: Bool) {
		guard !isTearingDown else { return }
		isBuffering = isLoading
		emit?("onPlaybackStateChange", ["isLoading": isLoading])
	}

	func engine(_ engine: MPVPlayerEngine, didBecomeReadyToSeek ready: Bool) {
		guard !isTearingDown else { return }
		isReadyToSeek = ready
		emit?("onPlaybackStateChange", ["isReadyToSeek": ready])
	}

	func engine(_ engine: MPVPlayerEngine, didBecomeTracksReady ready: Bool) {
		guard !isTearingDown else { return }
		emit?("onTracksReady", [:])
	}

	func engine(_ engine: MPVPlayerEngine, didChangePictureInPicture isActive: Bool) {
		guard !isTearingDown else { return }
		isPipActive = isActive
		emit?("onPictureInPictureChange", ["isActive": isActive])
	}

	func engine(_ engine: MPVPlayerEngine, didFailWithError message: String) {
		guard !isTearingDown else { return }
		errorMessage = message
		showControls()
		autoHideTask?.cancel()
		emit?("onError", ["error": message])
	}

	func engine(_ engine: MPVPlayerEngine, didDetectHDRMode mode: HDRMode, fps: Double) {
		// tvOS-only concern (AVDisplayCriteria); nothing to do on iOS.
	}

	func engineDidReachEnd(_ engine: MPVPlayerEngine) {
		guard !isTearingDown else { return }
		// A canceled countdown is a deliberate "let me watch to the end" —
		// EOF must not auto-advance past it.
		if let next = nextEpisode, next.countdownSeconds > 0, !countdownCanceled {
			cancelCountdownTask()
			countdownRemaining = nil
			emit?("onNextEpisodeRequested", [
				"reason": "countdown",
				"positionSec": displayPosition,
			])
		} else if nextEpisode?.stillWatchingRequired == true {
			// Autoplay episode cap reached: ask instead of advancing. The
			// video sits on its last frame under the card.
			showStillWatching = true
		} else {
			emit?("onPlaybackEnded", ["positionSec": displayPosition])
			onDismissRequested?(.playbackEnded)
		}
	}
}
#endif
