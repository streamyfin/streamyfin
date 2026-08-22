package expo.modules.mpvplayer.nativeplayer

enum class TvFocusZone {
    NONE,
    CHROME,
    MENU,
    SHELF,
    SUBTITLE_SEARCH,
    STILL_WATCHING,
    EXIT_CONFIRM
}

fun deriveTvFocusZone(vm: PlayerViewModel): TvFocusZone {
    if (vm.showExitConfirmation) return TvFocusZone.EXIT_CONFIRM
    if (vm.showStillWatching) return TvFocusZone.STILL_WATCHING
    if (vm.showSubtitleSearch) return TvFocusZone.SUBTITLE_SEARCH
    if (vm.showEpisodeList) return TvFocusZone.SHELF
    if (vm.tvMenuRoute.isNotEmpty()) return TvFocusZone.MENU
    if (vm.controlsVisible && !vm.isScrubbing) return TvFocusZone.CHROME
    return TvFocusZone.NONE
}
