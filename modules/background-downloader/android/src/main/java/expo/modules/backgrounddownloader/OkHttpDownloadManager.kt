package expo.modules.backgrounddownloader

import android.util.Log
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.TimeUnit

class OkHttpDownloadManager {
  private val TAG = "OkHttpDownloadManager"
  
  private val client = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    .callTimeout(0, TimeUnit.SECONDS) // No timeout for long transcodes
    .build()
  
  private val activeDownloads = mutableMapOf<Int, Call>()
  
  /**
   * Start a download, optionally resuming from a given byte offset.
   * When resumeFromBytes > 0, a Range header is added and the file is appended to.
   */
  fun startDownload(
    taskId: Int,
    url: String,
    destinationPath: String,
    resumeFromBytes: Long = 0,
    onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit,
    onComplete: (filePath: String) -> Unit,
    onError: (error: String, bytesWritten: Long, isResumable: Boolean) -> Unit
  ) {
    Log.d(TAG, "Starting download: taskId=$taskId, url=$url, resumeFrom=$resumeFromBytes")
    
    val requestBuilder = Request.Builder().url(url)
    
    if (resumeFromBytes > 0) {
      requestBuilder.addHeader("Range", "bytes=$resumeFromBytes-")
      Log.d(TAG, "Adding Range header: bytes=$resumeFromBytes-")
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
        
        // Check if partial file exists for resume capability
        val destFile = File(destinationPath)
        val partialBytes = if (destFile.exists()) destFile.length() else 0L
        val isResumable = partialBytes > 0
        
        onError(e.message ?: "Download failed", partialBytes, isResumable)
      }
      
      override fun onResponse(call: Call, response: Response) {
        if (!response.isSuccessful && response.code != 206) {
          Log.e(TAG, "Download failed with HTTP code: ${response.code}")
          activeDownloads.remove(taskId)
          
          val destFile = File(destinationPath)
          val partialBytes = if (destFile.exists()) destFile.length() else 0L
          
          onError("HTTP error: ${response.code} ${response.message}", partialBytes, false)
          return
        }
        
        try {
          val contentLength = response.body?.contentLength() ?: -1L
          // For resumed downloads, totalBytes = resumeFromBytes + contentLength
          val totalBytes = if (resumeFromBytes > 0 && contentLength > 0) {
            resumeFromBytes + contentLength
          } else if (contentLength > 0) {
            contentLength
          } else {
            -1L
          }
          
          val inputStream = response.body?.byteStream()
          
          if (inputStream == null) {
            activeDownloads.remove(taskId)
            onError("Failed to get response body", resumeFromBytes, false)
            return
          }
          
          // Create destination directory if needed
          val destFile = File(destinationPath)
          val destDir = destFile.parentFile
          if (destDir != null && !destDir.exists()) {
            destDir.mkdirs()
          }
          
          // If resuming, append to existing file; otherwise create new
          val outputStream: FileOutputStream = if (resumeFromBytes > 0 && destFile.exists()) {
            FileOutputStream(destFile, true) // append mode
          } else {
            FileOutputStream(destFile) // overwrite mode
          }
          
          val buffer = ByteArray(8192)
          var bytesWritten = resumeFromBytes
          var lastProgressUpdate = System.currentTimeMillis()
          
          inputStream.use { input ->
            outputStream.use { output ->
              var bytes = input.read(buffer)
              while (bytes >= 0) {
                // Check if download was cancelled
                if (call.isCanceled()) {
                  Log.d(TAG, "Download cancelled: taskId=$taskId, keeping partial file ($bytesWritten bytes)")
                  // DO NOT delete partial file — keep it for resume
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
          
          Log.d(TAG, "Download completed: taskId=$taskId, bytes=$bytesWritten")
          activeDownloads.remove(taskId)
          onComplete(destinationPath)
          
        } catch (e: Exception) {
          Log.e(TAG, "Error during download: taskId=$taskId, error=${e.message}", e)
          activeDownloads.remove(taskId)
          
          // DO NOT delete partial file — keep it for resume
          val destFile = File(destinationPath)
          val partialBytes = if (destFile.exists()) destFile.length() else 0L
          val isResumable = partialBytes > 0
          
          if (!call.isCanceled()) {
            onError(e.message ?: "Download failed", partialBytes, isResumable)
          }
        }
      }
    })
  }
  
  /**
   * Cancel a download. The partial file is NOT deleted to support resume.
   */
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
