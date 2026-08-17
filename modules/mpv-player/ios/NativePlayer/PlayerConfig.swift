import ExpoModulesCore
import Foundation

// Config records for the presented native player. The JS coordinator converts
// all Jellyfin ticks to seconds/ms before handing anything down — native code
// never sees ticks. Mirrored by modules/mpv-player/src/NativePlayerPresentation.types.ts.

struct CacheConfigRecord: Record {
	@Field var enabled: String?        // "auto", "yes", or "no"
	@Field var cacheSeconds: Int?
	@Field var maxBytes: Int?
	@Field var maxBackBytes: Int?
}

struct StreamConfigRecord: Record {
	@Field var url: String = ""
	@Field var headers: [String: String]?
	@Field var externalSubtitles: [String]?
	@Field var startPositionSec: Double?
	@Field var autoplay: Bool = true
	/// MPV track ids pre-resolved by JS (1-based; -1 disables subtitles).
	@Field var initialSubtitleMpvId: Int?
	@Field var initialAudioMpvId: Int?
	@Field var playMethod: String?     // "DirectPlay" | "DirectStream" | "Transcode"
	@Field var transcodeReasons: [String] = []
	@Field var cacheConfig: CacheConfigRecord?
	/// Source video dimensions (for zoom-to-fill subtitle compensation).
	@Field var videoWidth: Int?
	@Field var videoHeight: Int?
}

struct MetadataRecord: Record {
	/// Jellyfin item id — identifies whether a load() swap changed the item.
	@Field var itemId: String?
	@Field var title: String?
	/// Second header line, e.g. "Series Name · S2E5".
	@Field var subtitle: String?
	@Field var artworkUri: String?
	/// Custom proxy auth headers for `artworkUri`, when it needs them.
	@Field var artworkHeaders: [String: String]?
	@Field var isEpisode: Bool = false
}

struct ChapterRecord: Record {
	@Field var name: String?
	@Field var startSec: Double = 0
}

struct MediaSegmentRecord: Record {
	@Field var type: String = ""       // "Intro" | "Outro"
	@Field var startSec: Double = 0
	@Field var endSec: Double = 0
}

struct TrickplayRecord: Record {
	@Field var intervalMs: Double = 0  // Jellyfin Interval
	@Field var tileCols: Int = 0       // Jellyfin TileWidth (tiles per row)
	@Field var tileRows: Int = 0       // Jellyfin TileHeight (tiles per column)
	@Field var thumbWidth: Double = 0  // px per thumbnail
	@Field var thumbHeight: Double = 0
	/// Fully-formed per-sheet URLs, index = sheet index. Online these carry the
	/// ApiKey query param; offline they are file:// paths. Built by JS so the
	/// native side needs no URL templating and both cases are uniform.
	@Field var sheetUrls: [String] = []
	@Field var headers: [String: String]?
}

struct NextEpisodeRecord: Record {
	@Field var itemId: String = ""
	@Field var title: String = ""
	@Field var subtitle: String?
	@Field var imageUrl: String?
	/// 0 = no auto-countdown; show the "Next episode" button only.
	@Field var countdownSeconds: Double = 0
	/// The autoplay episode cap is reached: EOF shows the "Still watching?"
	/// card instead of auto-advancing (countdownSeconds is 0 in that case).
	@Field var stillWatchingRequired: Bool = false
}

struct TrackMenuItemRecord: Record {
	@Field var label: String = ""
	@Field var jellyfinIndex: Int = -1
	@Field var selected: Bool = false
	/// Burned-in subtitle / audio-change-under-transcode: selecting this item
	/// forces a stream re-negotiation in JS, so native must not optimistically
	/// checkmark it — the menu updates when JS pushes updateTrackMenus.
	@Field var requiresReload: Bool = false
}

struct TrackMenusRecord: Record {
	/// Includes the "Off" item (jellyfinIndex = -1), labeled by JS i18n.
	@Field var subtitles: [TrackMenuItemRecord] = []
	@Field var audio: [TrackMenuItemRecord] = []
	/// Max-bitrate options (online only; empty offline). jellyfinIndex carries
	/// the bitrate in bps, -1 = "Max". Selecting always re-negotiates in JS.
	@Field var quality: [TrackMenuItemRecord] = []
}

struct EpisodeListItemRecord: Record {
	@Field var itemId: String = ""
	@Field var title: String = ""
	@Field var indexNumber: Int?
	@Field var imageUrl: String?
	/// 0-100; used to render a watched-progress bar under the thumbnail.
	@Field var progressPercent: Double = 0
	@Field var isCurrent: Bool = false
}

struct SubtitleSearchLanguageRecord: Record {
	@Field var code: String = ""   // ISO 639-2 three-letter code, e.g. "eng"
	@Field var name: String = ""   // Display name from JS i18n
}

/// One remote subtitle hit (display model; search/download logic stays in JS).
struct SubtitleSearchResultRecord: Record {
	@Field var id: String = ""
	@Field var name: String = ""
	@Field var providerName: String = ""
	@Field var format: String?
	@Field var language: String?
	@Field var communityRating: Double?
	@Field var downloadCount: Int?
	@Field var isHashMatch: Bool = false
	@Field var hearingImpaired: Bool = false
	@Field var aiTranslated: Bool = false
}

/// Pushed by JS to drive the subtitle-search sheet through its states.
struct SubtitleSearchStateRecord: Record {
	/// "idle" | "searching" | "results" | "error" | "downloading" | "applied"
	@Field var status: String = "idle"
	@Field var results: [SubtitleSearchResultRecord] = []
	@Field var errorMessage: String?
}

struct SubtitleStyleRecord: Record {
	@Field var fontSize: Int?
	@Field var scale: Double?
	@Field var marginY: Int?
	@Field var alignX: String?
	@Field var alignY: String?
	@Field var backgroundColor: String?
	@Field var borderStyle: String?
	@Field var assOverride: String?
}

struct UIOptionsRecord: Record {
	@Field var orientationLock: String = "landscape"  // "landscape" | "none"
	@Field var allowPip: Bool = true
	@Field var seekForwardSec: Double = 10
	@Field var seekBackwardSec: Double = 10
	@Field var initialPlaybackSpeed: Double = 1.0
	@Field var hapticsEnabled: Bool = true
	@Field var showVolumeSlider: Bool = true
	@Field var showBrightnessSlider: Bool = true
	@Field var holdToSpeedEnabled: Bool = true
	@Field var holdToSpeedRate: Double = 2.0
	@Field var pinchToZoomEnabled: Bool = true
	@Field var doubleTapToSeekEnabled: Bool = false
	/// Remote subtitle search (online sessions with an API only).
	@Field var subtitleSearchEnabled: Bool = false
	@Field var subtitleSearchLanguages: [SubtitleSearchLanguageRecord] = []
	@Field var subtitleSearchDefaultLanguage: String = "eng"
	/// Localized UI labels from JS i18n (keys: skipIntro, skipCredits,
	/// nextEpisode, playNow, cancel, episodes, speed, audio, subtitles,
	/// chapters, technicalInfo, playbackError, close, off, quality,
	/// subtitleSize, subtitleSync, audioSync, volumeBoost, rotate,
	/// lockControls, unlock, zoomToFill, stillWatching, continueWatching,
	/// goBack, endsAt, stop, stopPlayback, stopPlayingTitle,
	/// stopPlayingConfirm — endsAt carries a %TIME% placeholder,
	/// stopPlayingTitle a %TITLE% placeholder). Native falls
	/// back to English for missing keys.
	@Field var strings: [String: String] = [:]
}

struct PlayerPresentConfigRecord: Record {
	@Field var stream: StreamConfigRecord = StreamConfigRecord()
	@Field var metadata: MetadataRecord?
	/// Custom proxy auth headers for the thumbnails the player loads itself
	/// (episode list, next episode). Same server as the stream.
	@Field var imageHeaders: [String: String]?
	@Field var chapters: [ChapterRecord] = []
	@Field var segments: [MediaSegmentRecord] = []
	@Field var trickplay: TrickplayRecord?
	@Field var nextEpisode: NextEpisodeRecord?
	@Field var episodeList: [EpisodeListItemRecord] = []
	@Field var tracks: TrackMenusRecord?
	@Field var subtitleStyle: SubtitleStyleRecord?
	@Field var ui: UIOptionsRecord = UIOptionsRecord()
}

extension StreamConfigRecord {
	/// Convert to the engine's load config. Returns nil for an unparseable URL.
	func toVideoLoadConfig() -> VideoLoadConfig? {
		guard let videoURL = URL(string: url) else { return nil }
		return VideoLoadConfig(
			url: videoURL,
			headers: headers,
			externalSubtitles: externalSubtitles,
			startPosition: startPositionSec,
			autoplay: autoplay,
			initialSubtitleId: initialSubtitleMpvId,
			initialAudioId: initialAudioMpvId,
			cacheEnabled: cacheConfig?.enabled,
			cacheSeconds: cacheConfig?.cacheSeconds,
			demuxerMaxBytes: cacheConfig?.maxBytes,
			demuxerMaxBackBytes: cacheConfig?.maxBackBytes
		)
	}
}
