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
      Log.d(TAG, "Broadcast received for downloadId: $downloadId, action: ${intent?.action}")
      
      if (downloadId != -1L && downloadTasks.containsKey(downloadId)) {
        Log.d(TAG, "Calling handleDownloadComplete for task: $downloadId")
        handleDownloadComplete(downloadId)
      } else if (downloadId != -1L) {
        Log.w(TAG, "Received broadcast for unknown downloadId: $downloadId (not in our task map)")
      } else {
        Log.w(TAG, "Received broadcast with invalid downloadId: $downloadId")
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
          Log.d(TAG, "Task $downloadId no longer in map, stopping progress tracking")
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

          val statusString = when (status) {
            DownloadManager.STATUS_RUNNING -> "RUNNING"
            DownloadManager.STATUS_PAUSED -> "PAUSED"
            DownloadManager.STATUS_PENDING -> "PENDING"
            DownloadManager.STATUS_SUCCESSFUL -> "SUCCESSFUL"
            DownloadManager.STATUS_FAILED -> "FAILED"
            else -> "UNKNOWN($status)"
          }

          // Log status periodically for debugging
          val progress = if (totalBytes > 0) (bytesDownloaded.toDouble() / totalBytes.toDouble() * 100).toInt() else 0
          if (progress % 10 == 0 || status != DownloadManager.STATUS_RUNNING) {
            Log.d(TAG, "Task $downloadId: status=$statusString, progress=$progress%, bytes=$bytesDownloaded/$totalBytes")
          }

          if (status == DownloadManager.STATUS_RUNNING && totalBytes > 0) {
            val progressRatio = bytesDownloaded.toDouble() / totalBytes.toDouble()
            
            sendEvent("onDownloadProgress", mapOf(
              "taskId" to downloadId.toInt(),
              "bytesWritten" to bytesDownloaded,
              "totalBytes" to totalBytes,
              "progress" to progressRatio
            ))
          }

          // Check if download completed but broadcast was missed
          if (status == DownloadManager.STATUS_SUCCESSFUL) {
            Log.w(TAG, "Task $downloadId: Download is SUCCESSFUL but completion handler wasn't called! Calling manually.")
            cursor.close()
            stopProgressTracking(downloadId)
            handleDownloadComplete(downloadId)
            return
          }

          // Check for errors
          if (status == DownloadManager.STATUS_FAILED) {
            val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
            val reason = if (reasonIndex >= 0) cursor.getInt(reasonIndex) else -1
            
            Log.e(TAG, "Task $downloadId: Download FAILED with reason code: $reason")
            
            cursor.close()
            stopProgressTracking(downloadId)
            
            sendEvent("onDownloadError", mapOf(
              "taskId" to downloadId.toInt(),
              "error" to getErrorString(reason)
            ))
            
            downloadTasks.remove(downloadId)
            return
          }

          // Check if download is paused or pending for too long
          if (status == DownloadManager.STATUS_PAUSED || status == DownloadManager.STATUS_PENDING) {
            Log.w(TAG, "Task $downloadId: Download is $statusString")
          }
        } else {
          Log.e(TAG, "Task $downloadId: No cursor data found in DownloadManager")
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
          val downloadedFilePath = Uri.parse(localUri).path ?: localUri
          
          // If we have a custom destination path for internal storage, move the file in background
          if (taskInfo.destinationPath != null) {
            val isInternalPath = taskInfo.destinationPath.startsWith("/data/data/") || 
                                taskInfo.destinationPath.startsWith("/data/user/")
            
            if (isInternalPath) {
              Log.d(TAG, "Starting file move in background thread for taskId: ${downloadId.toInt()}")
              
              // Move file in background thread to avoid blocking
              Thread {
                try {
                  val sourceFile = File(downloadedFilePath)
                  val destFile = File(taskInfo.destinationPath)
                  
                  Log.d(TAG, "Moving file from $downloadedFilePath to ${taskInfo.destinationPath}")
                  
                  // Create destination directory if needed
                  val destDir = destFile.parentFile
                  if (destDir != null && !destDir.exists()) {
                    destDir.mkdirs()
                  }
                  
                  // Try to move file (fast if on same filesystem)
                  val moveSuccessful = sourceFile.renameTo(destFile)
                  
                  if (moveSuccessful) {
                    Log.d(TAG, "File moved successfully via rename")
                    
                    sendEvent("onDownloadComplete", mapOf(
                      "taskId" to downloadId.toInt(),
                      "filePath" to taskInfo.destinationPath,
                      "url" to taskInfo.url
                    ))
                  } else {
                    // Rename failed (likely different filesystems), need to copy
                    Log.d(TAG, "Rename failed, copying file (this may take a while for large files)")
                    
                    sourceFile.inputStream().use { input ->
                      destFile.outputStream().use { output ->
                        input.copyTo(output)
                      }
                    }
                    
                    // Delete source file after successful copy
                    if (sourceFile.delete()) {
                      Log.d(TAG, "File copied and source deleted successfully")
                    } else {
                      Log.w(TAG, "File copied but failed to delete source file")
                    }
                    
                    sendEvent("onDownloadComplete", mapOf(
                      "taskId" to downloadId.toInt(),
                      "filePath" to taskInfo.destinationPath,
                      "url" to taskInfo.url
                    ))
                  }
                } catch (e: Exception) {
                  Log.e(TAG, "Failed to move file to internal storage: ${e.message}", e)
                  sendEvent("onDownloadError", mapOf(
                    "taskId" to downloadId.toInt(),
                    "error" to "Failed to move file to destination: ${e.message}"
                  ))
                }
              }.start()
              
              cursor.close()
              downloadTasks.remove(downloadId)
              return
            }
          }
          
          // No internal path or external path - send completion immediately
          sendEvent("onDownloadComplete", mapOf(
            "taskId" to downloadId.toInt(),
            "filePath" to downloadedFilePath,
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

