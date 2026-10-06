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
import java.io.File

data class DownloadTaskInfo(
  val url: String,
  val destinationPath: String?,
  val itemId: String? = null,
  /** Custom proxy auth headers for a server behind an access gateway. */
  val headers: Map<String, String>? = null
)

private data class QueuedDownload(
  val url: String,
  val destinationPath: String?,
  val itemId: String?,
  val headers: Map<String, String>?
)

class BackgroundDownloaderModule : Module() {
  companion object {
    private const val TAG = "BackgroundDownloader"

    /**
     * What a download fails with when Android ends the foreground time it ran on. JS files an
     * error by its wording (classifyDownloadError), and "timed out" is what keeps this one with
     * the failures of the user's environment: downloadErrors.test.ts pins this text.
     */
    private const val FOREGROUND_TIME_LIMIT_ERROR =
      "Download timed out: Android's daily time limit for background downloads was reached"
  }

  private val context
    get() = requireNotNull(appContext.reactContext)

  private val downloadManager = OkHttpDownloadManager()

  /// Guards all mutable download state below. The module is entered from the JS thread (function
  /// bodies) and from OkHttp dispatcher threads (download callbacks); the collections must never
  /// be touched from two of them at once. Methods suffixed `Locked` assume the lock is held.
  private val stateLock = Any()
  private val downloadTasks = mutableMapOf<Int, DownloadTaskInfo>()
  private val downloadQueue = mutableListOf<QueuedDownload>()
  private var taskIdCounter = 1

  /**
   * Set when Android ended the service's foreground time, cleared when the app is on screen
   * again, which is also what resets the limit. The queue does not advance in between: a
   * download started then would run in a process the system may freeze or kill at any moment.
   */
  private var queueHeldForTimeLimit = false

  @Volatile
  private var downloadService: DownloadService? = null
  @Volatile
  private var serviceBound = false

  private val serviceConnection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
      Log.d(TAG, "Service connected")
      val binder = service as DownloadService.DownloadServiceBinder
      synchronized(stateLock) {
        downloadService = binder.getService().also {
          it.onForegroundTimeLimit = { handleForegroundTimeLimit() }
        }
        serviceBound = true
        // bindService is async, so the first download could not reach the service.
        syncServiceLocked()
      }
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
      "onDownloadStarted"
    )

    OnCreate {
      Log.d(TAG, "Module created")
    }

    // The time limit only runs out with the app off screen, so this is the first moment the
    // held queue can go on with the foreground behind it again.
    OnActivityEntersForeground {
      synchronized(stateLock) {
        if (queueHeldForTimeLimit) {
          Log.d(TAG, "App is on screen again, resuming the queue")
          queueHeldForTimeLimit = false
          processNextInQueueLocked()
        }
      }
    }

    OnDestroy {
      Log.d(TAG, "Module destroyed")
      downloadManager.cancelAllDownloads()
      downloadService?.onForegroundTimeLimit = null
      if (serviceBound) {
        try {
          context.unbindService(serviceConnection)
          serviceBound = false
        } catch (e: Exception) {
          Log.e(TAG, "Error unbinding service: ${e.message}")
        }
      }
    }

    // `metadata` carries the iOS Live Activity payload; here only `itemId` is used, echoed back in
    // events so JS can correlate them without a taskId bookkeeping layer. The parameter must exist
    // on both platforms regardless — JS always passes three arguments.
    AsyncFunction("startDownload") { urlString: String, destinationPath: String?, metadata: Map<String, Any?>?, headers: Map<String, String>?, promise: Promise ->
      try {
        val taskId = synchronized(stateLock) {
          startDownloadLocked(urlString, destinationPath, metadata?.get("itemId") as? String, headers)
        }
        promise.resolve(taskId)
      } catch (e: Exception) {
        promise.reject("DOWNLOAD_ERROR", "Failed to start download: ${e.message}", e)
      }
    }

    AsyncFunction("enqueueDownload") { urlString: String, destinationPath: String?, metadata: Map<String, Any?>?, headers: Map<String, String>?, promise: Promise ->
      try {
        Log.d(TAG, "Enqueuing download: url=$urlString")

        val taskId = synchronized(stateLock) {
          // Add to queue
          val wasEmpty = downloadQueue.isEmpty()
          downloadQueue.add(
            QueuedDownload(
              url = urlString,
              destinationPath = destinationPath,
              itemId = metadata?.get("itemId") as? String,
              headers = headers
            )
          )
          Log.d(TAG, "Queue size: ${downloadQueue.size}")

          // If queue was empty and no active downloads, start processing immediately
          if (wasEmpty && downloadTasks.isEmpty()) {
            processNextInQueueLocked()
          } else {
            // Return placeholder taskId for queued items
            -1
          }
        }
        promise.resolve(taskId)
      } catch (e: Exception) {
        promise.reject("DOWNLOAD_ERROR", "Failed to enqueue download: ${e.message}", e)
      }
    }

    Function("cancelDownload") { taskId: Int ->
      Log.d(TAG, "Cancelling download: taskId=$taskId")
      downloadManager.cancelDownload(taskId)

      synchronized(stateLock) {
        downloadTasks.remove(taskId)
        // Process next item in queue after cancellation
        processNextInQueueLocked()
        syncServiceLocked()
      }
    }

    Function("cancelQueuedDownload") { url: String ->
      synchronized(stateLock) {
        // Remove from queue by URL
        downloadQueue.removeAll { queuedItem ->
          queuedItem.url == url
        }
        Log.d(TAG, "Removed queued download: $url, queue size: ${downloadQueue.size}")
      }
    }

    Function("cancelAllDownloads") {
      Log.d(TAG, "Cancelling all downloads")
      downloadManager.cancelAllDownloads()
      synchronized(stateLock) {
        downloadTasks.clear()
        downloadQueue.clear()
      }
      stopDownloadService()
    }

    AsyncFunction("getActiveDownloads") { promise: Promise ->
      try {
        // Running and queued are snapshotted under one lock, so an item mid-transition
        // (dequeued and started) can never be missing from both lists.
        val downloads = synchronized(stateLock) {
          val running = downloadTasks.map { (taskId, taskInfo) ->
            val entry = mutableMapOf<String, Any>(
              "taskId" to taskId,
              "url" to taskInfo.url,
              "state" to "running"
            )
            taskInfo.itemId?.let { entry["itemId"] = it }
            taskInfo.destinationPath?.let { entry["destinationPath"] = it }
            entry
          }
          val queued = downloadQueue.map { queuedItem ->
            val entry = mutableMapOf<String, Any>(
              "taskId" to -1,
              "url" to queuedItem.url,
              "state" to "queued"
            )
            queuedItem.itemId?.let { entry["itemId"] = it }
            queuedItem.destinationPath?.let { entry["destinationPath"] = it }
            entry
          }
          running + queued
        }
        promise.resolve(downloads)
      } catch (e: Exception) {
        promise.reject("ERROR", "Failed to get active downloads: ${e.message}", e)
      }
    }
  }

  private fun startDownloadLocked(
    urlString: String,
    destinationPath: String?,
    itemId: String?,
    headers: Map<String, String>? = null
  ): Int {
    val taskId = taskIdCounter++

    if (destinationPath == null) {
      throw IllegalArgumentException("Destination path is required")
    }

    downloadTasks[taskId] = DownloadTaskInfo(
      url = urlString,
      destinationPath = destinationPath,
      itemId = itemId,
      headers = headers
    )

    // Start foreground service if not running
    startDownloadService()
    syncServiceLocked()

    Log.d(TAG, "Starting download: taskId=$taskId, url=$urlString")

    // Send started event
    val payload = mutableMapOf<String, Any>(
      "taskId" to taskId,
      "url" to urlString
    )
    itemId?.let { payload["itemId"] = it }
    sendEvent("onDownloadStarted", payload)

    // Start the download with OkHttp
    downloadManager.startDownload(
      taskId = taskId,
      url = urlString,
      destinationPath = destinationPath,
      headers = headers,
      onProgress = { bytesWritten, totalBytes ->
        handleProgress(taskId, bytesWritten, totalBytes)
      },
      onComplete = { filePath ->
        handleDownloadComplete(taskId, filePath)
      },
      onError = { error ->
        handleError(taskId, error)
      }
    )

    return taskId
  }

  private fun processNextInQueueLocked(): Int {
    // Check if queue has items
    if (downloadQueue.isEmpty()) {
      Log.d(TAG, "Queue is empty")
      return -1
    }

    if (queueHeldForTimeLimit) {
      Log.d(TAG, "Queue is held until the app is on screen again (${downloadQueue.size} waiting)")
      return -1
    }

    // Check if there are active downloads (one at a time)
    if (downloadTasks.isNotEmpty()) {
      Log.d(TAG, "Active downloads in progress (${downloadTasks.size}), waiting...")
      return -1
    }

    // Get next item from queue
    val next = downloadQueue.removeAt(0)
    Log.d(TAG, "Processing next in queue: ${next.url}")

    return try {
      startDownloadLocked(next.url, next.destinationPath, next.itemId, next.headers)
    } catch (e: Exception) {
      Log.e(TAG, "Error processing queue item: ${e.message}", e)
      // Try to process next item
      processNextInQueueLocked()
    }
  }

  // Called from OkHttp dispatcher threads.

  private fun handleProgress(taskId: Int, bytesWritten: Long, totalBytes: Long) {
    val progress = if (totalBytes > 0) {
      bytesWritten.toDouble() / totalBytes.toDouble()
    } else {
      0.0
    }

    val taskInfo = synchronized(stateLock) { downloadTasks[taskId] }

    // Update notification
    if (taskInfo != null) {
      val progressPercent = (progress * 100).toInt()
      downloadService?.updateProgress("Downloading video", progressPercent)
    }

    val payload = mutableMapOf<String, Any>(
      "taskId" to taskId,
      "bytesWritten" to bytesWritten,
      "totalBytes" to totalBytes,
      "progress" to progress
    )
    taskInfo?.itemId?.let { payload["itemId"] = it }
    sendEvent("onDownloadProgress", payload)
  }

  private fun handleDownloadComplete(taskId: Int, filePath: String) {
    val taskInfo = synchronized(stateLock) { downloadTasks[taskId] }

    if (taskInfo == null) {
      // Only a cancel removes the task info of a running transfer, so this one finished while
      // it was being cancelled: the last bytes were already read when the call was cancelled.
      // JS has dropped its record and gets no event for a cancelled task, so nothing would ever
      // remove the file.
      Log.d(TAG, "Download completed after it was cancelled, removing file: taskId=$taskId")
      File(filePath).delete()
      return
    }

    Log.d(TAG, "Download completed: taskId=$taskId, filePath=$filePath")

    val payload = mutableMapOf<String, Any>(
      "taskId" to taskId,
      "filePath" to filePath,
      "url" to taskInfo.url
    )
    taskInfo.itemId?.let { payload["itemId"] = it }
    sendEvent("onDownloadComplete", payload)

    synchronized(stateLock) {
      downloadTasks.remove(taskId)
      // Process next item in queue
      processNextInQueueLocked()
      syncServiceLocked()
    }
  }

  private fun handleError(taskId: Int, error: String) {
    val taskInfo = synchronized(stateLock) { downloadTasks[taskId] }

    Log.e(TAG, "Download error: taskId=$taskId, error=$error")

    val payload = mutableMapOf<String, Any>(
      "taskId" to taskId,
      "error" to error
    )
    taskInfo?.itemId?.let { payload["itemId"] = it }
    sendEvent("onDownloadError", payload)

    synchronized(stateLock) {
      downloadTasks.remove(taskId)
      // Process next item in queue even on error
      processNextInQueueLocked()
      syncServiceLocked()
    }
  }

  /**
   * The service has left the foreground because Android's time limit for it ran out. Called on
   * the main thread.
   *
   * The transfers are this module's and would outlive the service, but not by much: with the
   * app off screen and nothing in the foreground the process is frozen or killed, and a
   * transfer cannot be resumed (no Range support, and a transcode has nothing to resume from).
   * JS would then drop the record of a download that died with the process without a word. So
   * the running ones fail now, with an error JS reports, and the queued ones wait.
   */
  private fun handleForegroundTimeLimit() {
    val running = synchronized(stateLock) {
      // Before the tasks fail: each failure goes on to the next item in the queue.
      queueHeldForTimeLimit = true
      downloadTasks.keys.toList()
    }
    Log.w(TAG, "Foreground time limit reached, failing ${running.size} running download(s)")

    running.forEach { taskId ->
      downloadManager.cancelDownload(taskId)
      handleError(taskId, FOREGROUND_TIME_LIMIT_ERROR)
    }
  }

  /** Assumes `stateLock` is held. */
  private fun syncServiceLocked() {
    downloadService?.syncActiveDownloads(downloadTasks.size)
  }

  private fun startDownloadService() {
    if (!serviceBound) {
      val intent = Intent(context, DownloadService::class.java)
      context.startForegroundService(intent)
      context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }
  }

  private fun stopDownloadService() {
    val idle = synchronized(stateLock) { downloadTasks.isEmpty() }
    if (serviceBound && idle) {
      try {
        downloadService?.onForegroundTimeLimit = null
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
