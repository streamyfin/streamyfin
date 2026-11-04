package expo.modules.mpvplayer.cast.target

/** A receiver the SDK can reach, as discovery lists it. */
data class TargetDevice(val id: String, val name: String)

/** Where playback goes. Only Cast targets exist for now; Play On and AirPlay come with their engines. */
data class RemoteTarget(val kind: String, val id: String, val name: String, val volume: Boolean) {
    companion object {
        const val KIND_CAST = "cast"

        // Every Cast receiver takes a volume and a mute from the sender.
        fun cast(device: TargetDevice) = RemoteTarget(KIND_CAST, device.id, device.name, volume = true)
    }
}

enum class TargetPhase(val jsName: String) {
    NONE("none"),
    CONNECTING("connecting"),
    CONNECTED("connected"),
    ENDING("ending"),
}

/** The state published to JS (RemoteTargetState in Cast.types.ts). */
data class RemoteTargetSnapshot(
    val phase: TargetPhase,
    val target: RemoteTarget?,
    val reconnecting: Boolean,
    // Why the last session ended; null when it did not end, or when the user ended it.
    val error: String?,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "state" to phase.jsName,
        "target" to target?.let {
            mapOf("kind" to it.kind, "id" to it.id, "name" to it.name, "capabilities" to mapOf("volume" to it.volume))
        },
        "reconnecting" to reconnecting,
        "error" to error,
    )

    companion object {
        val NONE = RemoteTargetSnapshot(TargetPhase.NONE, null, reconnecting = false, error = null)
    }
}

/**
 * Turns the session events the module already emits (onSessionEvent) into the target state. The
 * SDK ends a session before it starts the next one, so a device switch goes through `ending` and
 * `none`, and no state ever pairs one device's id with another's name. Pure: the hub feeds it and
 * publishes what changed.
 */
class RemoteTargetMachine {
    var snapshot: RemoteTargetSnapshot = RemoteTargetSnapshot.NONE
        private set

    /** A connection asked from this phone; the SDK's own events follow. Ignored unless nothing is connected. */
    fun connectRequested(device: TargetDevice): Boolean {
        if (snapshot.phase != TargetPhase.NONE) return false
        return update(RemoteTargetSnapshot(TargetPhase.CONNECTING, RemoteTarget.cast(device), reconnecting = false, error = null))
    }

    /** True when the state changed. An event without its device keeps the target already known. */
    fun sessionEvent(event: String, device: TargetDevice?, error: String?): Boolean {
        val target = device?.let(RemoteTarget::cast) ?: snapshot.target
        val next = when (event) {
            "starting" -> RemoteTargetSnapshot(TargetPhase.CONNECTING, target, reconnecting = false, error = null)
            "started", "resumed" -> RemoteTargetSnapshot(TargetPhase.CONNECTED, target, reconnecting = false, error = null)
            // The SDK keeps trying a suspended session on its own: the same target, reconnecting.
            "suspended" -> RemoteTargetSnapshot(TargetPhase.CONNECTING, snapshot.target, reconnecting = true, error = null)
            "resuming" -> RemoteTargetSnapshot(TargetPhase.CONNECTING, target, reconnecting = true, error = null)
            "ending" -> RemoteTargetSnapshot(TargetPhase.ENDING, snapshot.target, reconnecting = false, error = null)
            "ended", "startFailed" -> RemoteTargetSnapshot(TargetPhase.NONE, null, reconnecting = false, error = error)
            else -> return false
        }
        return update(next)
    }

    private fun update(next: RemoteTargetSnapshot): Boolean {
        if (next == snapshot) return false
        snapshot = next
        return true
    }
}
