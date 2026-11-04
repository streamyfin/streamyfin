package expo.modules.mpvplayer.cast.target

/** A receiver the SDK can reach, as discovery lists it. */
data class TargetDevice(val id: String, val name: String, val model: String? = null) {
    /** The CastDevice record of Cast.types.ts, which onDevicesChanged publishes. */
    fun toMap(): Map<String, Any?> = mapOf("deviceId" to id, "friendlyName" to name, "modelName" to model)
}

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
    // Why the last session ended, or why a request the port refused at once did not move the session
    // that holds; null when nothing went wrong, or when the user ended it.
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
 * Turns the session events the module already emits (onSessionEvent) into the target state. A switch
 * ends one session before it starts the next: the old session's end, whatever status the SDK gives it
 * (2155 on Android), leads to the asked receiver, never to none. Nothing promises the old end arrives
 * first, so an end that names another receiver than the one connecting or connected leaves the state
 * alone. No state ever pairs one device's id with another's name. Pure: the hub feeds it and publishes
 * what changed.
 */
class RemoteTargetMachine {
    var snapshot: RemoteTargetSnapshot = RemoteTargetSnapshot.NONE
        private set

    // The receiver asked for while another one held the session: the old session's end leads to it.
    private var switchingTo: TargetDevice? = null

    /** A switch is on its way: asking the receiver it leaves is a request again, not a no-op. */
    val isSwitching: Boolean
        get() = switchingTo != null

    /**
     * A connection asked from this phone; the SDK's own events follow. Over another receiver, a switch
     * starts; over the held one while a switch takes its session away, the last request wins.
     */
    fun connectRequested(device: TargetDevice): Boolean {
        if (snapshot.phase != TargetPhase.NONE) {
            if (snapshot.target?.id != device.id || switchingTo != null) switchingTo = device
            return false
        }
        switchingTo = null
        return update(RemoteTargetSnapshot(TargetPhase.CONNECTING, RemoteTarget.cast(device), reconnecting = false, error = null))
    }

    /** A disconnection asked from this phone: a switch on its way goes with the session. */
    fun disconnectRequested() {
        switchingTo = null
    }

    /** True when the state changed. An event without its device keeps the target already known. */
    fun sessionEvent(event: String, device: TargetDevice?, error: String?): Boolean {
        val switching = switchingTo
        val failure = event == "ended" || event == "startFailed"
        // The only start in flight during a switch is the asked receiver's, so a start failure without
        // its device is that one's.
        val askedFailed = device?.id == switching?.id || (device == null && event == "startFailed")
        if (failure && switching != null && askedFailed) {
            val held = snapshot.target?.id == switching.id
            // Asked back while a switch ended its session: that end leads to it again.
            if (held && snapshot.phase != TargetPhase.CONNECTING) {
                return update(RemoteTargetSnapshot(TargetPhase.CONNECTING, RemoteTarget.cast(switching), reconnecting = false, error = null))
            }
            // The asked receiver failed. Once the old session ended it was the target; before that, the port
            // refused it at once, and the receiver holding the session stays, with the cause.
            switchingTo = null
            if (!held) return update(snapshot.copy(error = error))
            return update(RemoteTargetSnapshot(TargetPhase.NONE, null, reconnecting = false, error = error))
        }
        if (event in END_EVENTS && device != null && heldOtherThan(device)) return false
        if (failure && switching != null) {
            return update(RemoteTargetSnapshot(TargetPhase.CONNECTING, RemoteTarget.cast(switching), reconnecting = false, error = null))
        }
        if ((event == "started" || event == "resumed") && device != null && device.id == switching?.id) switchingTo = null
        val target = device?.let(RemoteTarget::cast) ?: snapshot.target
        val next = when (event) {
            "starting" -> RemoteTargetSnapshot(TargetPhase.CONNECTING, target, reconnecting = false, error = null)
            "started", "resumed" -> RemoteTargetSnapshot(TargetPhase.CONNECTED, target, reconnecting = false, error = null)
            // The SDK keeps trying a suspended session on its own: the same target, reconnecting.
            "suspended" -> RemoteTargetSnapshot(TargetPhase.CONNECTING, snapshot.target, reconnecting = true, error = null)
            "resuming" -> RemoteTargetSnapshot(TargetPhase.CONNECTING, target, reconnecting = true, error = null)
            "ending" -> RemoteTargetSnapshot(TargetPhase.ENDING, snapshot.target, reconnecting = false, error = null)
            "ended", "startFailed" -> RemoteTargetSnapshot(TargetPhase.NONE, null, reconnecting = false, error = error)
            // The SDK kept a session it was asked to end: it stays, with the cause.
            "endRefused" -> if (snapshot.phase == TargetPhase.NONE) return false else snapshot.copy(error = error)
            else -> return false
        }
        return update(next)
    }

    private fun update(next: RemoteTargetSnapshot): Boolean {
        if (next == snapshot) return false
        snapshot = next
        return true
    }

    // An ending session is still held: a late end of the receiver before it must not end it.
    private fun heldOtherThan(device: TargetDevice): Boolean {
        val held = snapshot.target ?: return false
        return snapshot.phase != TargetPhase.NONE && held.id != device.id
    }

    private companion object {
        val END_EVENTS = setOf("ending", "ended", "startFailed")
    }
}
