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
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class DownloadService : Service() {
  private val TAG = "DownloadService"
  private val NOTIFICATION_ID = 1001
  private val CHANNEL_ID = "download_channel"

  // Time threshold to detect if we're in boot context (10 minutes after boot)
  private val BOOT_THRESHOLD_MS = 10 * 60 * 1000L

  private val binder = DownloadServiceBinder()
  private var activeDownloadCount = 0
  private var currentDownloadTitle = "Preparing download..."
  private var currentProgress = 0
  private var isForegroundStarted = false

  inner class DownloadServiceBinder : Binder() {
    fun getService(): DownloadService = this@DownloadService
  }

  override fun onCreate() {
    super.onCreate()
    Log.d(TAG, "DownloadService created")
    createNotificationChannel()
  }

  override fun onBind(intent: Intent?): IBinder {
    Log.d(TAG, "DownloadService bound")
    return binder
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    Log.d(TAG, "DownloadService started")

    // On Android 15+, dataSync foreground services cannot be started from BOOT_COMPLETED context
    // Check if we're likely in a boot context and skip foreground start if so
    if (Build.VERSION.SDK_INT >= 35 && isLikelyBootContext()) {
      Log.w(TAG, "Skipping foreground start - likely boot context on Android 15+")
      stopSelf()
      return START_NOT_STICKY
    }

    startForegroundSafely()
    return START_STICKY
  }

  /**
   * Check if we're likely in a boot context by checking system uptime.
   * If the system has been up for less than the threshold, we might be in boot context.
   */
  private fun isLikelyBootContext(): Boolean {
    val uptimeMs = SystemClock.elapsedRealtime()
    return uptimeMs < BOOT_THRESHOLD_MS
  }

  /**
   * Start foreground service safely with proper service type for Android 14+
   */
  private fun startForegroundSafely() {
    if (isForegroundStarted) return

    try {
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
      isForegroundStarted = true
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start foreground service", e)
      // If we can't start foreground, stop the service
      stopSelf()
    }
  }
  
  override fun onDestroy() {
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
  
  fun startDownload() {
    activeDownloadCount++
    Log.d(TAG, "Download started, active count: $activeDownloadCount")
    if (activeDownloadCount == 1) {
      startForegroundSafely()
    }
  }
  
  fun stopDownload() {
    activeDownloadCount = maxOf(0, activeDownloadCount - 1)
    Log.d(TAG, "Download stopped, active count: $activeDownloadCount")
    if (activeDownloadCount == 0) {
      if (isForegroundStarted) {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        isForegroundStarted = false
      }
      stopSelf()
    }
  }
  
  fun updateProgress(title: String, progress: Int) {
    currentDownloadTitle = title
    currentProgress = progress
    
    val notificationManager = getSystemService(NotificationManager::class.java)
    notificationManager.notify(NOTIFICATION_ID, createNotification())
  }
}


