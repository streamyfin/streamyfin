package expo.modules.backgrounddownloader

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class BackgroundDownloaderModule : Module() {
  companion object {
    private const val TAG = "BackgroundDownloader"
  }

  private val context
    get() = requireNotNull(appContext.reactContext)

  private val downloadManager: DownloadManager by lazy {
    context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  }

  private val downloadTasks = mutableMapOf<Long, DownloadTaskInfo>()
  private val progressHandler = Handler(Looper.getMainLooper())
  private val progressRunnables = mutableMapOf<Long, Runnable>()

  private val downloadCompleteReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val downloadId = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
      if (downloadId != -1L && downloadTasks.containsKey(downloadId)) {
        handleDownloadComplete(downloadId)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("BackgroundDownloader")

    Events(
      "onDownloadProgress",
      "onDownloadComplete",
      "onDownloadError",
      "onDownloadStarted"
    )

    OnCreate {
      registerDownloadReceiver()
    }

    OnDestroy {
      unregisterDownloadReceiver()
      progressRunnables.values.forEach { progressHandler.removeCallbacks(it) }
      progressRunnables.clear()
    }

    AsyncFunction("startDownload") { urlString: String, destinationPath: String?, promise: Promise ->
      try {
        val uri = Uri.parse(urlString)
        val request = DownloadManager.Request(uri).apply {
          setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
          setAllowedNetworkTypes(
            DownloadManager.Request.NETWORK_WIFI or DownloadManager.Request.NETWORK_MOBILE
          )
          setAllowedOverMetered(true)
          setAllowedOverRoaming(true)

          if (destinationPath != null) {
            val file = File(destinationPath)
            val fileName = file.name
            
            // Check if destination is in internal storage (starts with /data/data/ or /data/user/)
            // DownloadManager can't write to internal storage directly
            val isInternalPath = destinationPath.startsWith("/data/data/") || 
                                destinationPath.startsWith("/data/user/")
            
            if (isInternalPath) {
              // Download to external files dir, we'll move it later
              setDestinationInExternalFilesDir(
                context,
                null,
                fileName
              )
            } else {
              // External path - create directory and set destination
              val directory = file.parentFile
              if (directory != null && !directory.exists()) {
                directory.mkdirs()
              }
              setDestinationUri(Uri.fromFile(file))
            }
          } else {
            val fileName = uri.lastPathSegment ?: "download_${System.currentTimeMillis()}"
            setDestinationInExternalFilesDir(
              context,
              null,
              fileName
            )
          }
        }

        val downloadId = downloadManager.enqueue(request)
        
        downloadTasks[downloadId] = DownloadTaskInfo(
          url = urlString,
          destinationPath = destinationPath
        )

        startProgressTracking(downloadId)

        sendEvent("onDownloadStarted", mapOf(
          "taskId" to downloadId.toInt(),
          "url" to urlString
        ))

        promise.resolve(downloadId.toInt())
      } catch (e: Exception) {
        promise.reject("DOWNLOAD_ERROR", "Failed to start download: ${e.message}", e)
      }
    }

    Function("cancelDownload") { taskId: Int ->
      val downloadId = taskId.toLong()
      if (downloadTasks.containsKey(downloadId)) {
        downloadManager.remove(downloadId)
        stopProgressTracking(downloadId)
        downloadTasks.remove(downloadId)
      }
    }

    Function("cancelAllDownloads") {
      val downloadIds = downloadTasks.keys.toList()
      downloadIds.forEach { downloadId ->
        downloadManager.remove(downloadId)
        stopProgressTracking(downloadId)
      }
      downloadTasks.clear()
    }

    AsyncFunction("getActiveDownloads") { promise: Promise ->
      try {
        val activeDownloads = mutableListOf<Map<String, Any>>()
        
        downloadTasks.forEach { (downloadId, taskInfo) ->
          val query = DownloadManager.Query().setFilterById(downloadId)
          val cursor = downloadManager.query(query)
          
          if (cursor.moveToFirst()) {
            val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
            val status = if (statusIndex >= 0) cursor.getInt(statusIndex) else -1
            
            activeDownloads.add(mapOf(
              "taskId" to downloadId.toInt(),
              "url" to taskInfo.url,
              "state" to getStateString(status)
            ))
          }
          cursor.close()
        }
        
        promise.resolve(activeDownloads)
      } catch (e: Exception) {
        promise.reject("GET_DOWNLOADS_ERROR", "Failed to get active downloads: ${e.message}", e)
      }
    }
  }

  private fun registerDownloadReceiver() {
    val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      ContextCompat.registerReceiver(
        context,
        downloadCompleteReceiver,
        filter,
        ContextCompat.RECEIVER_NOT_EXPORTED
      )
    } else {
      context.registerReceiver(downloadCompleteReceiver, filter)
    }
  }

  private fun unregisterDownloadReceiver() {
    try {
      context.unregisterReceiver(downloadCompleteReceiver)
    } catch (e: IllegalArgumentException) {
      // Receiver not registered, ignore
    }
  }

  private fun startProgressTracking(downloadId: Long) {
    val runnable = object : Runnable {
      override fun run() {
        if (!downloadTasks.containsKey(downloadId)) {
          return
        }

        val query = DownloadManager.Query().setFilterById(downloadId)
        val cursor = downloadManager.query(query)

        if (cursor.moveToFirst()) {
          val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
          val status = if (statusIndex >= 0) cursor.getInt(statusIndex) else -1

          val bytesDownloadedIndex = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
          val bytesDownloaded = if (bytesDownloadedIndex >= 0) cursor.getLong(bytesDownloadedIndex) else 0L

          val totalBytesIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
          val totalBytes = if (totalBytesIndex >= 0) cursor.getLong(totalBytesIndex) else 0L

          if (status == DownloadManager.STATUS_RUNNING && totalBytes > 0) {
            val progress = bytesDownloaded.toDouble() / totalBytes.toDouble()
            
            sendEvent("onDownloadProgress", mapOf(
              "taskId" to downloadId.toInt(),
              "bytesWritten" to bytesDownloaded,
              "totalBytes" to totalBytes,
              "progress" to progress
            ))
          }

          // Check for errors
          if (status == DownloadManager.STATUS_FAILED) {
            val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
            val reason = if (reasonIndex >= 0) cursor.getInt(reasonIndex) else -1
            
            cursor.close()
            stopProgressTracking(downloadId)
            
            sendEvent("onDownloadError", mapOf(
              "taskId" to downloadId.toInt(),
              "error" to getErrorString(reason)
            ))
            
            downloadTasks.remove(downloadId)
            return
          }
        }

        cursor.close()

        // Continue tracking if still in progress
        if (downloadTasks.containsKey(downloadId)) {
          progressHandler.postDelayed(this, 500)
        }
      }
    }

    progressRunnables[downloadId] = runnable
    progressHandler.post(runnable)
  }

  private fun stopProgressTracking(downloadId: Long) {
    progressRunnables[downloadId]?.let { runnable ->
      progressHandler.removeCallbacks(runnable)
      progressRunnables.remove(downloadId)
    }
  }

  private fun handleDownloadComplete(downloadId: Long) {
    stopProgressTracking(downloadId)

    val taskInfo = downloadTasks[downloadId]
    if (taskInfo == null) {
      return
    }

    val query = DownloadManager.Query().setFilterById(downloadId)
    val cursor = downloadManager.query(query)

    if (cursor.moveToFirst()) {
      val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
      val status = if (statusIndex >= 0) cursor.getInt(statusIndex) else -1

      if (status == DownloadManager.STATUS_SUCCESSFUL) {
        val uriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
        val localUri = if (uriIndex >= 0) cursor.getString(uriIndex) else null

        if (localUri != null) {
          var finalFilePath = Uri.parse(localUri).path ?: localUri
          
          // If we have a custom destination path for internal storage, move the file
          if (taskInfo.destinationPath != null) {
            val isInternalPath = taskInfo.destinationPath.startsWith("/data/data/") || 
                                taskInfo.destinationPath.startsWith("/data/user/")
            
            if (isInternalPath) {
              try {
                val sourceFile = File(finalFilePath)
                val destFile = File(taskInfo.destinationPath)
                
                // Create destination directory if needed
                val destDir = destFile.parentFile
                if (destDir != null && !destDir.exists()) {
                  destDir.mkdirs()
                }
                
                // Move file to internal storage
                if (sourceFile.renameTo(destFile)) {
                  finalFilePath = taskInfo.destinationPath
                  Log.d(TAG, "Moved file to internal storage: $finalFilePath")
                } else {
                  // If rename fails, try copy and delete
                  sourceFile.copyTo(destFile, overwrite = true)
                  sourceFile.delete()
                  finalFilePath = taskInfo.destinationPath
                  Log.d(TAG, "Copied file to internal storage: $finalFilePath")
                }
              } catch (e: Exception) {
                Log.e(TAG, "Failed to move file to internal storage: ${e.message}", e)
                sendEvent("onDownloadError", mapOf(
                  "taskId" to downloadId.toInt(),
                  "error" to "Failed to move file to destination: ${e.message}"
                ))
                cursor.close()
                downloadTasks.remove(downloadId)
                return
              }
            }
          }
          
          sendEvent("onDownloadComplete", mapOf(
            "taskId" to downloadId.toInt(),
            "filePath" to finalFilePath,
            "url" to taskInfo.url
          ))
        } else {
          sendEvent("onDownloadError", mapOf(
            "taskId" to downloadId.toInt(),
            "error" to "Could not retrieve downloaded file path"
          ))
        }
      } else if (status == DownloadManager.STATUS_FAILED) {
        val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
        val reason = if (reasonIndex >= 0) cursor.getInt(reasonIndex) else -1
        
        sendEvent("onDownloadError", mapOf(
          "taskId" to downloadId.toInt(),
          "error" to getErrorString(reason)
        ))
      }
    }

    cursor.close()
    downloadTasks.remove(downloadId)
  }

  private fun getStateString(status: Int): String {
    return when (status) {
      DownloadManager.STATUS_RUNNING -> "running"
      DownloadManager.STATUS_PAUSED -> "suspended"
      DownloadManager.STATUS_PENDING -> "suspended"
      DownloadManager.STATUS_SUCCESSFUL -> "completed"
      DownloadManager.STATUS_FAILED -> "completed"
      else -> "unknown"
    }
  }

  private fun getErrorString(reason: Int): String {
    return when (reason) {
      DownloadManager.ERROR_CANNOT_RESUME -> "Cannot resume download"
      DownloadManager.ERROR_DEVICE_NOT_FOUND -> "No external storage device found"
      DownloadManager.ERROR_FILE_ALREADY_EXISTS -> "File already exists"
      DownloadManager.ERROR_FILE_ERROR -> "Storage error"
      DownloadManager.ERROR_HTTP_DATA_ERROR -> "HTTP data error"
      DownloadManager.ERROR_INSUFFICIENT_SPACE -> "Insufficient storage space"
      DownloadManager.ERROR_TOO_MANY_REDIRECTS -> "Too many redirects"
      DownloadManager.ERROR_UNHANDLED_HTTP_CODE -> "Unhandled HTTP response code"
      DownloadManager.ERROR_UNKNOWN -> "Unknown error"
      else -> "Download failed (code: $reason)"
    }
  }
}

data class DownloadTaskInfo(
  val url: String,
  val destinationPath: String?
)

