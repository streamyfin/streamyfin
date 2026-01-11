package expo.modules.mpvplayer

import android.content.Context
import android.util.Log
import android.view.Surface
import dev.jdtech.mpv.MPVLib as LibMPV

/**
 * Wrapper around the dev.jdtech.mpv.MPVLib class.
 * This provides a consistent interface for the rest of the app.
 */
object MPVLib {
    private const val TAG = "MPVLib"
    
    private var initialized = false
    
    // Event observer interface
    interface EventObserver {
        fun eventProperty(property: String)
        fun eventProperty(property: String, value: Long)
        fun eventProperty(property: String, value: Boolean)
        fun eventProperty(property: String, value: String)
        fun eventProperty(property: String, value: Double)
        fun event(eventId: Int)
    }
    
    private val observers = mutableListOf<EventObserver>()
    
    // Library event observer that forwards to our observers
    private val libObserver = object : LibMPV.EventObserver {
        override fun eventProperty(property: String) {
            synchronized(observers) {
                for (observer in observers) {
                    observer.eventProperty(property)
                }
            }
        }
        
        override fun eventProperty(property: String, value: Long) {
            synchronized(observers) {
                for (observer in observers) {
                    observer.eventProperty(property, value)
                }
            }
        }
        
        override fun eventProperty(property: String, value: Boolean) {
            synchronized(observers) {
                for (observer in observers) {
                    observer.eventProperty(property, value)
                }
            }
        }
        
        override fun eventProperty(property: String, value: String) {
            synchronized(observers) {
                for (observer in observers) {
                    observer.eventProperty(property, value)
                }
            }
        }
        
        override fun eventProperty(property: String, value: Double) {
            synchronized(observers) {
                for (observer in observers) {
                    observer.eventProperty(property, value)
                }
            }
        }
        
        override fun event(eventId: Int) {
            synchronized(observers) {
                for (observer in observers) {
                    observer.event(eventId)
                }
            }
        }
    }
    
    fun addObserver(observer: EventObserver) {
        synchronized(observers) {
            observers.add(observer)
        }
    }
    
    fun removeObserver(observer: EventObserver) {
        synchronized(observers) {
            observers.remove(observer)
        }
    }
    
    // MPV Event IDs
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
    
    /**
     * Create and initialize the MPV library
     */
    fun create(context: Context, configDir: String? = null) {
        if (initialized) return
        
        try {
            LibMPV.create(context)
            LibMPV.addObserver(libObserver)
            initialized = true
            Log.i(TAG, "libmpv created successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create libmpv: ${e.message}")
            throw e
        }
    }
    
    fun initialize() {
        LibMPV.init()
    }
    
    fun destroy() {
        if (!initialized) return
        try {
            LibMPV.removeObserver(libObserver)
            LibMPV.destroy()
        } catch (e: Exception) {
            Log.e(TAG, "Error destroying mpv: ${e.message}")
        }
        initialized = false
    }
    
    fun isInitialized(): Boolean = initialized
    
    fun attachSurface(surface: Surface) {
        LibMPV.attachSurface(surface)
    }
    
    fun detachSurface() {
        LibMPV.detachSurface()
    }
    
    fun command(cmd: Array<String?>) {
        LibMPV.command(cmd)
    }
    
    fun setOptionString(name: String, value: String): Int {
        return LibMPV.setOptionString(name, value)
    }
    
    fun getPropertyInt(name: String): Int? {
        return try {
            LibMPV.getPropertyInt(name)
        } catch (e: Exception) {
            null
        }
    }
    
    fun getPropertyDouble(name: String): Double? {
        return try {
            LibMPV.getPropertyDouble(name)
        } catch (e: Exception) {
            null
        }
    }
    
    fun getPropertyBoolean(name: String): Boolean? {
        return try {
            LibMPV.getPropertyBoolean(name)
        } catch (e: Exception) {
            null
        }
    }
    
    fun getPropertyString(name: String): String? {
        return try {
            LibMPV.getPropertyString(name)
        } catch (e: Exception) {
            null
        }
    }
    
    fun setPropertyInt(name: String, value: Int) {
        LibMPV.setPropertyInt(name, value)
    }
    
    fun setPropertyDouble(name: String, value: Double) {
        LibMPV.setPropertyDouble(name, value)
    }
    
    fun setPropertyBoolean(name: String, value: Boolean) {
        LibMPV.setPropertyBoolean(name, value)
    }
    
    fun setPropertyString(name: String, value: String) {
        LibMPV.setPropertyString(name, value)
    }
    
    fun observeProperty(name: String, format: Int) {
        LibMPV.observeProperty(name, format)
    }
}
