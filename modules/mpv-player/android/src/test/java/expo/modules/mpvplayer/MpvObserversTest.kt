package expo.modules.mpvplayer

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MpvObserversTest {
    @Test
    fun deliversToEveryObserver() {
        val observers = MpvObservers<StringBuilder>()
        val first = StringBuilder()
        val second = StringBuilder()
        observers.add(first)
        observers.add(second)

        observers.dispatch { it.append("event") }

        assertEquals("event", first.toString())
        assertEquals("event", second.toString())
    }

    @Test
    fun stopsDeliveringAfterRemoval() {
        val observers = MpvObservers<StringBuilder>()
        val observer = StringBuilder()
        observers.add(observer)
        observers.remove(observer)

        observers.dispatch { it.append("event") }

        assertEquals("", observer.toString())
    }

    // The ANR: mpv's event thread was inside a callback that had not
    // returned (a synchronous sub-add fetching a subtitle), and the UI
    // thread waited in removeObserver for the lock that callback held.
    @Test
    fun removalDoesNotWaitForACallbackInProgress() {
        val observers = MpvObservers<Any>()
        val observer = Any()
        observers.add(observer)
        val callbackEntered = CountDownLatch(1)
        val releaseCallback = CountDownLatch(1)

        val eventThread = thread {
            observers.dispatch {
                callbackEntered.countDown()
                releaseCallback.await()
            }
        }
        assertTrue(callbackEntered.await(5, TimeUnit.SECONDS))

        val removed = CountDownLatch(1)
        thread {
            observers.remove(observer)
            removed.countDown()
        }
        val removedWhileBlocked = removed.await(5, TimeUnit.SECONDS)

        releaseCallback.countDown()
        eventThread.join()
        assertTrue(removedWhileBlocked)
    }
}
