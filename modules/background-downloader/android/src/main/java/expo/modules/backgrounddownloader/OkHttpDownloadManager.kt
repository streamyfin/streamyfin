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
import java.util.concurrent.CountDownLatch
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
  // Taken around every change to which call a task has: pause and cancel take a task's call while
  // a callback may be replacing it (a 416 or a mismatched range starts the file over), and a
  // replacement must never outlive the pause that thought it had stopped the task.
  private val callLock = Any()
  // Tasks whose call was cancelled by pauseDownload: their .part file stays for a Range resume.
  private val pausingTasks = ConcurrentHashMap.newKeySet<Int>()
  // Tasks whose bytes can be continued: the server answered a range, or offered ranges with a
  // length and a validator. A transcode is streamed as it is made and has none of them.
  private val resumableTasks = ConcurrentHashMap.newKeySet<Int>()
  // Writers still holding a .part file open, by destination. call.cancel() does not wait for the
  // callback, which can write one more buffer; a resume measures the .part only after it closed.
  private val writers = ConcurrentHashMap<String, CountDownLatch>()

  private fun partFileFor(destinationPath: String) = File("$destinationPath.part")

  // ETag or Last-Modified of the response the .part file came from, sent back as If-Range so a
  // file that changed on the server since is downloaded whole instead of spliced. A .part without
  // one is never continued: nothing could tell a changed file from the same one.
  private fun validatorFileFor(destinationPath: String) = File("$destinationPath.part.validator")

  private val contentRangePattern = Regex("""bytes (\d+)-(\d+)/(\d+|\*)""")

  /** Waits, briefly, for the writer of a paused download to close its .part file. */
  fun awaitWriter(destinationPath: String) {
    writers[destinationPath]?.await(WRITER_CLOSE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
  }

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
    val savedValidator = try {
      if (validatorFile.exists()) validatorFile.readText().trim() else ""
    } catch (e: IOException) {
      ""
    }
    val resumeOffset =
      if (resume && savedValidator.isNotEmpty() && partFileAtStart.exists()) partFileAtStart.length() else 0L

    val requestBuilder = Request.Builder().url(url)
    headers?.forEach { (key, value) ->
      requestBuilder.addHeader(key, value)
    }
    if (resumeOffset > 0) {
      requestBuilder.header("Range", "bytes=$resumeOffset-")
      requestBuilder.header("If-Range", savedValidator)
    }
    val request = requestBuilder.build()

    val call = client.newCall(request)
    synchronized(callLock) {
      activeDownloads[taskId] = call
    }

    call.enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        Log.e(TAG, "Download failed: taskId=$taskId, error=${e.message}")
        activeDownloads.remove(taskId, call)
        if (call.isCanceled()) {
          // Don't report cancellation as error. A pause before the response keeps what an
          // earlier pause left in the .part file; a cancel removes it.
          if (!pausingTasks.remove(taskId)) {
            discardPartial(destinationPath)
          }
          return
        }
        onError(e.message ?: "Download failed")
      }

      override fun onResponse(call: Call, response: Response) {
        // Starts the file over without a Range, unless this call was paused or cancelled in the
        // meantime: then the task is no longer this call's, and nothing must replace it.
        fun startOver(reason: String) {
          response.close()
          synchronized(callLock) {
            if (activeDownloads[taskId] !== call || call.isCanceled()) return
            Log.d(TAG, "Starting over: taskId=$taskId, $reason")
            discardPartial(destinationPath)
            startDownload(taskId, url, destinationPath, headers, false, onProgress, onComplete, onError)
          }
        }

        // The .part already holds every byte; the server cannot send a range past the end. Start
        // over rather than guess the file is whole.
        if (response.code == 416 && resumeOffset > 0) {
          startOver("range not satisfiable")
          return
        }

        if (!response.isSuccessful) {
          Log.e(TAG, "Download failed with HTTP code: ${response.code}")
          activeDownloads.remove(taskId, call)
          onError("HTTP error: ${response.code} ${response.message}")
          return
        }

        // 206 continues the .part, but only a range that starts where the .part ends and runs to
        // the end of the file. Anything else would splice or truncate it.
        var rangeTotal = -1L
        if (response.code == 206) {
          val range = response.header("Content-Range")?.let { contentRangePattern.find(it) }
          val first = range?.groupValues?.get(1)?.toLongOrNull()
          val last = range?.groupValues?.get(2)?.toLongOrNull()
          rangeTotal = range?.groupValues?.get(3)?.toLongOrNull() ?: -1L
          val continuesPart = resumeOffset > 0 && first == resumeOffset && last != null &&
            (rangeTotal < 0 || last == rangeTotal - 1)
          if (!continuesPart) {
            if (resumeOffset > 0) {
              startOver("range did not continue the partial file")
            } else {
              response.close()
              activeDownloads.remove(taskId, call)
              onError("Unexpected partial response")
            }
            return
          }
        }
        // A 200 to a Range request is the server sending the whole file again (no range support,
        // or If-Range found it changed), so the .part starts over.
        val appending = response.code == 206
        val startOffset = if (appending) resumeOffset else 0L

        // Stream into a .part staging file and rename on completion. The destination path must
        // only ever hold a finished download: a process killed mid-transfer cannot run cleanup,
        // and JS reconciliation treats an existing destination file as a completed download.
        val destFile = File(destinationPath)
        val partFile = partFileFor(destinationPath)

        val bodyLength = response.body?.contentLength() ?: -1L
        val validator = if (appending) savedValidator else response.header("ETag") ?: response.header("Last-Modified")
        if (appending ||
          (response.header("Accept-Ranges") == "bytes" && bodyLength > 0 && validator != null)
        ) {
          resumableTasks.add(taskId)
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
          activeDownloads.remove(taskId, call)
        }

        val writerClosed = CountDownLatch(1)
        writers[destinationPath] = writerClosed
        try {
          val totalBytes = when {
            appending && rangeTotal > 0 -> rangeTotal
            bodyLength > 0 -> startOffset + bodyLength
            else -> -1L
          }
          val inputStream = response.body?.byteStream()

          if (inputStream == null) {
            activeDownloads.remove(taskId, call)
            onError("Failed to get response body")
            return
          }

          // Create destination directory if needed
          val destDir = destFile.parentFile
          if (destDir != null && !destDir.exists()) {
            destDir.mkdirs()
          }

          // The old validator goes before the .part is truncated, and the new one is written only
          // after: a process killed in between leaves a .part with no validator, which is never
          // continued, rather than old bytes under the new file's validator.
          if (!appending) validatorFile.delete()
          val outputStream = java.io.FileOutputStream(partFile, appending)
          if (!appending && resumableTasks.contains(taskId) && validator != null) {
            try {
              validatorFile.writeText(validator)
            } catch (e: IOException) {
              validatorFile.delete()
              resumableTasks.remove(taskId)
            }
          }
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

          // A body that ended short of its length is not the file.
          if (totalBytes > 0 && bytesWritten != totalBytes) {
            Log.e(TAG, "Download ended early: taskId=$taskId, $bytesWritten of $totalBytes bytes")
            partFile.delete()
            validatorFile.delete()
            resumableTasks.remove(taskId)
            activeDownloads.remove(taskId, call)
            onError("Download ended before the whole file arrived")
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
            activeDownloads.remove(taskId, call)
            onError("Failed to move completed file into place")
            return
          }

          Log.d(TAG, "Download completed: taskId=$taskId, bytes=$bytesWritten")
          activeDownloads.remove(taskId, call)
          onComplete(destinationPath)

        } catch (e: Exception) {
          Log.e(TAG, "Error during download: taskId=$taskId, error=${e.message}", e)
          // A cancelled call usually ends here, its read failing, rather than at the loop's check.
          if (call.isCanceled()) {
            stopForCancel()
            return
          }
          activeDownloads.remove(taskId, call)
          resumableTasks.remove(taskId)

          // Clean up partial file
          try {
            partFile.delete()
            validatorFile.delete()
          } catch (deleteError: Exception) {
            Log.e(TAG, "Failed to delete partial file: ${deleteError.message}")
          }

          onError(e.message ?: "Download failed")
        } finally {
          writerClosed.countDown()
          writers.remove(destinationPath, writerClosed)
        }
      }
    })
  }

  fun cancelDownload(taskId: Int) {
    Log.d(TAG, "Cancelling download: taskId=$taskId")
    synchronized(callLock) {
      activeDownloads.remove(taskId)?.cancel()
    }
  }

  /**
   * Stops the transfer and keeps its .part file when the server allows a Range resume. Returns
   * null when there is no such transfer, otherwise whether the bytes so far are kept.
   */
  fun pauseDownload(taskId: Int): Boolean? {
    synchronized(callLock) {
      val call = activeDownloads.remove(taskId) ?: return null
      Log.d(TAG, "Pausing download: taskId=$taskId")
      pausingTasks.add(taskId)
      // Before the response arrives this is not known yet, and reads as not kept; a .part an
      // earlier pause left is still there for the next resume.
      val kept = resumableTasks.contains(taskId)
      call.cancel()
      return kept
    }
  }

  /** Removes what a paused download left on disk. */
  fun discardPartial(destinationPath: String) {
    partFileFor(destinationPath).delete()
    validatorFileFor(destinationPath).delete()
  }

  fun cancelAllDownloads() {
    Log.d(TAG, "Cancelling all downloads")
    synchronized(callLock) {
      activeDownloads.values.forEach { it.cancel() }
      activeDownloads.clear()
    }
  }

  fun hasActiveDownloads(): Boolean {
    return activeDownloads.isNotEmpty()
  }

  private companion object {
    // Bounds a resume's wait for the paused writer, which closes within one read of the cancel.
    const val WRITER_CLOSE_TIMEOUT_SECONDS = 5L
  }
}
