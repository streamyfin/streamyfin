package expo.modules.mpvplayer

import java.util.concurrent.CopyOnWriteArrayList

/**
 * The observers of one mpv handle.
 *
 * Callbacks run on mpv's event thread and take as long as mpv does: the
 * renderer answers FILE_LOADED by adding the external subtitles with a
 * synchronous command, which fetches them over the network. A lock held
 * across the callbacks made every add and remove wait for that, and `stop()`
 * removes its observer on the UI thread — so leaving the player while a
 * subtitle was still loading froze the app (ANR in MPVLib.removeObserver).
 *
 * Callbacks therefore run over a snapshot with no lock held. The price is
 * that an observer removed while an event is being delivered can still
 * receive that one event.
 */
internal class MpvObservers<T : Any> {
    private val observers = CopyOnWriteArrayList<T>()

    fun add(observer: T) {
        observers.add(observer)
    }

    fun remove(observer: T) {
        observers.remove(observer)
    }

    fun dispatch(block: (T) -> Unit) {
        // Iterating a CopyOnWriteArrayList walks the array as it was when the
        // iteration began.
        for (observer in observers) block(observer)
    }
}
