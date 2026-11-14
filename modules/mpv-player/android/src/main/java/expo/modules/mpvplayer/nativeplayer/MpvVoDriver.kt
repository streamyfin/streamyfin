package expo.modules.mpvplayer.nativeplayer

private const val DEFAULT_MPV_VO_DRIVER = "gpu-next"

/** The drivers the "Video output" setting offers. */
private val MPV_VO_DRIVERS = setOf(DEFAULT_MPV_VO_DRIVER, "gpu")

/**
 * The `vo` mpv is started with for the config's `voDriver`. The option is set
 * before mpv initializes, so a name the setting never offered is not passed on
 * for mpv to make something of: it starts on the default instead.
 */
fun resolveMpvVoDriver(requested: String?): String =
    requested?.takeIf { it in MPV_VO_DRIVERS } ?: DEFAULT_MPV_VO_DRIVER
