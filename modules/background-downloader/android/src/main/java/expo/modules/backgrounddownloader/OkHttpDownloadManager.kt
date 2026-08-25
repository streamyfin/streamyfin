package expo.modules.backgrounddownloader

import android.util.Log
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class OkHttpDownloadManager {
  private val TAG = "OkHttpDownloadManager"

  private val client = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    .callTimeout(0, TimeUnit.SECONDS) // No timeout for long transcodes
    .build()

  // Mutated from the JS thread (start/cancel) and OkHttp dispatcher threads (callbacks).
  private val activeDownloads = ConcurrentHashMap<Int, Call>()
  
  fun startDownload(
    taskId: Int,
    url: String,
    destinationPath: String,
    headers: Map<String, String>? = null,
    onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit,
    onComplete: (filePath: String) -> Unit,
    onError: (error: String) -> Unit
  ) {
    Log.d(TAG, "Starting download: taskId=$taskId, url=$url")

    val requestBuilder = Request.Builder().url(url)
    headers?.forEach { (key, value) ->
      requestBuilder.addHeader(key, value)
    }
    val request = requestBuilder.build()
    
    val call = client.newCall(request)
    activeDownloads[taskId] = call
    
    call.enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        Log.e(TAG, "Download failed: taskId=$taskId, error=${e.message}")
        activeDownloads.remove(taskId)
        if (call.isCanceled()) {
          // Don't report cancellation as error
          return
        }
        onError(e.message ?: "Download failed")
      }
      
      override fun onResponse(call: Call, response: Response) {
        if (!response.isSuccessful) {
          Log.e(TAG, "Download failed with HTTP code: ${response.code}")
          activeDownloads.remove(taskId)
          onError("HTTP error: ${response.code} ${response.message}")
          return
        }
        
        // Stream into a .part staging file and rename on completion. The destination path must
        // only ever hold a finished download: a process killed mid-transfer cannot run cleanup,
        // and JS reconciliation treats an existing destination file as a completed download.
        val destFile = File(destinationPath)
        val partFile = File("$destinationPath.part")

        try {
          val totalBytes = response.body?.contentLength() ?: -1L
          val inputStream = response.body?.byteStream()

          if (inputStream == null) {
            activeDownloads.remove(taskId)
            onError("Failed to get response body")
            return
          }

          // Create destination directory if needed
          val destDir = destFile.parentFile
          if (destDir != null && !destDir.exists()) {
            destDir.mkdirs()
          }

          val outputStream = partFile.outputStream()
          val buffer = ByteArray(8192)
          var bytesWritten = 0L
          var lastProgressUpdate = System.currentTimeMillis()

          inputStream.use { input ->
            outputStream.use { output ->
              var bytes = input.read(buffer)
              while (bytes >= 0) {
                // Check if download was cancelled
                if (call.isCanceled()) {
                  Log.d(TAG, "Download cancelled: taskId=$taskId")
                  partFile.delete()
                  activeDownloads.remove(taskId)
                  return
                }

                output.write(buffer, 0, bytes)
                bytesWritten += bytes

                // Throttle progress updates to every 500ms
                val now = System.currentTimeMillis()
                if (now - lastProgressUpdate >= 500) {
                  onProgress(bytesWritten, totalBytes)
                  lastProgressUpdate = now
                }

                bytes = input.read(buffer)
              }
            }
          }

          // Send final progress update
          onProgress(bytesWritten, totalBytes)

          if (destFile.exists()) {
            destFile.delete()
          }
          if (!partFile.renameTo(destFile)) {
            Log.e(TAG, "Failed to move completed file into place: taskId=$taskId")
            partFile.delete()
            activeDownloads.remove(taskId)
            onError("Failed to move completed file into place")
            return
          }

          Log.d(TAG, "Download completed: taskId=$taskId, bytes=$bytesWritten")
          activeDownloads.remove(taskId)
          onComplete(destinationPath)

        } catch (e: Exception) {
          Log.e(TAG, "Error during download: taskId=$taskId, error=${e.message}", e)
          activeDownloads.remove(taskId)

          // Clean up partial file
          try {
            partFile.delete()
          } catch (deleteError: Exception) {
            Log.e(TAG, "Failed to delete partial file: ${deleteError.message}")
          }

          if (!call.isCanceled()) {
            onError(e.message ?: "Download failed")
          }
        }
      }
    })
  }
  
  fun cancelDownload(taskId: Int) {
    Log.d(TAG, "Cancelling download: taskId=$taskId")
    activeDownloads[taskId]?.cancel()
    activeDownloads.remove(taskId)
  }
  
  fun cancelAllDownloads() {
    Log.d(TAG, "Cancelling all downloads")
    activeDownloads.values.forEach { it.cancel() }
    activeDownloads.clear()
  }
  
  fun hasActiveDownloads(): Boolean {
    return activeDownloads.isNotEmpty()
  }
}

