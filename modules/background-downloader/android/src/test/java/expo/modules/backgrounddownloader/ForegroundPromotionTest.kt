package expo.modules.backgrounddownloader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ForegroundPromotionTest {
  private var promotions = 0
  private var demotions = 0
  private var systemAllows = true

  private val foreground = ForegroundPromotion(
    promote = {
      promotions++
      systemAllows
    },
    demote = { demotions++ }
  )

  // Sentry REACT-NATIVE-9V: a start command that returned without calling startForeground()
  // killed the process. Each one is a separate promise to the system, so each one is answered.
  @Test
  fun answersEveryStartCommand() {
    assertTrue(foreground.onStartCommand())
    assertTrue(foreground.onStartCommand())

    assertEquals(2, promotions)
  }

  @Test
  fun answersAStartCommandThatArrivesWhileDownloadsAlreadyRun() {
    foreground.onActiveDownloads(1)

    assertTrue(foreground.onStartCommand())

    assertEquals(2, promotions)
  }

  @Test
  fun answersAStartCommandAfterTheLastDownloadIsGone() {
    foreground.onStartCommand()
    foreground.onActiveDownloads(0)

    assertTrue(foreground.onStartCommand())

    assertEquals(2, promotions)
  }

  // The refusal is only known by asking: the call that throws is also the one that settles
  // the start with the system, so it cannot be skipped on a guess.
  @Test
  fun asksTheSystemBeforeReportingARefusal() {
    systemAllows = false

    assertFalse(foreground.onStartCommand())

    assertEquals(1, promotions)
  }

  @Test
  fun promotesOnceForAnyNumberOfRunningDownloads() {
    assertTrue(foreground.onActiveDownloads(1))
    assertTrue(foreground.onActiveDownloads(2))
    assertTrue(foreground.onActiveDownloads(1))

    assertEquals(1, promotions)
    assertEquals(0, demotions)
  }

  @Test
  fun leavesTheForegroundAndAsksToStopWhenNothingRuns() {
    foreground.onStartCommand()
    foreground.onActiveDownloads(1)

    assertFalse(foreground.onActiveDownloads(0))

    assertEquals(1, demotions)
  }

  @Test
  fun doesNotLeaveAForegroundItNeverHad() {
    assertFalse(foreground.onActiveDownloads(0))

    assertEquals(0, demotions)
  }

  @Test
  fun asksToStopWhenARunningDownloadCannotBePromoted() {
    systemAllows = false

    assertFalse(foreground.onActiveDownloads(1))
  }

  // Android 15+ refuses a repeat startForeground() for a dataSync service once the app is in
  // the background. The first promotion still stands: the service keeps running, and leaves
  // the foreground when the downloads end.
  @Test
  fun keepsAnEarlierPromotionWhenALaterStartIsRefused() {
    foreground.onStartCommand()
    systemAllows = false

    assertTrue(foreground.onStartCommand())
    assertTrue(foreground.onActiveDownloads(1))
    assertEquals(2, promotions)

    foreground.onActiveDownloads(0)

    assertEquals(1, demotions)
  }

  // Sentry REACT-NATIVE-HT: Android 15+ gives a dataSync service about six hours in the
  // foreground per day, then calls onTimeout() and kills the process unless the service leaves
  // the foreground within seconds.
  @Test
  fun leavesTheForegroundWhenTheSystemEndsItsTime() {
    foreground.onStartCommand()
    foreground.onActiveDownloads(1)

    foreground.onTimeout()

    assertEquals(1, demotions)
  }

  // The system is the one saying the service is in the foreground. Whether this class agrees
  // is not a reason to leave its call unanswered.
  @Test
  fun leavesTheForegroundOnATimeoutItDidNotExpect() {
    foreground.onTimeout()

    assertEquals(1, demotions)
  }

  @Test
  fun doesNotLeaveTheForegroundTwiceAfterATimeout() {
    foreground.onStartCommand()
    foreground.onTimeout()

    assertFalse(foreground.onActiveDownloads(0))

    assertEquals(1, demotions)
  }

  // The limit stays used up until the app has been on screen, and only the system knows when
  // that is. A start command in between is still owed its startForeground() call, which is
  // refused, and the service then has nothing to stay for.
  @Test
  fun answersAStartCommandWhileTheTimeLimitIsUsedUp() {
    foreground.onStartCommand()
    foreground.onTimeout()
    systemAllows = false

    assertFalse(foreground.onStartCommand())

    assertEquals(2, promotions)
  }

  @Test
  fun asksToStopWhenADownloadRunsWhileTheTimeLimitIsUsedUp() {
    foreground.onStartCommand()
    foreground.onTimeout()
    systemAllows = false

    assertFalse(foreground.onActiveDownloads(1))

    assertEquals(2, promotions)
  }

  @Test
  fun takesTheForegroundAgainOnceTheSystemAllowsItAfterATimeout() {
    foreground.onStartCommand()
    foreground.onTimeout()

    assertTrue(foreground.onActiveDownloads(1))
    assertEquals(2, promotions)

    foreground.onActiveDownloads(0)

    assertEquals(2, demotions)
  }

  // The service only posts download progress while this says so. notify() on the id of a
  // notification that left with the foreground puts it back, and nothing removes it then.
  @Test
  fun ownsTheNotificationOnlyWhileInTheForeground() {
    assertFalse(foreground.isPromoted)

    foreground.onStartCommand()
    assertTrue(foreground.isPromoted)

    foreground.onActiveDownloads(0)
    assertFalse(foreground.isPromoted)
  }

  @Test
  fun doesNotOwnTheNotificationAfterATimeout() {
    foreground.onStartCommand()
    foreground.onActiveDownloads(1)

    foreground.onTimeout()

    assertFalse(foreground.isPromoted)
  }

  // A download started while the time limit is used up runs without the foreground, with the
  // app on screen or a playing music service keeping the process up.
  @Test
  fun doesNotOwnTheNotificationWhenThePromotionWasRefused() {
    systemAllows = false

    foreground.onActiveDownloads(1)

    assertFalse(foreground.isPromoted)
  }
}
