package expo.modules.mpvplayer.nativeplayer

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.mpvplayer.VideoLoadConfig

class CacheConfigRecord : Record {
    @Field var enabled: String? = null        // "auto", "yes", or "no"
    @Field var cacheSeconds: Int? = null
    @Field var maxBytes: Int? = null
    @Field var maxBackBytes: Int? = null
}

class StreamConfigRecord : Record {
    @Field var url: String = ""
    @Field var headers: Map<String, String>? = null
    @Field var externalSubtitles: List<String>? = null
    @Field var startPositionSec: Double? = null
    @Field var autoplay: Boolean = true
    @Field var initialSubtitleMpvId: Int? = null
    @Field var initialAudioMpvId: Int? = null
    @Field var playMethod: String? = null     // "DirectPlay" | "DirectStream" | "Transcode"
    @Field var transcodeReasons: List<String> = emptyList()
    @Field var cacheConfig: CacheConfigRecord? = null
    @Field var videoWidth: Int? = null
    @Field var videoHeight: Int? = null

    fun toVideoLoadConfig(): VideoLoadConfig? {
        if (url.isBlank()) return null
        return VideoLoadConfig(
            url = url,
            headers = headers,
            externalSubtitles = externalSubtitles,
            startPosition = startPositionSec,
            autoplay = autoplay,
            initialSubtitleId = initialSubtitleMpvId,
            initialAudioId = initialAudioMpvId,
            cacheEnabled = cacheConfig?.enabled,
            cacheSeconds = cacheConfig?.cacheSeconds,
            demuxerMaxBytes = cacheConfig?.maxBytes,
            demuxerMaxBackBytes = cacheConfig?.maxBackBytes
        )
    }
}

class MetadataRecord : Record {
    @Field var itemId: String? = null
    @Field var title: String? = null
    @Field var subtitle: String? = null
    @Field var artworkUri: String? = null
    @Field var isEpisode: Boolean = false
}

class ChapterRecord : Record {
    @Field var name: String? = null
    @Field var startSec: Double = 0.0
}

class MediaSegmentRecord : Record {
    // Jellyfin's MediaSegmentType: Intro | Outro | Recap | Commercial | Preview
    @Field var type: String = ""
    @Field var startSec: Double = 0.0
    @Field var endSec: Double = 0.0
    // Resolved on the JS side so this player never reads settings and cannot
    // drift from the others: "ask" shows the pill, "auto" skips on its own.
    // "none" segments are dropped before they are sent.
    @Field var skipMode: String = "ask"
}

class TrickplayRecord : Record {
    @Field var intervalMs: Double = 0.0
    @Field var tileCols: Int = 0
    @Field var tileRows: Int = 0
    @Field var thumbWidth: Double = 0.0
    @Field var thumbHeight: Double = 0.0
    @Field var sheetUrls: List<String> = emptyList()
    @Field var headers: Map<String, String>? = null
}

class NextEpisodeRecord : Record {
    @Field var itemId: String = ""
    @Field var title: String = ""
    @Field var subtitle: String? = null
    @Field var imageUrl: String? = null
    @Field var countdownSeconds: Double = 0.0
    @Field var stillWatchingRequired: Boolean = false
}

class TrackMenuItemRecord : Record {
    @Field var label: String = ""
    @Field var jellyfinIndex: Int = -1
    @Field var selected: Boolean = false
    @Field var requiresReload: Boolean = false
}

class TrackMenusRecord : Record {
    @Field var subtitles: List<TrackMenuItemRecord> = emptyList()
    @Field var audio: List<TrackMenuItemRecord> = emptyList()
    @Field var quality: List<TrackMenuItemRecord> = emptyList()
}

class EpisodeListItemRecord : Record {
    @Field var itemId: String = ""
    @Field var title: String = ""
    @Field var indexNumber: Int? = null
    @Field var imageUrl: String? = null
    @Field var progressPercent: Double = 0.0
    @Field var isCurrent: Boolean = false
}

class SubtitleSearchLanguageRecord : Record {
    @Field var code: String = ""   // ISO 639-2 three-letter code, e.g. "eng"
    @Field var name: String = ""   // Display name from JS i18n
}

class SubtitleSearchResultRecord : Record {
    @Field var id: String = ""
    @Field var name: String = ""
    @Field var providerName: String = ""
    @Field var format: String? = null
    @Field var language: String? = null
    @Field var communityRating: Double? = null
    @Field var downloadCount: Int? = null
    @Field var isHashMatch: Boolean = false
    @Field var hearingImpaired: Boolean = false
    @Field var aiTranslated: Boolean = false
}

class SubtitleSearchStateRecord : Record {
    @Field var status: String = "idle"
    @Field var results: List<SubtitleSearchResultRecord> = emptyList()
    @Field var errorMessage: String? = null
}

class SubtitleStyleRecord : Record {
    @Field var fontSize: Int? = null
    @Field var scale: Double? = null
    @Field var marginY: Int? = null
    @Field var alignX: String? = null
    @Field var alignY: String? = null
    @Field var backgroundColor: String? = null
    @Field var borderStyle: String? = null
    @Field var assOverride: String? = null
}

class UIOptionsRecord : Record {
    @Field var orientationLock: String = "landscape"  // "landscape" | "none"
    @Field var allowPip: Boolean = true
    @Field var seekForwardSec: Double = 10.0
    @Field var seekBackwardSec: Double = 10.0
    @Field var initialPlaybackSpeed: Double = 1.0
    @Field var hapticsEnabled: Boolean = true
    @Field var showVolumeSlider: Boolean = true
    @Field var showBrightnessSlider: Boolean = true
    @Field var holdToSpeedEnabled: Boolean = true
    @Field var holdToSpeedRate: Double = 2.0
    @Field var pinchToZoomEnabled: Boolean = true
    @Field var doubleTapToSeekEnabled: Boolean = false
    @Field var subtitleSearchEnabled: Boolean = false
    @Field var subtitleSearchLanguages: List<SubtitleSearchLanguageRecord> = emptyList()
    @Field var subtitleSearchDefaultLanguage: String = "eng"
    @Field var strings: Map<String, String> = emptyMap()
}

class PlayerPresentConfigRecord : Record {
    @Field var stream: StreamConfigRecord = StreamConfigRecord()
    @Field var metadata: MetadataRecord? = null
    @Field var chapters: List<ChapterRecord> = emptyList()
    @Field var segments: List<MediaSegmentRecord> = emptyList()
    @Field var trickplay: TrickplayRecord? = null
    @Field var nextEpisode: NextEpisodeRecord? = null
    @Field var episodeList: List<EpisodeListItemRecord> = emptyList()
    @Field var tracks: TrackMenusRecord? = null
    @Field var subtitleStyle: SubtitleStyleRecord? = null
    @Field var ui: UIOptionsRecord = UIOptionsRecord()
}
