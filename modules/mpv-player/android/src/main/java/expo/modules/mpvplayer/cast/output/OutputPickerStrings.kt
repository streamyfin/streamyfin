package expo.modules.mpvplayer.cast.output

/**
 * The sheet's texts, from JS (translations/en.json) when JS opens it, with the English fallbacks for a
 * sheet opened from native (the native player's Cast button, the debug probe).
 */
class OutputPickerStrings(private val strings: Map<String, String> = emptyMap()) {
    fun get(key: String): String = strings[key] ?: FALLBACKS[key] ?: key

    fun cause(cause: FailureCause): String =
        when (cause) {
            FailureCause.DeviceGone -> get("deviceGone")
            FailureCause.ReceiverUnavailable -> get("receiverUnavailable")
            FailureCause.Network -> get("network")
            is FailureCause.Other -> cause.message.ifBlank { get("failed") }
        }

    companion object {
        val FALLBACKS =
            mapOf(
                "title" to "Play on",
                "thisPhone" to "This phone",
                "thisTablet" to "This tablet",
                "playing" to "Playing",
                "castCaption" to "Chromecast",
                "searching" to "Looking for devices",
                "noDevices" to "No devices found",
                "playServicesMissing" to "Casting needs Google Play services",
                "playServicesUpdate" to "Casting needs an update of Google Play services",
                "playServicesAction" to "Get it",
                "connecting" to "Connecting",
                "cancel" to "Cancel",
                "connected" to "Chromecast, connected",
                "reconnecting" to "Reconnecting",
                "change" to "Change",
                "mute" to "Mute",
                "unmute" to "Unmute",
                "volume" to "Volume",
                "remote" to "Remote",
                "stopPlayback" to "Stop playback",
                "disconnect" to "Disconnect",
                "deviceGone" to "This device is no longer on the network",
                "receiverUnavailable" to "The Jellyfin receiver could not start on this device",
                "network" to "The connection to this device was lost",
                "failed" to "The connection failed",
                "airPlay" to "AirPlay…",
                "airPlayCaption" to "System picker",
            )
    }
}
