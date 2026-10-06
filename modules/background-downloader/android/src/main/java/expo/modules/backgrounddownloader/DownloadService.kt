package expo.modules.backgrounddownloader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class DownloadService : Service() {
  private val TAG = "DownloadService"
  private val NOTIFICATION_ID = 1001
  private val CHANNEL_ID = "download_channel"

  private val WAKE_LOCK_TAG = "Streamyfin::DownloadWakeLock"

  private val binder = DownloadServiceBinder()
  private var activeDownloadCount = 0
  private var currentDownloadTitle = "Preparing download..."
  private var currentProgress = 0
  private val foreground = ForegroundPromotion(
    promote = ::startForegroundSafely,
    demote = { ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE) }
  )
  private var wakeLock: PowerManager.WakeLock? = null

  /**
   * Told when the system ends the foreground time, on the main thread. The module sets it: it
   * owns the downloads, which lose what kept the process running for them.
   */
  @Volatile
  var onForegroundTimeLimit: (() -> Unit)? = null

  inner class DownloadServiceBinder : Binder() {
    fun getService(): DownloadService = this@DownloadService
  }

  override fun onCreate() {
    super.onCreate()
    Log.d(TAG, "DownloadService created")
    createNotificationChannel()

    // Held only while a download runs: the service outlives its downloads
    // (started + bound), so onDestroy would release far too late.
    wakeLock = getSystemService(PowerManager::class.java)
      ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG)
      ?.apply { setReferenceCounted(false) }
  }

  override fun onBind(intent: Intent?): IBinder {
    Log.d(TAG, "DownloadService bound")
    return binder
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    Log.d(TAG, "DownloadService started")

    // Nothing may come before this, see ForegroundPromotion. Where the promotion is not
    // allowed (a dataSync service started from BOOT_COMPLETED on Android 15+)
    // startForeground() throws, and the system counts the start as answered before it does.
    // Guessing at that context from the uptime instead skipped the call for any download
    // started within ten minutes of a reboot, and stopping with the start unanswered is what
    // kills the process.
    if (!foreground.onStartCommand()) {
      stopSelf()
    }
    return START_STICKY
  }

  /**
   * Start foreground service safely with proper service type for Android 14+
   *
   * @return false when the system refused
   */
  private fun startForegroundSafely(): Boolean {
    return try {
      if (Build.VERSION.SDK_INT >= 34) {
        ServiceCompat.startForeground(
          this,
          NOTIFICATION_ID,
          createNotification(),
          ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        )
      } else {
        startForeground(NOTIFICATION_ID, createNotification())
      }
      true
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start foreground service", e)
      false
    }
  }
  
  /**
   * Android 15+: a dataSync service gets about six hours in the foreground per 24 hours,
   * counted from the last time the app was on screen. When they are used up the system calls
   * this, and kills the process with ForegroundServiceDidNotStopInTimeException when the
   * service is still in the foreground a few seconds later (Sentry REACT-NATIVE-HT). Never
   * called below API 35.
   */
  override fun onTimeout(startId: Int, fgsType: Int) {
    Log.w(TAG, "Foreground time limit reached, leaving the foreground")

    // Left explicitly, not through stopSelf(): the module's binding keeps a stopped service
    // up, and in the foreground with it.
    synchronized(this) {
      foreground.onTimeout()
      releaseWakeLock()
    }
    // With the start id, so that a start command still on its way is not stopped unanswered.
    stopSelf(startId)

    // Outside the lock: the module takes its own, and holds it when it calls
    // syncActiveDownloads().
    onForegroundTimeLimit?.invoke()
  }

  override fun onDestroy() {
    releaseWakeLock()
    Log.d(TAG, "DownloadService destroyed")
    super.onDestroy()
  }
  
  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Downloads",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Video download progress"
        setShowBadge(false)
      }
      
      val notificationManager = getSystemService(NotificationManager::class.java)
      notificationManager.createNotificationChannel(channel)
    }
  }
  
  private fun createNotification(): Notification {
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(currentDownloadTitle)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
    
    if (currentProgress > 0) {
      builder.setProgress(100, currentProgress, false)
        .setContentText("$currentProgress% complete")
    } else {
      builder.setProgress(100, 0, true)
        .setContentText("Starting...")
    }
    
    return builder.build()
  }
  
  /**
   * The module owns the task list and is the only source of truth for how many
   * downloads are running; the wake lock and the foreground notification follow
   * it. Synchronized because downloads start on the JS thread and finish on
   * OkHttp dispatcher threads.
   */
  @Synchronized
  fun syncActiveDownloads(count: Int) {
    activeDownloadCount = count
    Log.d(TAG, "Active downloads: $activeDownloadCount")
    if (activeDownloadCount > 0) acquireWakeLock() else releaseWakeLock()
    if (!foreground.onActiveDownloads(activeDownloadCount)) {
      stopSelf()
    }
  }

  private fun acquireWakeLock() {
    val lock = wakeLock ?: return
    if (!lock.isHeld) {
      // No timeout: downloads can run for hours, the count bounds this instead.
      lock.acquire()
      Log.d(TAG, "Wake lock acquired")
    }
  }

  private fun releaseWakeLock() {
    val lock = wakeLock ?: return
    if (lock.isHeld) {
      lock.release()
      Log.d(TAG, "Wake lock released")
    }
  }
  
  fun updateProgress(title: String, progress: Int) {
    currentDownloadTitle = title
    currentProgress = progress
    
    val notificationManager = getSystemService(NotificationManager::class.java)
    notificationManager.notify(NOTIFICATION_ID, createNotification())
  }
}


