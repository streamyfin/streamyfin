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
  // Tasks whose call was cancelled by pauseDownload: their .part file stays for a Range resume.
  private val pausingTasks = ConcurrentHashMap.newKeySet<Int>()
  // Tasks whose server answered with a byte range or offered one (Accept-Ranges plus a length).
  // A transcode is streamed as it is made and has neither, so pausing it keeps nothing.
  private val resumableTasks = ConcurrentHashMap.newKeySet<Int>()

  private fun partFileFor(destinationPath: String) = File("$destinationPath.part")

  // ETag or Last-Modified of the response the .part file came from, sent back as If-Range so a
  // file that changed on the server since is downloaded whole instead of spliced.
  private fun validatorFileFor(destinationPath: String) = File("$destinationPath.part.validator")

  /**
   * @param resume continue from an existing .part file with a Range request. Without it, a
   * leftover .part is overwritten: only a download the user paused is safe to splice onto.
   */
  fun startDownload(
    taskId: Int,
    url: String,
    destinationPath: String,
    headers: Map<String, String>? = null,
    resume: Boolean = false,
    onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit,
    onComplete: (filePath: String) -> Unit,
    onError: (error: String) -> Unit
  ) {
    Log.d(TAG, "Starting download: taskId=$taskId, resume=$resume, url=${redactCredentials(url)}")

    val partFileAtStart = partFileFor(destinationPath)
    val validatorFile = validatorFileFor(destinationPath)
    val resumeOffset = if (resume && partFileAtStart.exists()) partFileAtStart.length() else 0L

    val requestBuilder = Request.Builder().url(url)
    headers?.forEach { (key, value) ->
      requestBuilder.addHeader(key, value)
    }
    if (resumeOffset > 0) {
      requestBuilder.header("Range", "bytes=$resumeOffset-")
      val validator = try {
        if (validatorFile.exists()) validatorFile.readText().trim() else ""
      } catch (e: IOException) {
        ""
      }
      if (validator.isNotEmpty()) {
        requestBuilder.header("If-Range", validator)
      }
    }
    val request = requestBuilder.build()
    
    val call = client.newCall(request)
    activeDownloads[taskId] = call
    
    call.enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        Log.e(TAG, "Download failed: taskId=$taskId, error=${e.message}")
        activeDownloads.remove(taskId)
        if (call.isCanceled()) {
          // Don't report cancellation as error. A pause before the response keeps what an
          // earlier pause left in the .part file.
          pausingTasks.remove(taskId)
          return
        }
        onError(e.message ?: "Download failed")
      }
      
      override fun onResponse(call: Call, response: Response) {
        // The .part already holds every byte; the server cannot send a range past the end. Start
        // over rather than guess the file is whole.
        if (response.code == 416 && resumeOffset > 0) {
          response.close()
          activeDownloads.remove(taskId)
          partFileAtStart.delete()
          validatorFile.delete()
          startDownload(taskId, url, destinationPath, headers, false, onProgress, onComplete, onError)
          return
        }

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
        val partFile = partFileFor(destinationPath)

        // 206 continues the .part; a 200 to a Range request is the server sending the whole file
        // again (no range support, or If-Range found it changed), so the .part starts over.
        val appending = resumeOffset > 0 && response.code == 206 &&
          (response.header("Content-Range")?.startsWith("bytes $resumeOffset-") == true)
        val startOffset = if (appending) resumeOffset else 0L

        val bodyLength = response.body?.contentLength() ?: -1L
        if (appending || (response.header("Accept-Ranges") == "bytes" && bodyLength > 0)) {
          resumableTasks.add(taskId)
          if (!appending) {
            val validator = response.header("ETag") ?: response.header("Last-Modified")
            try {
              if (validator != null) validatorFile.writeText(validator) else validatorFile.delete()
            } catch (e: IOException) {
              validatorFile.delete()
            }
          }
        } else {
          resumableTasks.remove(taskId)
        }

        // Keeps the .part when the download was paused and can be resumed; deletes it otherwise.
        fun stopForCancel() {
          val keep = pausingTasks.remove(taskId) && resumableTasks.contains(taskId)
          if (!keep) {
            partFile.delete()
            validatorFile.delete()
          }
          resumableTasks.remove(taskId)
          activeDownloads.remove(taskId)
        }

        try {
          val totalBytes = if (bodyLength > 0) startOffset + bodyLength else -1L
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

          val outputStream = java.io.FileOutputStream(partFile, appending)
          val buffer = ByteArray(8192)
          var bytesWritten = startOffset
          var lastProgressUpdate = System.currentTimeMillis()

          inputStream.use { input ->
            outputStream.use { output ->
              var bytes = input.read(buffer)
              while (bytes >= 0) {
                // Check if download was cancelled
                if (call.isCanceled()) {
                  Log.d(TAG, "Download cancelled: taskId=$taskId")
                  stopForCancel()
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

          // The loop only sees a cancel after a read that returned data. A cancel that lands
          // once the last bytes are in must not move the file into place either: that would
          // replace whatever a finished download already has at the destination.
          if (call.isCanceled()) {
            Log.d(TAG, "Download cancelled before it was moved into place: taskId=$taskId")
            stopForCancel()
            return
          }

          if (destFile.exists()) {
            destFile.delete()
          }
          validatorFile.delete()
          resumableTasks.remove(taskId)
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
          // A cancelled call usually ends here, its read failing, rather than at the loop's check.
          if (call.isCanceled()) {
            stopForCancel()
            return
          }
          activeDownloads.remove(taskId)
          resumableTasks.remove(taskId)

          // Clean up partial file
          try {
            partFile.delete()
            validatorFile.delete()
          } catch (deleteError: Exception) {
            Log.e(TAG, "Failed to delete partial file: ${deleteError.message}")
          }

          onError(e.message ?: "Download failed")
        }
      }
    })
  }
  
  fun cancelDownload(taskId: Int) {
    Log.d(TAG, "Cancelling download: taskId=$taskId")
    activeDownloads[taskId]?.cancel()
    activeDownloads.remove(taskId)
  }
  
  /**
   * Stops the transfer and keeps its .part file when the server allows a Range resume. Returns
   * null when there is no such transfer, otherwise whether the bytes so far are kept.
   */
  fun pauseDownload(taskId: Int): Boolean? {
    val call = activeDownloads[taskId] ?: return null
    Log.d(TAG, "Pausing download: taskId=$taskId")
    pausingTasks.add(taskId)
    // Before the response arrives this is not known yet, and reads as not kept; a .part an earlier
    // pause left is still there for the next resume.
    val kept = resumableTasks.contains(taskId)
    call.cancel()
    activeDownloads.remove(taskId)
    return kept
  }

  /** Removes what a paused download left on disk. */
  fun discardPartial(destinationPath: String) {
    partFileFor(destinationPath).delete()
    validatorFileFor(destinationPath).delete()
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

