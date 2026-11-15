#if DEBUG && os(iOS) && !targetEnvironment(macCatalyst)
import Foundation
import UIKit

/// The device proof of the remote screen, in debug builds only: `-RemotePlayerProbe YES` at launch arms it,
/// and each `expo.modules.mpvplayer.REMOTE_PLAYER_PROBE` Darwin notification then opens the remote chrome over
/// a fake TV of its own, with a fixed config, whatever the build's fake receivers flag says. On a simulator:
/// `xcrun simctl spawn <udid> notifyutil -p expo.modules.mpvplayer.REMOTE_PLAYER_PROBE`. It is not presented
/// at launch: the dev client swaps the window's root once the bundle loads, which would take the screen with
/// it. It goes around the module, so a presentPlayer from JS while it is up is not refused. Its lines go
/// through Logger under [RemotePlayerProbe], in `tmp/logs.txt` of the app's container: the commands with the
/// fake's position, the position every few seconds, the close, and the fake's stop, which only the lease's
/// release may call. `-RemotePlayerProbeEnd YES` as well gives the fake one short item and a next episode at
/// the still watching cap: the end of the TV's list, a few seconds in. `-RemotePlayerProbeArtwork <url>`,
/// `-RemotePlayerProbeTint '#top,#bottom,#accent'`, `-RemotePlayerProbeHeaderName <name>` and
/// `-RemotePlayerProbeHeaderValue <value>` add an artwork, its tint and an image header, as Android's extras do.
enum RemotePlayerProbe {
	static let launchArgument = "RemotePlayerProbe"
	static let notification = "expo.modules.mpvplayer.REMOTE_PLAYER_PROBE"
	static let title = "Bench episode"
	static let target = "Bench TV"
	static let positionLogMs: Double = 5_000
	static let endArgument = "RemotePlayerProbeEnd"
	static let endItemSec: Double = 15
	/// What the launch may add to the fixed config, to hold the screen to an artwork (Android's Look): its URL,
	/// the tint JS would send for it (`#top,#bottom,#accent`), and one header the images are asked for with.
	static let artworkArgument = "RemotePlayerProbeArtwork"
	static let tintArgument = "RemotePlayerProbeTint"
	static let headerNameArgument = "RemotePlayerProbeHeaderName"
	static let headerValueArgument = "RemotePlayerProbeHeaderValue"

	private static var current: RemotePlayerSession?
	private static var cancelPositionLog: (() -> Void)?
	private static let log: (String) -> Void = { Logger.shared.log($0, type: "RemotePlayerProbe") }

	static func arm() {
		CFNotificationCenterAddObserver(
			CFNotificationCenterGetDarwinNotifyCenter(), nil,
			{ _, _, _, _, _ in DispatchQueue.main.async { RemotePlayerProbe.run() } },
			notification as CFString, nil, .deliverImmediately
		)
		log("armed")
	}

	/// One screen at a time: a notification while one is up does nothing.
	static func run() {
		if current != nil { return log("already presented") }
		let ending = UserDefaults.standard.bool(forKey: endArgument)
		let fake = FakeRemoteEngine(
			deliver: mainQueueSchedule,
			items: ending ? [FakeRemoteItem(id: "fake-short", durationSec: endItemSec)] : FakeRemoteEngine.defaultItems
		)
		let engine = LoggingRemoteEngine(inner: fake, log: log)
		let lease = RemoteEngineLease(engine: engine) {
			log("lease released")
			engine.shutdown()
		}
		let session = RemotePlayerSession(
			lease: lease,
			emit: { name, body in
				if name == "onDismiss" { log("dismissed: \(body["reason"] ?? "-")") }
			},
			onTornDown: {
				cancelPositionLog?()
				cancelPositionLog = nil
				current = nil
			}
		)
		current = session
		let config = RemotePlayerConfigRecord()
		// Every slot the screen draws from its config is filled, so the proof can hold each layout to the mockups
		// (same config as Android's RemotePlayerProbe.config()). The artwork comes from the bench's server.
		let metadata = MetadataRecord()
		metadata.title = title
		metadata.subtitle = "S1 E1, Bench"
		let defaults = UserDefaults.standard
		metadata.artworkUri = defaults.string(forKey: artworkArgument)
		config.metadata = metadata
		if let parts = defaults.string(forKey: tintArgument)?.split(separator: ","), parts.count == 3 {
			let tint = RemoteTintRecord()
			tint.top = String(parts[0])
			tint.bottom = String(parts[1])
			tint.accent = String(parts[2])
			config.tint = tint
		}
		if let name = defaults.string(forKey: headerNameArgument), let value = defaults.string(forKey: headerValueArgument) {
			config.imageHeaders = [name: value]
		}
		config.targetName = target
		config.chapters = [("Opening", 0.0), ("Middle", 40.0), ("Ending", 80.0)].map { name, start in
			let chapter = ChapterRecord()
			chapter.name = name
			chapter.startSec = start
			return chapter
		}
		let tracks = TrackMenusRecord()
		tracks.audio = [track("English", 1, selected: true), track("French", 2, selected: false)]
		tracks.subtitles = [track("English", 3, selected: true), track("French", 4, selected: false)]
		config.tracks = tracks
		config.episodeList = (1...3).map { n in
			let episode = EpisodeListItemRecord()
			episode.itemId = "bench-\(n)"
			episode.title = "Bench episode \(n)"
			episode.indexNumber = n
			episode.isCurrent = n == 1
			return episode
		}
		if ending {
			var next = NextEpisodeRecord()
			next.itemId = "bench-next"
			next.title = "Bench next"
			next.stillWatchingRequired = true
			config.nextEpisode = next
			log("ending: one \(endItemSec) s item, next episode at the still watching cap")
		}
		do {
			try session.present(config: config) { log("presented: \(title) on \(target)") }
		} catch {
			session.teardownImmediately()
			current = nil
			return log("failed: \(error.localizedDescription)")
		}
		logPosition(engine)
	}

	private static func logPosition(_ engine: ChromeEngine) {
		cancelPositionLog = mainQueueSchedule(positionLogMs) {
			log("position \(engine.getCurrentPosition()), \(engine.isPaused() ? "paused" : "playing")")
			logPosition(engine)
		}
	}

	private static func track(_ label: String, _ index: Int, selected: Bool) -> TrackMenuItemRecord {
		let track = TrackMenuItemRecord()
		track.label = label
		track.jellyfinIndex = index
		track.selected = selected
		return track
	}
}

/// The fake TV with every command the chrome sends logged, and the position each one leaves.
private final class LoggingRemoteEngine: ChromeEngine {
	private let inner: ChromeEngine
	private let log: (String) -> Void

	init(inner: ChromeEngine, log: @escaping (String) -> Void) {
		self.inner = inner
		self.log = log
	}

	var delegate: PlayerEngineDelegate? {
		get { inner.delegate }
		set { inner.delegate = newValue }
	}
	var intendedPlayState: Bool { inner.intendedPlayState }
	var canChangeSpeed: Bool { inner.canChangeSpeed }
	var currentItemId: String? { inner.currentItemId }
	var targetVolume: Double? { inner.targetVolume }

	func start() throws {
		log("engine started")
		try inner.start()
	}

	func shutdown() {
		log("engine stopped")
		inner.shutdown()
	}

	func destroy() {
		log("engine stopped")
		inner.destroy()
	}

	func play() {
		inner.play()
		log("play at \(inner.getCurrentPosition())")
	}

	func pause() {
		inner.pause()
		log("pause at \(inner.getCurrentPosition())")
	}

	func requestPlaying(_ playing: Bool) {
		inner.requestPlaying(playing)
		log("\(playing ? "play" : "pause") at \(inner.getCurrentPosition())")
	}

	func seekTo(position: Double, exact: Bool) { seek("seek to \(position)") { inner.seekTo(position: position, exact: exact) } }
	func seekBy(offset: Double) { seek("seek by \(offset)") { inner.seekBy(offset: offset) } }
	func requestSeek(to position: Double) { seek("seek to \(position)") { inner.requestSeek(to: position) } }
	func requestSeek(by offset: Double) { seek("seek by \(offset)") { inner.requestSeek(by: offset) } }

	private func seek(_ what: String, _ send: () -> Void) {
		let from = inner.getCurrentPosition()
		send()
		log("\(what): \(from) -> \(inner.getCurrentPosition())")
	}

	func loadVideo(config: VideoLoadConfig, force: Bool) { inner.loadVideo(config: config, force: force) }
	func setSpeed(speed: Double) { inner.setSpeed(speed: speed) }
	func setMute(_ muted: Bool) { inner.setMute(muted) }
	func getSpeed() -> Double { inner.getSpeed() }
	func isPaused() -> Bool { inner.isPaused() }
	func getCurrentPosition() -> Double { inner.getCurrentPosition() }
	func getDuration() -> Double { inner.getDuration() }
	func setNowPlayingMetadata(_ metadata: [String: String], artworkHeaders: [String: String]?) {
		inner.setNowPlayingMetadata(metadata, artworkHeaders: artworkHeaders)
	}
	func setSkipIntervals(forward: Double, backward: Double) { inner.setSkipIntervals(forward: forward, backward: backward) }
	func getSubtitleTracks(completion: @escaping ([[String: Any]]) -> Void) { inner.getSubtitleTracks(completion: completion) }
	func setSubtitleTrack(_ trackId: Int) { inner.setSubtitleTrack(trackId) }
	func disableSubtitles() { inner.disableSubtitles() }
	func getCurrentSubtitleTrack(completion: @escaping (Int) -> Void) { inner.getCurrentSubtitleTrack(completion: completion) }
	func addSubtitleFile(url: String, select: Bool) { inner.addSubtitleFile(url: url, select: select) }
	func getAudioTracks(completion: @escaping ([[String: Any]]) -> Void) { inner.getAudioTracks(completion: completion) }
	func setAudioTrack(_ trackId: Int) { inner.setAudioTrack(trackId) }
	func getCurrentAudioTrack(completion: @escaping (Int) -> Void) { inner.getCurrentAudioTrack(completion: completion) }
	func setAudioDelay(_ seconds: Double) { inner.setAudioDelay(seconds) }
	func setVolumeBoost(_ percent: Int) { inner.setVolumeBoost(percent) }
	func setDialogueBoost(_ enabled: Bool) { inner.setDialogueBoost(enabled) }
	func setMonoDownmix(_ enabled: Bool) { inner.setMonoDownmix(enabled) }
	func skipToNext() { inner.skipToNext() }
	func skipToPrevious() { inner.skipToPrevious() }
	func enqueue(itemIds: [String]) { inner.enqueue(itemIds: itemIds) }
	func setTargetVolume(_ level: Double) { inner.setTargetVolume(level) }
}
#endif
