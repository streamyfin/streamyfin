package expo.modules.mpvplayer.nativeplayer

import kotlin.math.ceil
import kotlin.math.max

/** Main-thread coordinator; the injected clock/task queue makes deadline races testable. */
internal data class ScheduledSyncPlayCommand(
    val commandId: String,
    val groupId: String,
    val playlistItemId: String,
    val command: String,
    val executeAtMs: Double,
    val positionSec: Double
)

internal class SyncPlayCommandScheduler(
    private val nowMs: () -> Long,
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
    private val execute: (ScheduledSyncPlayCommand, Double) -> Boolean
) {
    private var groupId: String? = null
    private var playlistItemId: String? = null
    private var connected = false
    private var generation = 0L
    private var lastCommandId: String? = null
    private var cancelTask: (() -> Unit)? = null
    private var completion: ((Boolean) -> Unit)? = null

    fun updateIdentity(groupId: String?, playlistItemId: String?, connected: Boolean) {
        if (this.groupId != groupId || this.playlistItemId != playlistItemId || !connected) {
            cancel()
            if (this.groupId != groupId) lastCommandId = null
        }
        this.groupId = groupId
        this.playlistItemId = playlistItemId
        this.connected = connected
    }

    private fun matches(command: ScheduledSyncPlayCommand): Boolean =
        connected && groupId != null && command.groupId == groupId &&
            (command.command == "Stop" ||
                (!playlistItemId.isNullOrEmpty() && command.playlistItemId == playlistItemId))

    fun submit(command: ScheduledSyncPlayCommand, onComplete: (Boolean) -> Unit) {
        if (!matches(command) || command.commandId.isEmpty() || command.commandId == lastCommandId ||
            command.command !in setOf("Pause", "Unpause", "Seek", "Stop") ||
            !command.executeAtMs.isFinite() || !command.positionSec.isFinite() || command.positionSec < 0.0
        ) {
            onComplete(false)
            return
        }
        cancel()
        lastCommandId = command.commandId
        completion = onComplete
        val token = generation
        val delay = max(0.0, ceil(command.executeAtMs - nowMs())).toLong()
        cancelTask = schedule(delay) {
            // cancel() bumps the generation and has already answered.
            if (generation != token) return@schedule
            cancelTask = null
            if (!matches(command)) {
                val rejected = completion
                completion = null
                rejected?.invoke(false)
                return@schedule
            }
            // A Handler can run late after a busy frame/background transition.
            // Unpause must join the advancing timeline rather than its old start.
            val position = command.positionSec + if (command.command == "Unpause") {
                max(0.0, nowMs() - command.executeAtMs) / 1000.0
            } else 0.0
            val callback = completion
            completion = null
            val success = runCatching { execute(command, position) }.getOrDefault(false)
            callback?.invoke(success)
        }
    }

    fun cancel() {
        generation++
        cancelTask?.invoke()
        cancelTask = null
        val callback = completion
        completion = null
        callback?.invoke(false)
    }
}
