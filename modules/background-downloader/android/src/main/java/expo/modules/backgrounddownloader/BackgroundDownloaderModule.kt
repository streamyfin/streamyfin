package expo.modules.backgrounddownloader

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*
import java.io.File

data class DownloadTaskInfo(
  val url: String,
  val destinationPath: String?,
  var retryCount: Int = 0
)

class BackgroundDownloaderModule : Module() {
  companion object {
    private const val TAG = "BackgroundDownloader"
    private const val MAX_RETRIES = 3
    private const val RETRY_BASE_DELAY_MS = 2000L
  }

  private val context
    get() = requireNotNull(appContext.reactContext)

  private val downloadManager = OkHttpDownloadManager()
  private val downloadTasks = mutableMapOf<Int, DownloadTaskInfo>()
  private val downloadQueue = mutableListOf<Pair<String, String?>>()
  private var taskIdCounter = 1
  private var downloadService: DownloadService? = null
  private var serviceBound = false
  
  // Track bytes downloaded per task for resume support
  private val bytesDownloadedByTask = mutableMapOf<Int, Long>()
  private val retryScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

  private val serviceConnection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
      Log.d(TAG, "Service connected")
      val binder = service as DownloadService.DownloadServiceBinder
      downloadService = binder.getService()
      serviceBound = true
    }

    override fun onServiceDisconnected(name: ComponentName?) {
      Log.d(TAG, "Service disconnected")
      downloadService = null
      serviceBound = false
    }
  }

  override fun definition() = ModuleDefinition {
    Name("BackgroundDownloader")

    Events(
      "onDownloadProgress",
      "onDownloadComplete",
      "onDownloadError",
      "onDownloadStarted",
      "onDownloadPaused",
      "onDownloadResumed"
    )

    OnCreate {
      Log.d(TAG, "Module created")
    }

    OnDestroy {
      Log.d(TAG, "Module destroyed")
      retryScope.cancel()
      downloadManager.cancelAllDownloads()
      if (serviceBound) {
        try {
          context.unbindService(serviceConnection)
          serviceBound = false
        } catch (e: Exception) {
          Log.e(TAG, "Error unbinding service: ${e.message}")
        }
      }
    }

    AsyncFunction("startDownload") { urlString: String, destinationPath: String?, promise: Promise ->
      try {
        val taskId = startDownloadInternal(urlString, destinationPath)
        promise.resolve(taskId)
      } catch (e: Exception) {
        promise.reject("DOWNLOAD_ERROR", "Failed to start download: ${e.message}", e)
      }
    }

    AsyncFunction("downloadChunk") { urlString: String, destinationPath: String, startByte: Long, endByte: Long, promise: Promise ->
      try {
        val client = okhttp3.OkHttpClient.Builder()
            .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
            .build()
        
        val request = okhttp3.Request.Builder()
            .url(urlString)
            .addHeader("Range", "bytes=$startByte-$endByte")
            .build()
            
        val response = client.newCall(request).execute()
        
        if (!response.isSuccessful && response.code != 206) {
            promise.reject("DOWNLOAD_ERROR", "HTTP error: ${response.code}", null)
            return@AsyncFunction
        }

        // If a specific range chunk was requested, we MUST receive a 206 Partial Content.
        // A 200 OK means the server ignored the Range header and is sending the entire file.
        // Appending the entire file on every chunk request will corrupt the file!
        if (startByte > 0 && response.code != 206) {
            promise.reject("DOWNLOAD_ERROR", "Server does not support Range requests. Received HTTP ${response.code} for a partial request.", null)
            return@AsyncFunction
        }
        
        val body = response.body
        if (body == null) {
            promise.reject("DOWNLOAD_ERROR", "Empty response body", null)
            return@AsyncFunction
        }
        
        val destFile = java.io.File(destinationPath)
        val destDir = destFile.parentFile
        if (destDir != null && !destDir.exists()) {
            destDir.mkdirs()
        }
        
        // Only append if we are explicitly asking for a chunk > 0.
        // If startByte == 0, we should overwrite the file entirely in case it's a new download or a restart.
        val appendMode = startByte > 0L && destFile.exists()
        java.io.FileOutputStream(destFile, appendMode).use { outputStream ->
            body.byteStream().use { inputStream ->
                val bytesWritten = inputStream.copyTo(outputStream)
                promise.resolve(bytesWritten)
            }
        }
      } catch (e: Exception) {
        promise.reject("DOWNLOAD_ERROR", "Failed to download chunk: ${e.message}", e)
      }
    }

    AsyncFunction("enqueueDownload") { urlString: String, destinationPath: String?, promise: Promise ->
      try {
        Log.d(TAG, "Enqueuing download: url=$urlString")
        
        // Add to queue
        val wasEmpty = downloadQueue.isEmpty()
        downloadQueue.add(Pair(urlString, destinationPath))
        Log.d(TAG, "Queue size: ${downloadQueue.size}")
        
        // If queue was empty and no active downloads, start processing immediately
        if (wasEmpty && downloadTasks.isEmpty()) {
          val taskId = processNextInQueue()
          promise.resolve(taskId)
        } else {
          // Return placeholder taskId for queued items
          promise.resolve(-1)
        }
      } catch (e: Exception) {
        promise.reject("DOWNLOAD_ERROR", "Failed to enqueue download: ${e.message}", e)
      }
    }

    Function("cancelDownload") { taskId: Int ->
      Log.d(TAG, "Cancelling download: taskId=$taskId")
      downloadManager.cancelDownload(taskId)
      downloadTasks.remove(taskId)
      bytesDownloadedByTask.remove(taskId)
      downloadService?.stopDownload()
      
      // Process next item in queue after cancellation
      processNextInQueue()
    }

    Function("cancelQueuedDownload") { url: String ->
      // Remove from queue by URL
      downloadQueue.removeAll { queuedItem ->
        queuedItem.first == url
      }
      Log.d(TAG, "Removed queued download: $url, queue size: ${downloadQueue.size}")
    }

    Function("cancelAllDownloads") {
      Log.d(TAG, "Cancelling all downloads")
      retryScope.coroutineContext.cancelChildren()
      downloadManager.cancelAllDownloads()
      downloadTasks.clear()
      downloadQueue.clear()
      bytesDownloadedByTask.clear()
      stopDownloadService()
    }
    
    Function("pauseDownload") { taskId: Int ->
      Log.d(TAG, "Pausing download: taskId=$taskId")
      val taskInfo = downloadTasks[taskId]
      val bytesDownloaded = bytesDownloadedByTask[taskId] ?: 0L
      
      // Cancel the OkHttp call but keep the partial file
      downloadManager.cancelDownload(taskId)
      
      // Don't remove task info — we need it for resume
      // Don't remove bytesDownloaded — we need it for resume
      
      sendEvent("onDownloadPaused", mapOf(
        "taskId" to taskId,
        "url" to (taskInfo?.url ?: ""),
        "bytesDownloaded" to bytesDownloaded
      ))
      
      downloadService?.stopDownload()
    }
    
    AsyncFunction("resumeDownload") { taskId: Int, promise: Promise ->
      Log.d(TAG, "Resuming download: taskId=$taskId")
      val taskInfo = downloadTasks[taskId]
      
      if (taskInfo == null) {
        promise.reject("RESUME_ERROR", "No task info found for taskId=$taskId", null)
        return@AsyncFunction
      }
      
      val destinationPath = taskInfo.destinationPath
      if (destinationPath == null) {
        promise.reject("RESUME_ERROR", "No destination path for taskId=$taskId", null)
        return@AsyncFunction
      }
      
      // Check how many bytes we already have
      val destFile = File(destinationPath)
      val existingBytes = if (destFile.exists()) destFile.length() else 0L
      
      Log.d(TAG, "Resume from byte: $existingBytes")
      
      // Remove old task entry and create new one
      downloadTasks.remove(taskId)
      bytesDownloadedByTask.remove(taskId)
      
      val newTaskId = taskIdCounter++
      downloadTasks[newTaskId] = DownloadTaskInfo(
        url = taskInfo.url,
        destinationPath = destinationPath
      )
      bytesDownloadedByTask[newTaskId] = existingBytes
      
      // Start foreground service
      startDownloadService()
      downloadService?.startDownload()
      
      sendEvent("onDownloadResumed", mapOf(
        "taskId" to newTaskId,
        "url" to taskInfo.url,
        "bytesDownloaded" to existingBytes
      ))
      
      // Start download with resume
      downloadManager.startDownload(
        taskId = newTaskId,
        url = taskInfo.url,
        destinationPath = destinationPath,
        resumeFromBytes = existingBytes,
        onProgress = { bytesWritten, totalBytes ->
          handleProgress(newTaskId, bytesWritten, totalBytes)
        },
        onComplete = { filePath ->
          handleDownloadComplete(newTaskId, filePath)
        },
        onError = { error, partialBytes, isResumable ->
          handleError(newTaskId, error, partialBytes, isResumable)
        }
      )
      
      promise.resolve(newTaskId)
    }

    AsyncFunction("getActiveDownloads") { promise: Promise ->
      try {
        val activeDownloads = downloadTasks.map { (taskId, taskInfo) ->
          mapOf(
            "taskId" to taskId,
            "url" to taskInfo.url
          )
        }
        promise.resolve(activeDownloads)
      } catch (e: Exception) {
        promise.reject("ERROR", "Failed to get active downloads: ${e.message}", e)
      }
    }
  }

  private fun startDownloadInternal(urlString: String, destinationPath: String?): Int {
    val taskId = taskIdCounter++
    
    if (destinationPath == null) {
      throw IllegalArgumentException("Destination path is required")
    }
    
    downloadTasks[taskId] = DownloadTaskInfo(
      url = urlString,
      destinationPath = destinationPath
    )
    bytesDownloadedByTask[taskId] = 0L
    
    // Start foreground service if not running
    startDownloadService()
    downloadService?.startDownload()
    
    Log.d(TAG, "Starting download: taskId=$taskId, url=$urlString")
    
    // Send started event
    sendEvent("onDownloadStarted", mapOf(
      "taskId" to taskId,
      "url" to urlString
    ))
    
    // Start the download with OkHttp
    downloadManager.startDownload(
      taskId = taskId,
      url = urlString,
      destinationPath = destinationPath,
      onProgress = { bytesWritten, totalBytes ->
        handleProgress(taskId, bytesWritten, totalBytes)
      },
      onComplete = { filePath ->
        handleDownloadComplete(taskId, filePath)
      },
      onError = { error, partialBytes, isResumable ->
        handleError(taskId, error, partialBytes, isResumable)
      }
    )
    
    return taskId
  }

  private fun processNextInQueue(): Int {
    // Check if queue has items
    if (downloadQueue.isEmpty()) {
      Log.d(TAG, "Queue is empty")
      return -1
    }
    
    // Check if there are active downloads (one at a time)
    if (downloadTasks.isNotEmpty()) {
      Log.d(TAG, "Active downloads in progress (${downloadTasks.size}), waiting...")
      return -1
    }
    
    // Get next item from queue
    val (url, destinationPath) = downloadQueue.removeAt(0)
    Log.d(TAG, "Processing next in queue: $url")
    
    return try {
      startDownloadInternal(url, destinationPath)
    } catch (e: Exception) {
      Log.e(TAG, "Error processing queue item: ${e.message}", e)
      // Try to process next item
      processNextInQueue()
    }
  }

  private fun handleProgress(taskId: Int, bytesWritten: Long, totalBytes: Long) {
    val progress = if (totalBytes > 0) {
      bytesWritten.toDouble() / totalBytes.toDouble()
    } else {
      0.0
    }
    
    // Track bytes downloaded for resume
    bytesDownloadedByTask[taskId] = bytesWritten
    
    // Update notification
    val taskInfo = downloadTasks[taskId]
    if (taskInfo != null) {
      val progressPercent = (progress * 100).toInt()
      downloadService?.updateProgress("Downloading video", progressPercent)
    }
    
    sendEvent("onDownloadProgress", mapOf(
      "taskId" to taskId,
      "bytesWritten" to bytesWritten,
      "totalBytes" to totalBytes,
      "progress" to progress
    ))
  }

  private fun handleDownloadComplete(taskId: Int, filePath: String) {
    val taskInfo = downloadTasks[taskId]
    
    if (taskInfo == null) {
      Log.e(TAG, "Download completed but task info not found: taskId=$taskId")
      return
    }
    
    Log.d(TAG, "Download completed: taskId=$taskId, filePath=$filePath")
    
    sendEvent("onDownloadComplete", mapOf(
      "taskId" to taskId,
      "filePath" to filePath,
      "url" to taskInfo.url
    ))
    
    downloadTasks.remove(taskId)
    bytesDownloadedByTask.remove(taskId)
    downloadService?.stopDownload()
    
    // Process next item in queue
    processNextInQueue()
  }

  private fun handleError(taskId: Int, error: String, partialBytes: Long, isResumable: Boolean) {
    val taskInfo = downloadTasks[taskId]
    
    // Check if we should auto-retry
    val currentRetryCount = taskInfo?.retryCount ?: 0
    val isTransientError = isTransientNetworkError(error)
    
    if (isTransientError && currentRetryCount < MAX_RETRIES) {
      val delay = RETRY_BASE_DELAY_MS * (1L shl currentRetryCount) // Exponential backoff
      downloadTasks[taskId]?.let { it -> 
        downloadTasks[taskId] = it.copy(retryCount = currentRetryCount + 1)
      }
      
      Log.d(TAG, "Auto-retrying task $taskId in ${delay}ms (attempt ${currentRetryCount + 1}/$MAX_RETRIES)")
      
      retryScope.launch {
        delay(delay)
        performRetry(taskId)
      }
      return
    }
    
    Log.e(TAG, "Download error: taskId=$taskId, error=$error, isResumable=$isResumable")
    
    sendEvent("onDownloadError", mapOf(
      "taskId" to taskId,
      "error" to error,
      "isResumable" to isResumable,
      "bytesDownloaded" to partialBytes
    ))
    
    // Don't clean up task info if resumable — user might want to resume later
    if (!isResumable) {
      downloadTasks.remove(taskId)
      bytesDownloadedByTask.remove(taskId)
    }
    downloadService?.stopDownload()
    
    // Process next item in queue
    processNextInQueue()
  }
  
  private fun isTransientNetworkError(error: String): Boolean {
    val lowerError = error.lowercase()
    return lowerError.contains("timeout") ||
           lowerError.contains("connection") ||
           lowerError.contains("network") ||
           lowerError.contains("unreachable") ||
           lowerError.contains("reset") ||
           lowerError.contains("broken pipe") ||
           lowerError.contains("stream was reset")
  }
  
  private fun performRetry(taskId: Int) {
    val taskInfo = downloadTasks[taskId] ?: return
    val destinationPath = taskInfo.destinationPath ?: return
    
    // Check for partial file
    val destFile = File(destinationPath)
    val existingBytes = if (destFile.exists()) destFile.length() else 0L
    
    Log.d(TAG, "Retrying download taskId=$taskId from byte $existingBytes")
    
    // Remove old task and create new one
    downloadTasks.remove(taskId)
    bytesDownloadedByTask.remove(taskId)
    
    val newTaskId = taskIdCounter++
    downloadTasks[newTaskId] = DownloadTaskInfo(
      url = taskInfo.url,
      destinationPath = destinationPath,
      retryCount = taskInfo.retryCount
    )
    bytesDownloadedByTask[newTaskId] = existingBytes
    
    // Start foreground service if needed
    startDownloadService()
    downloadService?.startDownload()
    
    sendEvent("onDownloadResumed", mapOf(
      "taskId" to newTaskId,
      "url" to taskInfo.url,
      "bytesDownloaded" to existingBytes
    ))
    
    downloadManager.startDownload(
      taskId = newTaskId,
      url = taskInfo.url,
      destinationPath = destinationPath,
      resumeFromBytes = existingBytes,
      onProgress = { bytesWritten, totalBytes ->
        handleProgress(newTaskId, bytesWritten, totalBytes)
      },
      onComplete = { filePath ->
        handleDownloadComplete(newTaskId, filePath)
      },
      onError = { error, partialBytes, isResumable ->
        handleError(newTaskId, error, partialBytes, isResumable)
      }
    )
  }

  private fun startDownloadService() {
    if (!serviceBound) {
      val intent = Intent(context, DownloadService::class.java)
      context.startForegroundService(intent)
      context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }
  }

  private fun stopDownloadService() {
    if (serviceBound && downloadTasks.isEmpty()) {
      try {
        context.unbindService(serviceConnection)
        serviceBound = false
        downloadService = null
        
        val intent = Intent(context, DownloadService::class.java)
        context.stopService(intent)
      } catch (e: Exception) {
        Log.e(TAG, "Error stopping service: ${e.message}")
      }
    }
  }
}
