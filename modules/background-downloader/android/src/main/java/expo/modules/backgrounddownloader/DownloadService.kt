package expo.modules.backgrounddownloader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

class DownloadService : Service() {
  private val TAG = "DownloadService"
  private val NOTIFICATION_ID = 1001
  private val CHANNEL_ID = "download_channel"
  
  private val binder = DownloadServiceBinder()
  private var activeDownloadCount = 0
  private var currentDownloadTitle = "Preparing download..."
  private var currentProgress = 0
  
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
    startForeground(NOTIFICATION_ID, createNotification())
    return START_STICKY
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
      startForeground(NOTIFICATION_ID, createNotification())
    }
  }
  
  fun stopDownload() {
    activeDownloadCount = maxOf(0, activeDownloadCount - 1)
    Log.d(TAG, "Download stopped, active count: $activeDownloadCount")
    if (activeDownloadCount == 0) {
      stopForeground(STOP_FOREGROUND_REMOVE)
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


