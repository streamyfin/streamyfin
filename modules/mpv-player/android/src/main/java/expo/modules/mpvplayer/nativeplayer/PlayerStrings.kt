package expo.modules.mpvplayer.nativeplayer

class PlayerStrings(private val strings: Map<String, String>) {

    companion object {
        private val DEFAULTS = mapOf(
            "skipIntro" to "Skip Intro",
            "skipCredits" to "Skip Credits",
            "nextEpisode" to "Next Episode",
            "playNow" to "Play Now",
            "cancel" to "Cancel",
            "episodes" to "Episodes",
            "speed" to "Speed",
            "audio" to "Audio",
            "subtitles" to "Subtitles",
            "chapters" to "Chapters",
            "technicalInfo" to "Technical Info",
            "playbackError" to "Playback Error",
            "close" to "Close",
            "off" to "Off",
            "quality" to "Quality",
            "subtitleSize" to "Subtitle Size",
            "subtitleSync" to "Subtitle Sync",
            "audioSync" to "Audio Sync",
            "volumeBoost" to "Volume Boost",
            "dialogueBoost" to "Dialogue Boost",
            "monoAudio" to "Mono Audio",
            "rotate" to "Rotate",
            "lockControls" to "Lock Controls",
            "unlock" to "Unlock",
            "stillWatching" to "Are you still watching?",
            "continueWatching" to "Continue Watching",
            "goBack" to "Go Back",
            "endsAt" to "Ends at %TIME%",
            "zoomToFill" to "Zoom to Fill",
            "stop" to "Stop",
            "stopPlayback" to "Stop Playback",
            "stopPlayingTitle" to "Stop playing %TITLE%?",
            "stopPlayingConfirm" to "Stop Playing",
            "sleepTimer" to "Sleep Timer",
            "sleepTimerOff" to "Turn Off",
            "searchSubtitles" to "Search Subtitles",
            "searchFailed" to "Search failed",
            "noSubtitlesFound" to "No subtitles found"
        )
    }

    fun get(key: String, fallback: String? = null): String {
        val value = strings[key]
        if (!value.isNullOrBlank()) return value
        if (!fallback.isNullOrBlank()) return fallback
        return DEFAULTS[key] ?: key
    }

    fun formatEndsAt(timeFormatted: String): String {
        val template = get("endsAt", "Ends at %TIME%")
        return template.replace("%TIME%", timeFormatted)
    }

    fun formatStopPlayingTitle(title: String): String {
        val template = get("stopPlayingTitle", "Stop playing %TITLE%?")
        return template.replace("%TITLE%", title)
    }
}
