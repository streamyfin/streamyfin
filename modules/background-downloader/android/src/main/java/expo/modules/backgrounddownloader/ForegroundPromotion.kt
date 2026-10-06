package expo.modules.backgrounddownloader

/**
 * When DownloadService holds the foreground. Free of Android types so a JVM test can pin it.
 *
 * Context.startForegroundService() is a promise that the service calls startForeground()
 * within a few seconds, on every start. The system kills the process with
 * ForegroundServiceDidNotStartInTimeException when the service stops, or the time runs out,
 * with that promise open. So a start command is answered first, and whether the service has
 * anything to run for is decided after.
 */
internal class ForegroundPromotion(
  /** Service.startForeground(). Returns false when the system refused the promotion. */
  private val promote: () -> Boolean,
  /** Service.stopForeground(). */
  private val demote: () -> Unit
) {
  private var promoted = false

  /**
   * Answers one start command. Nothing is checked first, not even whether the service is
   * already in the foreground: the system decides which starts are owed an answer, and this
   * class only has its own flag to guess that from.
   *
   * @return false when the service is not in the foreground and has no reason to stay.
   */
  @Synchronized
  fun onStartCommand(): Boolean {
    // A repeat can be refused where the first call was not: Android 15+ checks again, on every
    // call, whether a dataSync service may start from where the app is now. That refusal
    // leaves the earlier promotion standing, so it is no reason to stop.
    if (promote()) promoted = true
    return promoted
  }

  /**
   * Follows the number of running downloads.
   *
   * @return false when the service should stop.
   */
  @Synchronized
  fun onActiveDownloads(count: Int): Boolean {
    if (count > 0) {
      if (!promoted) promoted = promote()
      return promoted
    }
    if (promoted) {
      demote()
      promoted = false
    }
    return false
  }

  /**
   * The system has ended the service's time in the foreground: Service.onTimeout() for a time
   * limited type such as dataSync. Leaving the foreground is the answer it waits for, and it
   * kills the process when that does not come, so nothing is checked first here either.
   *
   * The promotion is forgotten with it. The next running download asks again, and is refused
   * until the system has reset the limit.
   */
  @Synchronized
  fun onTimeout() {
    demote()
    promoted = false
  }
}
