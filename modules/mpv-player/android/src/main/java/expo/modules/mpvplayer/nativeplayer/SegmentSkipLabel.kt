package expo.modules.mpvplayer.nativeplayer

/**
 * The pill label for a segment type, shared by the phone pills and both TV
 * surfaces. One function so a segment type added later cannot keep the
 * Intro-or-credits branch in one place and miss another — Recap, Commercial
 * and Preview used to read "Skip Credits" on TV.
 */
// The English fallbacks live in PlayerStrings.DEFAULTS, once.
internal fun segmentSkipLabel(type: String, strings: PlayerStrings): String = when (type) {
    "Outro" -> strings.get("skipCredits")
    "Recap" -> strings.get("skipRecap")
    "Commercial" -> strings.get("skipCommercial")
    "Preview" -> strings.get("skipPreview")
    else -> strings.get("skipIntro")
}
