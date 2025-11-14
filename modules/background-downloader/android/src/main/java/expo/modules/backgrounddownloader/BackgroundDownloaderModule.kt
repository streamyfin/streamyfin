package expo.modules.backgrounddownloader

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.os.storage.StorageManager
import android.os.storage.StorageVolume
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

data class DownloadTaskInfo(
  val url: String,
  val destinationPath: String?
)

class BackgroundDownloaderModule : Module() {
  companion object {
    private const val TAG = "BackgroundDownloader"
  }

  private val context
    get() = requireNotNull(appContext.reactContext)

  private val downloadManager = OkHttpDownloadManager()
  private val downloadTasks = mutableMapOf<Int, DownloadTaskInfo>()
  private val downloadQueue = mutableListOf<Pair<String, String?>>()
  private var taskIdCounter = 1
  private var downloadService: DownloadService? = null
  private var serviceBound = false

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
      "onDownloadStarted"
    )

    OnCreate {
      Log.d(TAG, "Module created")
    }

    OnDestroy {
      Log.d(TAG, "Module destroyed")
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
      downloadManager.cancelAllDownloads()
      downloadTasks.clear()
      downloadQueue.clear()
      stopDownloadService()
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

    AsyncFunction("getAvailableStorageLocations") { promise: Promise ->
      try {
        val storageLocations = mutableListOf<Map<String, Any>>()
        
        // Use getExternalFilesDirs which works reliably across all Android versions
        // This returns app-specific directories on both internal and external storage
        val externalDirs = context.getExternalFilesDirs(null)
        
        Log.d(TAG, "getExternalFilesDirs returned ${externalDirs.size} locations")
        
        // Also check with StorageManager for additional info
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager
          val volumes = storageManager.storageVolumes
          Log.d(TAG, "StorageManager reports ${volumes.size} volumes")
          for ((i, vol) in volumes.withIndex()) {
            Log.d(TAG, "  Volume $i: isPrimary=${vol.isPrimary}, isRemovable=${vol.isRemovable}, state=${vol.state}, uuid=${vol.uuid}")
          }
        }
        
        for ((index, dir) in externalDirs.withIndex()) {
          try {
            if (dir == null) {
              Log.w(TAG, "Directory at index $index is null - SD card may not be mounted")
              continue
            }
            
            if (!dir.exists()) {
              Log.w(TAG, "Directory at index $index does not exist: ${dir.absolutePath}")
              continue
            }
            
            val isPrimary = index == 0
            val isRemovable = !isPrimary && Environment.isExternalStorageRemovable(dir)
            
            // Get volume UUID for better identification
            val volumeId = if (isPrimary) {
              "internal"
            } else {
              // Try to get a stable UUID for the SD card
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager
                try {
                  val storageVolume = storageManager.getStorageVolume(dir)
                  storageVolume?.uuid ?: "sdcard_$index"
                } catch (e: Exception) {
                  "sdcard_$index"
                }
              } else {
                "sdcard_$index"
              }
            }
            
            // Get human-readable label
            val label = if (isPrimary) {
              "Internal Storage"
            } else {
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager
                try {
                  val storageVolume = storageManager.getStorageVolume(dir)
                  storageVolume?.getDescription(context) ?: "SD Card"
                } catch (e: Exception) {
                  "SD Card"
                }
              } else {
                "SD Card"
              }
            }
            
            val totalSpace = dir.totalSpace
            val freeSpace = dir.freeSpace
            
            Log.d(TAG, "Storage location: $label (id: $volumeId, path: ${dir.absolutePath}, removable: $isRemovable)")
            
            storageLocations.add(
              mapOf(
                "id" to volumeId,
                "path" to dir.absolutePath,
                "type" to (if (isRemovable || !isPrimary) "external" else "internal"),
                "label" to label,
                "totalSpace" to totalSpace,
                "freeSpace" to freeSpace
              )
            )
          } catch (e: Exception) {
            Log.e(TAG, "Error processing storage at index $index: ${e.message}", e)
            continue
          }
        }
        
        Log.d(TAG, "Returning ${storageLocations.size} storage locations")
        promise.resolve(storageLocations)
      } catch (e: Exception) {
        Log.e(TAG, "Error getting storage locations: ${e.message}", e)
        promise.reject("ERROR", "Failed to get storage locations: ${e.message}", e)
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
      onError = { error ->
        handleError(taskId, error)
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
    downloadService?.stopDownload()
    
    // Process next item in queue
    processNextInQueue()
  }

  private fun handleError(taskId: Int, error: String) {
    val taskInfo = downloadTasks[taskId]
    
    Log.e(TAG, "Download error: taskId=$taskId, error=$error")
    
    sendEvent("onDownloadError", mapOf(
      "taskId" to taskId,
      "error" to error
    ))
    
    downloadTasks.remove(taskId)
    downloadService?.stopDownload()
    
    // Process next item in queue even on error
    processNextInQueue()
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
