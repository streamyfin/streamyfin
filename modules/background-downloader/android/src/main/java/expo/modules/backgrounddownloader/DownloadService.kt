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
  private var bundleActive = false
  private var bundleRemuxing = false
  private var foregroundType = 0
  private var currentDownloadTitle = "Preparing download..."
  private var currentProgress = 0
  private var isForegroundStarted = false
  private var wakeLock: PowerManager.WakeLock? = null

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

    // There is no boot receiver. Uptime cannot distinguish a user starting a download shortly
    // after boot from BOOT_COMPLETED; let the platform enforce actual foreground restrictions.
    bundleRemuxing = DownloadBundleManager.get(this).needsMediaProcessing()
    if (!startForegroundSafely()) return START_NOT_STICKY
    DownloadBundleManager.get(this).onServiceReady(this)
    return START_STICKY
  }

  /**
   * Start foreground service safely with proper service type for Android 14+
   */
  private fun startForegroundSafely(): Boolean {
    val type = if (Build.VERSION.SDK_INT >= 35 && bundleRemuxing) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING or
        if (activeDownloadCount > 0) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
    } else {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    }
    if (isForegroundStarted && foregroundType == type) return true

    return try {
      if (Build.VERSION.SDK_INT >= 34) {
        ServiceCompat.startForeground(
          this,
          NOTIFICATION_ID,
          createNotification(),
          type
        )
      } else {
        startForeground(NOTIFICATION_ID, createNotification())
      }
      isForegroundStarted = true
      foregroundType = type
      true
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start foreground service", e)
      // If we can't start foreground, stop the service
      stopSelf()
      false
    }
  }
  
  override fun onDestroy() {
    DownloadBundleManager.get(this).onServiceStopped(this, "Download service stopped; reopen the app to resume")
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
  
  /** The native manager combines bridge-owned single transfers and bridge-independent bundles. */
  @Synchronized
  internal fun syncBundleActivity(active: Boolean, remuxing: Boolean, normalCount: Int) {
    bundleActive = active
    bundleRemuxing = remuxing
    activeDownloadCount = normalCount
    syncWork()
  }

  private fun syncWork() {
    Log.d(TAG, "Active downloads: $activeDownloadCount")
    if (activeDownloadCount > 0 || bundleActive) {
      acquireWakeLock()
      if (!startForegroundSafely()) {
        // Do not run a mux without a granted foreground-service type.
        DownloadBundleManager.get(this).onServiceStopped(this, "Background execution unavailable; reopen the app to resume")
      }
      return
    }
    releaseWakeLock()
    if (isForegroundStarted) {
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      isForegroundStarted = false
    }
    stopSelf()
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    // Android 15 gives only a few seconds to stop after the dataSync/mediaProcessing quota.
    // Cancellation is cooperative; persist inputs and stop the service immediately, not after mux.
    releaseWakeLock()
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    isForegroundStarted = false
    stopSelf()
    DownloadBundleManager.get(this).onServiceStopped(this, "Background execution expired; reopen the app to resume")
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
