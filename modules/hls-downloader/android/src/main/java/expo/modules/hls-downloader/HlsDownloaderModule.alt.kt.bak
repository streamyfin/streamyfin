package expo.modules.hlsdownloader

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import androidx.work.*
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.CoroutineWorker
import androidx.work.WorkRequest
import androidx.work.WorkManager
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import kotlinx.coroutines.async
import android.content.pm.ServiceInfo
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import androidx.work.ExistingWorkPolicy
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.net.URL

class HlsDownloaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HlsDownloader")

    Events(
      "onProgress",
      "onComplete",
      "onError"
    )

    AsyncFunction("downloadHLSAsset") { id: String, url: String, _: Map<String, Any> ->
      val context = appContext.reactContext ?: throw Exception("React context is null")
      val data = workDataOf("id" to id, "url" to url)
      val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

      val work = OneTimeWorkRequestBuilder<HlsDownloadWorker>()
        .setInputData(data)
        .setConstraints(constraints)
        .addTag(id)
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .build()

      WorkManager.getInstance(context).enqueueUniqueWork(
        id, ExistingWorkPolicy.REPLACE, work
      )
    }

    AsyncFunction("cancelDownload") { id: String ->
      val context = appContext.reactContext ?: throw Exception("React context is null")
      WorkManager.getInstance(context).cancelUniqueWork(id)
    }

    AsyncFunction("getActiveDownloads") {
      emptyList<Map<String, Any>>()
    }
  }

  private fun createNotification(context: Context): Notification {
    val channelId = "hls_download_channel"
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "HLS Download", NotificationManager.IMPORTANCE_LOW)
      )
    }
    return NotificationCompat.Builder(context, channelId)
      .setContentTitle("Downloading HLS Stream")
      .setContentText("Downloading segments in background")
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setForegroundServiceType(Notification.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      .build()
  }
}


class HlsDownloadWorker(
  context: Context,
  params: WorkerParameters
) : CoroutineWorker(context, params) {

  private val client = OkHttpClient()

  override suspend fun doWork() = coroutineScope {
    val id = inputData.getString("id") ?: return@coroutineScope failure()
    val url = inputData.getString("url") ?: return@coroutineScope failure()
    val downloadDir = File(applicationContext.filesDir, "downloads/$id")
    downloadDir.mkdirs()

    // Create ForegroundInfo without the service type
    val foregroundInfo = ForegroundInfo(
      1,
      createNotification(applicationContext)
    )
    setForeground(foregroundInfo)

    try {
      // Download master/variant playlist.
      val playlistText = client.newCall(Request.Builder().url(url).build()).execute()
        .takeIf { it.isSuccessful }?.body?.string() ?: throw Exception("Playlist fetch failed")
      val lines = playlistText.lines()

      // Extract segment and key URIs.
      val segmentUrls = mutableListOf<Pair<String, String>>() // (orig line, absolute URL)
      val keyLines = mutableListOf<Pair<String, String>>() // (orig line, absolute key URL)
      lines.forEach { line ->
        when {
          line.startsWith("#EXT-X-KEY") -> {
            Regex("URI=\"(.*?)\"").find(line)?.groupValues?.get(1)?.let { keyUri ->
              val absKey = URL(URL(url), keyUri).toString()
              keyLines.add(line to absKey)
            }
          }
          line.isNotBlank() && !line.startsWith("#") -> {
            val absSegment = URL(URL(url), line).toString()
            segmentUrls.add(line to absSegment)
          }
        }
      }

      // Concurrent downloads.
      val segResults = segmentUrls.map { (orig, segUrl) ->
        async {
          val resp = client.newCall(Request.Builder().url(segUrl).build()).execute()
          if (!resp.isSuccessful) throw Exception("Segment download failed: $segUrl")
          val fileName = segUrl.substringAfterLast("/")
          File(downloadDir, fileName).writeBytes(resp.body?.bytes() ?: ByteArray(0))
          orig to fileName
        }
      }
      val keyResults = keyLines.map { (orig, keyUrl) ->
        async {
          val resp = client.newCall(Request.Builder().url(keyUrl).build()).execute()
          if (!resp.isSuccessful) throw Exception("Key download failed: $keyUrl")
          val fileName = keyUrl.substringAfterLast("/")
          File(downloadDir, fileName).writeBytes(resp.body?.bytes() ?: ByteArray(0))
          orig to fileName
        }
      }
      val segMap = segResults.awaitAll().toMap()
      val keyMap = keyResults.awaitAll().toMap()

      // Rebuild playlist with local URIs.
      val localPlaylist = lines.joinToString("\n") { line ->
        when {
          line.isNotBlank() && !line.startsWith("#") -> segMap[line] ?: line
          line.startsWith("#EXT-X-KEY") ->
            keyMap[line]?.let { localKey ->
              line.replace(Regex("URI=\"(.*?)\""), "URI=\"$localKey\"")
            } ?: line
          else -> line
        }
      }
      File(downloadDir, "local_playlist.m3u8").writeText(localPlaylist)
      success()
    } catch (e: Exception) {
      e.printStackTrace()
      failure()
    }
  }

  private fun createNotification(context: Context): Notification {
    val channelId = "hls_download_channel"
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "HLS Download", NotificationManager.IMPORTANCE_LOW)
      )
    }
    return NotificationCompat.Builder(context, channelId)
      .setContentTitle("Downloading HLS Stream")
      .setContentText("Downloading segments in background")
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setForegroundServiceType(Notification.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      .build()
  }

  private fun success() = Result.success()
  private fun failure() = Result.failure()
}