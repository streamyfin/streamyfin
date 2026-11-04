package expo.modules.mpvplayer.nativeplayer.engine

/** The engines the native chrome builds, under the name a config gives them (`config.engine`). */
enum class NativeEngineKind(val configName: String) {
    MPV("mpv"),
    EXOPLAYER("exoplayer");

    companion object {
        /**
         * The engine [name] stands for, null for one the chrome does not build. No name means
         * mpv: older configs send none.
         */
        fun of(name: String?): NativeEngineKind? {
            if (name.isNullOrBlank()) return MPV
            return entries.firstOrNull { it.configName.equals(name, ignoreCase = true) }
        }
    }
}
