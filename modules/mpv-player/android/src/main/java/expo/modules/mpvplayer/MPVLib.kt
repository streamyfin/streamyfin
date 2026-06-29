package expo.modules.mpvplayer

import android.content.Context
import dev.jdtech.mpv.MPVLib as LibMPV

/**
 * Per-instance wrapper around the dev.jdtech.mpv.MPVLib class.
 *
 * libmpv 1.0 exposes an instance-based API: each `LibMPV.create(ctx)` returns
 * a fresh, independent handle. Each player creates its own MPVLib instance
 * (Findroid pattern) and on teardown we simply drop the reference. We do NOT
 * call `LibMPV.destroy()` — its native implementation has an internal
 * use-after-free on libmpv 1.0 that we cannot fix from Kotlin. Letting the
 * GC reach the JVM-level finalizer (or never reaching it, since the native
 * handle lives in process-global state until exit) is strictly safer than
 * crashing.
 *
 * Trade-off: mpv's native footprint (decoder + demuxer cache) for one player
 * stays allocated until the next player's allocation displaces it in scudo's
 * arena. On a TV app where the player is the dominant memory consumer and
 * only one player is alive at a time, this is acceptable.
 */
class MPVLib private constructor(private val instance: LibMPV) {

    // Event observer interface — mirrors dev.jdtech.mpv.MPVLib.EventObserver
    // so MPVLayerRenderer implements a stable, wrapper-owned signature.
    interface EventObserver {
        fun eventProperty(property: String)
        fun eventProperty(property: String, value: Long)
        fun eventProperty(property: String, value: Boolean)
        fun eventProperty(property: String, value: String)
        fun eventProperty(property: String, value: Double)
        fun event(eventId: Int)
    }

    private val observers = mutableListOf<EventObserver>()

    // Library event observer that forwards LibMPV callbacks to our observers.
    private val libObserver = object : LibMPV.EventObserver {
        override fun eventProperty(property: String) =
            dispatch { it.eventProperty(property) }

        override fun eventProperty(property: String, value: Long) =
            dispatch { it.eventProperty(property, value) }

        override fun eventProperty(property: String, value: Boolean) =
            dispatch { it.eventProperty(property, value) }

        override fun eventProperty(property: String, value: String) =
            dispatch { it.eventProperty(property, value) }

        override fun eventProperty(property: String, value: Double) =
            dispatch { it.eventProperty(property, value) }

        override fun event(eventId: Int) =
            dispatch { it.event(eventId) }

        private inline fun dispatch(block: (EventObserver) -> Unit) {
            synchronized(observers) {
                observers.forEach(block)
            }
        }
    }

    fun addObserver(observer: EventObserver) {
        synchronized(observers) { observers.add(observer) }
    }

    fun removeObserver(observer: EventObserver) {
        synchronized(observers) { observers.remove(observer) }
    }

    fun initialize() {
        instance.init()
    }

    fun attachSurface(surface: android.view.Surface) {
        instance.attachSurface(surface)
    }

    fun detachSurface() {
        instance.detachSurface()
    }

    fun command(cmd: Array<String>) {
        instance.command(cmd)
    }

    fun setOptionString(name: String, value: String): Int {
        return instance.setOptionString(name, value)
    }

    fun getPropertyInt(name: String): Int? = try {
        instance.getPropertyInt(name)
    } catch (e: Exception) { null }

    fun getPropertyDouble(name: String): Double? = try {
        instance.getPropertyDouble(name)
    } catch (e: Exception) { null }

    fun getPropertyBoolean(name: String): Boolean? = try {
        instance.getPropertyBoolean(name)
    } catch (e: Exception) { null }

    fun getPropertyString(name: String): String? = try {
        instance.getPropertyString(name)
    } catch (e: Exception) { null }

    fun setPropertyInt(name: String, value: Int) {
        instance.setPropertyInt(name, value)
    }

    fun setPropertyDouble(name: String, value: Double) {
        instance.setPropertyDouble(name, value)
    }

    fun setPropertyBoolean(name: String, value: Boolean) {
        instance.setPropertyBoolean(name, value)
    }

    fun setPropertyString(name: String, value: String) {
        instance.setPropertyString(name, value)
    }

    fun observeProperty(name: String, format: Int) {
        instance.observeProperty(name, format)
    }

    companion object {
        /**
         * Create a fresh mpv handle. Each call returns an independent instance —
         * do not share across players. Attach exactly one [EventObserver] per
         * player via [addObserver].
         */
        fun create(context: Context): MPVLib {
            val lib = LibMPV.create(context)
                ?: throw IllegalStateException("LibMPV.create returned null")
            val wrapper = MPVLib(lib)
            // The libObserver is attached for the lifetime of this MPVLib
            // instance and forwards every LibMPV callback to our observers
            // list. Player-specific observers are added/removed via
            // addObserver/removeObserver.
            lib.addObserver(wrapper.libObserver)
            return wrapper
        }

        // MPV Event IDs (kept here so observers can reference them without
        // holding a reference to an instance).
        const val MPV_EVENT_NONE = 0
        const val MPV_EVENT_SHUTDOWN = 1
        const val MPV_EVENT_LOG_MESSAGE = 2
        const val MPV_EVENT_GET_PROPERTY_REPLY = 3
        const val MPV_EVENT_SET_PROPERTY_REPLY = 4
        const val MPV_EVENT_COMMAND_REPLY = 5
        const val MPV_EVENT_START_FILE = 6
        const val MPV_EVENT_END_FILE = 7
        const val MPV_EVENT_FILE_LOADED = 8
        const val MPV_EVENT_IDLE = 11
        const val MPV_EVENT_TICK = 14
        const val MPV_EVENT_CLIENT_MESSAGE = 16
        const val MPV_EVENT_VIDEO_RECONFIG = 17
        const val MPV_EVENT_AUDIO_RECONFIG = 18
        const val MPV_EVENT_SEEK = 20
        const val MPV_EVENT_PLAYBACK_RESTART = 21
        const val MPV_EVENT_PROPERTY_CHANGE = 22
        const val MPV_EVENT_QUEUE_OVERFLOW = 24

        // End file reason
        const val MPV_END_FILE_REASON_EOF = 0
        const val MPV_END_FILE_REASON_STOP = 2
        const val MPV_END_FILE_REASON_QUIT = 3
        const val MPV_END_FILE_REASON_ERROR = 4
        const val MPV_END_FILE_REASON_REDIRECT = 5
    }
}
