package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.*
import org.junit.Test

class SyncPlayCommandSchedulerTest {
    private class Harness {
        var now = 10_000L
        data class Task(val at: Long, val run: () -> Unit, var canceled: Boolean = false)
        val tasks = mutableListOf<Task>()
        val executions = mutableListOf<Pair<String, Double>>()
        var executeSucceeds = true
        val scheduler = SyncPlayCommandScheduler(
            nowMs = { now },
            schedule = { delay, run ->
                val task = Task(now + delay, run)
                tasks.add(task)
                val cancel: () -> Unit = { task.canceled = true }
                cancel
            },
            execute = { cmd, position -> executions.add(cmd.command to position); executeSucceeds }
        ).apply { updateIdentity("group", "item", true) }

        fun runDue() {
            val due = tasks.filter { !it.canceled && it.at <= now }
            due.forEach { it.canceled = true; it.run() }
        }
        fun command(
            id: String = "1", command: String = "Unpause", deadline: Double = 11_000.0,
            position: Double = 20.0, group: String = "group", item: String = "item"
        ) = ScheduledSyncPlayCommand(id, group, item, command, deadline, position)
    }

    @Test fun resolvesOnlyAfterTheNativeExecutionDeadline() {
        val h = Harness()
        val result = mutableListOf<Boolean>()
        h.scheduler.submit(h.command(), result::add)
        h.now = 10_999
        h.runDue()
        assertTrue(result.isEmpty())
        assertTrue(h.executions.isEmpty())
        h.now = 11_000
        h.runDue()
        assertEquals(listOf(true), result)
        assertEquals("Unpause" to 20.0, h.executions.single())
    }

    @Test fun lateUnpauseJoinsTheAdvancingGroupTimeline() {
        val h = Harness()
        h.scheduler.submit(h.command()) {}
        h.now = 12_750
        h.runDue()
        assertEquals(21.75, h.executions.single().second, 0.00001)
    }

    @Test fun latePauseAndSeekKeepTheirRequestedPosition() {
        listOf("Pause", "Seek").forEach { command ->
            val h = Harness()
            h.scheduler.submit(h.command(command = command)) {}
            h.now = 12_750
            h.runDue()
            assertEquals(20.0, h.executions.single().second, 0.00001)
        }
    }

    @Test fun newerCommandCancelsTheOldPromiseAndDeadline() {
        val h = Harness()
        val old = mutableListOf<Boolean>()
        val newer = mutableListOf<Boolean>()
        h.scheduler.submit(h.command(), old::add)
        h.scheduler.submit(h.command(id = "2", command = "Pause", deadline = 10_500.0), newer::add)
        assertEquals(listOf(false), old)
        h.now = 12_000
        h.runDue()
        assertEquals(listOf(true), newer)
        assertEquals(listOf("Pause" to 20.0), h.executions)
    }

    @Test fun groupOrPlaylistReplacementAndDisconnectionCancelPendingWork() {
        listOf(Triple("other", "item", true), Triple("group", "other", true), Triple("group", "item", false)).forEach { identity ->
            val h = Harness()
            val results = mutableListOf<Boolean>()
            h.scheduler.submit(h.command(), results::add)
            val staleCallback = h.tasks.single().run
            h.scheduler.updateIdentity(identity.first, identity.second, identity.third)
            h.now = 12_000
            staleCallback() // Already dequeued Handler callbacks must also be harmless.
            assertEquals(listOf(false), results)
            assertTrue(h.executions.isEmpty())
        }
    }

    @Test fun cancelAndTeardownResolvePendingPromiseOnce() {
        val h = Harness()
        val results = mutableListOf<Boolean>()
        h.scheduler.submit(h.command(), results::add)
        h.scheduler.cancel()
        h.scheduler.cancel()
        h.now = 12_000
        h.runDue()
        assertEquals(listOf(false), results)
        assertTrue(h.executions.isEmpty())
    }

    @Test fun staleOrMalformedCommandsDoNotDisplaceAcceptedWork() {
        val h = Harness()
        val results = mutableListOf<Boolean>()
        h.scheduler.submit(h.command()) {}
        listOf(
            h.command(id = "bad-group", group = "other"),
            h.command(id = "bad-item", item = "other"),
            h.command(id = "bad-command", command = "Unknown"),
            h.command(id = "bad-deadline", deadline = Double.NaN),
            h.command(id = "bad-position", position = Double.POSITIVE_INFINITY),
            h.command(id = "negative-position", position = -1.0),
            h.command(id = "")
        ).forEach { h.scheduler.submit(it, results::add) }
        assertEquals(List(7) { false }, results)
        h.now = 11_000
        h.runDue()
        assertEquals(1, h.executions.size)
    }

    @Test fun aCompletedCommandCannotExecuteTwice() {
        val h = Harness()
        h.scheduler.submit(h.command()) {}
        h.now = 11_000
        h.runDue()
        val results = mutableListOf<Boolean>()
        h.scheduler.submit(h.command(), results::add)
        h.runDue()
        assertEquals(listOf(false), results)
        assertEquals(1, h.executions.size)
    }

    @Test fun stopStillExecutesWhenTheSharedQueueHasBeenCleared() {
        val h = Harness()
        h.scheduler.updateIdentity("group", null, true)
        val results = mutableListOf<Boolean>()
        h.scheduler.submit(h.command(command = "Stop"), results::add)
        h.now = 11_000
        h.runDue()
        assertEquals(listOf(true), results)
        assertEquals("Stop", h.executions.single().first)
    }

    @Test fun decoderFailureIsReportedAsFalse() {
        val h = Harness()
        h.executeSucceeds = false
        val results = mutableListOf<Boolean>()
        h.scheduler.submit(h.command(), results::add)
        h.now = 11_000
        h.runDue()
        assertEquals(listOf(false), results)
    }

}
