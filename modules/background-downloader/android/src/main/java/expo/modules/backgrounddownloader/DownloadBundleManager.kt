package expo.modules.backgrounddownloader

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.system.Os
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Application-scoped, not bridge-scoped: destroying the JS module must not stop a native job. */
internal class DownloadBundleManager private constructor(private val context: Context) {
  companion object {
    private const val DOWNLOAD_PROGRESS_WEIGHT = 0.9
    private const val PROGRESS_INTERVAL_MS = 500L
    private const val MISSING_HEADERS = "Open the app and retry to restore download authentication headers"
    @Volatile private var instance: DownloadBundleManager? = null

    fun get(context: Context): DownloadBundleManager = instance ?: synchronized(this) {
      instance ?: DownloadBundleManager(context.applicationContext).also { instance = it }
    }
  }

  private class Work(val job: DownloadBundleJob) {
    val stopped = AtomicBoolean(false)
    @Volatile var call: Call? = null
    fun stop() {
      stopped.set(true)
      call?.cancel()
    }
  }

  private val lock = Any()
  private val store = DownloadBundleStore(context.filesDir)
  private val jobs = linkedMapOf<String, DownloadBundleJob>()
  // Proxy credentials never enter a manifest, log, Intent, or SharedPreferences.
  private val headers = mutableMapOf<String, Map<String, String>>()
  private val progress = mutableMapOf<String, Double>()
  private val bytesWritten = mutableMapOf<String, Long>()
  private val startedJobs = mutableSetOf<String>()
  private val executor = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val client = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS)
    .callTimeout(0, TimeUnit.SECONDS).build()
  @Volatile private var listener: ((String, Map<String, Any>) -> Unit)? = null
  @Volatile private var idleListener: (() -> Unit)? = null
  private var work: Work? = null
  private var service: DownloadService? = null
  private var normalDownloadCount = 0
  private var suspended = false
  private var cancellingAll = false

  init {
    store.load().forEach { job ->
      if (job.stage in listOf("cancelled", "completed")) {
        store.cleanInputs(job)
        store.remove(job)
        return@forEach
      }
      if (job.stage in listOf("downloading", "remuxing")) job.stage = "queued"
      jobs[job.id] = job
    }
  }

  fun setListener(callback: ((String, Map<String, Any>) -> Unit)?, onIdle: (() -> Unit)? = null) = synchronized(lock) {
    listener = callback
    idleListener = onIdle
  }

  fun enqueue(planJson: String, metadata: Map<String, Any?>, requestHeaders: Map<String, String>?): Int {
    val parsed = DownloadBundlePlan.parse(JSONObject(planJson))
    val plan = parsed.copy(destinationPath = store.validateDestination(parsed.destinationPath))
    val itemId = metadata["itemId"] as? String
    require(!itemId.isNullOrBlank()) { "Download itemId is required" }
    val taskId = synchronized(lock) {
      val existing = jobs.values.firstOrNull { it.itemId == itemId }
      val job = if (existing != null) {
        require(existing.plan.destinationPath == plan.destinationPath &&
          existing.plan.audioTitles == plan.audioTitles &&
          existing.plan.audioLanguages == plan.audioLanguages &&
          existing.plan.audioUrls.size == plan.audioUrls.size) {
          "Cancel the existing download before changing its tracks"
        }
        // A worker uses an immutable plan snapshot; refreshed URLs apply to its next retry.
        existing.copy(
          plan = plan, error = null,
          stage = if (existing.stage == "error") {
            if (existing.publishedSize > 0 && store.destination(existing).exists()) "publishing" else "queued"
          } else existing.stage
        )
      } else {
        require(!java.io.File(plan.destinationPath).exists() &&
          jobs.values.none { it.plan.destinationPath == plan.destinationPath }) {
          "The download destination already exists"
        }
        DownloadBundleJob(
          UUID.randomUUID().toString(), (jobs.values.minOfOrNull { it.taskId } ?: -1) - 1,
          itemId, plan, !requestHeaders.isNullOrEmpty(),
          (metadata["estimatedTotalBytes"] as? Number)?.toLong()?.coerceAtLeast(0) ?: 0
        )
      }
      if (requestHeaders != null) {
        headers[job.id] = requestHeaders.toMap()
        job.requiresHeaders = requestHeaders.isNotEmpty()
      } else {
        require(!needsHeaders(job)) { MISSING_HEADERS }
      }
      job.labels = (metadata["labels"] as? Map<*, *>)?.entries?.mapNotNull {
        val key = it.key as? String
        val value = it.value as? String
        if (key != null && value != null) key to value else null
      }?.toMap() ?: emptyMap()
      store.save(job)
      jobs[job.id] = job
      suspended = false
      job.taskId
    }
    resume()
    return taskId
  }

  fun resume() {
    val shouldStart = synchronized(lock) {
      suspended = false
      jobs.values.any { runnable(it) }
    }
    if (!shouldStart) return
    try {
      context.startForegroundService(Intent(context, DownloadService::class.java))
    } catch (error: Exception) {
      synchronized(lock) {
        suspended = true
        jobs.values.filter { runnable(it) }.forEach {
          it.error = "Foreground download service unavailable; reopen the app to retry"
          runCatching { store.save(it) }
          emit("onDownloadError", payload(it) + ("error" to it.error!!))
        }
      }
    }
  }

  fun onServiceReady(value: DownloadService) = synchronized(lock) {
    service = value
    suspended = false
    kickLocked()
    syncServiceLocked()
  }

  fun onServiceStopped(value: DownloadService, reason: String) = synchronized(lock) {
    if (service !== value) return@synchronized
    suspended = true
    service = null
    work?.let {
      it.stop()
      val job = jobs[it.job.id] ?: return@let
      job.stage = "queued"
      job.error = reason
      runCatching { store.save(job) }
      emit("onDownloadError", payload(job) + ("error" to reason))
    }
  }

  fun setNormalDownloadCount(count: Int) = synchronized(lock) {
    normalDownloadCount = count
    kickLocked()
    syncServiceLocked()
  }

  fun isBusy(): Boolean = synchronized(lock) { work != null }

  fun needsMediaProcessing(): Boolean = synchronized(lock) {
    if (normalDownloadCount > 0) return@synchronized false
    val job = work?.job ?: jobs.values.firstOrNull { runnable(it) } ?: return@synchronized false
    job.stage == "publishing" || job.plan.urls.indices.all { store.completedSize(job, it) > 0 }
  }

  fun cancel(itemId: String) = synchronized(lock) {
    val job = jobs.values.firstOrNull { it.itemId == itemId } ?: return@synchronized
    jobs.remove(job.id)
    headers.remove(job.id)
    progress.remove(job.id)
    bytesWritten.remove(job.id)
    startedJobs.remove(job.id)
    if (work?.job?.id == job.id) {
      job.stage = "cancelled"
      runCatching { store.save(job) }
      work?.stop()
    } else {
      store.cleanInputs(job)
      store.remove(job)
    }
    kickLocked()
    notifyIdle()
  }

  fun cancelAll() = synchronized(lock) {
    cancellingAll = true
    jobs.values.map { it.itemId }.forEach(::cancel)
    cancellingAll = false
  }

  fun snapshots(): List<Map<String, Any>> = synchronized(lock) {
    jobs.values.map { job ->
      val active = work?.job?.id == job.id
      payload(job) + mapOf(
        "state" to if (active) "running" else "queued",
        "requiresHeaders" to needsHeaders(job),
        "bytesOnDisk" to store.workingBytes(job)
      ) + (job.error?.let { error -> mapOf("error" to error) } ?: emptyMap()) +
        when {
          !active && needsHeaders(job) -> mapOf("waitingFor" to "headers")
          !active && suspended && job.stage != "error" -> mapOf("waitingFor" to "foreground")
          else -> emptyMap()
        }
    }
  }

  private fun completedBytes(job: DownloadBundleJob) = job.plan.urls.indices.sumOf { store.completedSize(job, it) }
  private fun needsHeaders(job: DownloadBundleJob) = job.requiresHeaders && !headers.containsKey(job.id) &&
    job.plan.urls.indices.any { store.completedSize(job, it) == 0L }
  private fun sourceProgress(job: DownloadBundleJob) =
    DOWNLOAD_PROGRESS_WEIGHT * job.plan.urls.indices.count { store.completedSize(job, it) > 0 } / job.plan.urls.size

  private fun payload(job: DownloadBundleJob): Map<String, Any> = mapOf(
    "taskId" to job.taskId, "itemId" to job.itemId, "url" to job.plan.videoUrl,
    "destinationPath" to job.plan.destinationPath,
    "stage" to if (job.stage in listOf("remuxing", "publishing", "completed") ||
      job.plan.urls.indices.all { store.completedSize(job, it) > 0 }) "remuxing" else "downloading",
    "bytesWritten" to (bytesWritten[job.id] ?: completedBytes(job)), "progress" to (progress[job.id] ?: sourceProgress(job))
  )

  private fun emit(name: String, event: Map<String, Any>) {
    // An absent/destroyed bridge must never turn a successfully downloaded file into a failed job.
    // Never call into the module while holding the manager lock: its queue also calls us.
    mainHandler.post { runCatching { listener?.invoke(name, event) } }
  }

  private fun runnable(job: DownloadBundleJob): Boolean = job.stage != "error" &&
    (!job.requiresHeaders || headers.containsKey(job.id) ||
      job.plan.urls.indices.all { store.completedSize(job, it) > 0 } || job.stage == "publishing")

  private fun kickLocked() {
    if (cancellingAll || work != null || suspended || service == null || normalDownloadCount > 0) return
    val job = jobs.values.firstOrNull { runnable(it) } ?: return
    val next = Work(job.copy())
    if (next.job.stage != "publishing" &&
      next.job.plan.urls.indices.all { store.completedSize(next.job, it) > 0 }) {
      next.job.stage = "remuxing"
    }
    work = next
    syncServiceLocked()
    executor.execute { run(next) }
  }

  private fun syncServiceLocked() {
    service?.syncBundleActivity(work != null, work?.job?.stage in listOf("remuxing", "publishing"), normalDownloadCount)
  }

  private fun notifyIdle() {
    // Let the bridge advance its ordinary queue before dropping foreground status. Restarting a
    // stopped service between a bundle and a queued single download can be forbidden in background.
    mainHandler.post {
      idleListener?.invoke()
      synchronized(lock) { syncServiceLocked() }
    }
  }

  private fun checkRunning(work: Work) {
    if (work.stopped.get()) throw IOException("Download interrupted")
  }

  private fun stage(work: Work, value: String) {
    synchronized(lock) {
      checkRunning(work)
      val job = jobs[work.job.id] ?: throw IOException("Download cancelled")
      work.job.stage = value
      job.stage = value
      job.error = null
      store.save(job)
      if (value == "downloading" && startedJobs.add(job.id)) {
        emit("onDownloadStarted", payload(job))
      }
      syncServiceLocked()
    }
  }

  private fun report(work: Work, value: Double, bytes: Long) = synchronized(lock) {
    if (work.stopped.get() || !jobs.containsKey(work.job.id)) return@synchronized
    val fraction = value.coerceIn(progress[work.job.id] ?: 0.0, 1.0)
    progress[work.job.id] = fraction
    bytesWritten[work.job.id] = bytes
    val event = payload(work.job).toMutableMap()
    event["progress"] = fraction
    event["bytesWritten"] = bytes
    event["totalBytes"] = if (work.job.estimatedTotalBytes > 0) maxOf(work.job.estimatedTotalBytes, bytes) else 0L
    emit("onDownloadProgress", event)
    val title = if (work.job.stage == "remuxing") work.job.labels["remuxing"] ?: "Preparing download"
      else work.job.labels["downloading"] ?: "Downloading video"
    service?.updateProgress(title, (fraction * 100).toInt())
  }

  private fun run(work: Work) {
    val job = work.job
    try {
      if (job.stage != "publishing") {
        for (index in job.plan.urls.indices) {
          checkRunning(work)
          if (store.completedSize(job, index) > 0) continue
          stage(work, "downloading")
          download(work, index)
        }
        checkRunning(work)
        stage(work, "remuxing")
        checkRunning(work)
        store.output(job).delete()
        report(work, DOWNLOAD_PROGRESS_WEIGHT, completedBytes(job))
        DownloadRemuxer.remux(
          videoPath = store.source(job, 0).path,
          audioPaths = job.plan.audioUrls.indices.map { store.source(job, it + 1).path },
          audioTitles = job.plan.audioTitles,
          audioLanguages = job.plan.audioLanguages,
          outputPath = store.output(job).path,
          onProgress = { report(work, DOWNLOAD_PROGRESS_WEIGHT + (1 - DOWNLOAD_PROGRESS_WEIGHT) * it.coerceIn(0.0, 0.999), completedBytes(job)) },
          isCancelled = { work.stopped.get() }
        )
        checkRunning(work)
        synchronized(lock) {
          checkRunning(work)
          job.publishedSize = store.output(job).length()
          check(job.publishedSize > 0) { "Remux produced an empty file" }
          job.stage = "publishing"
          store.save(job)
          jobs[job.id] = job.copy()
        }
      }
      synchronized(lock) {
        checkRunning(work)
        publish(job)
      }
    } catch (error: Throwable) {
      synchronized(lock) {
        val current = jobs[job.id]
        if (current != null) {
          // A timeout/background interruption retries from complete inputs, not a partial mux.
          current.stage = if (work.stopped.get()) "queued" else "error"
          current.error = error.message ?: "Multi-track download failed"
          runCatching { store.save(current) }
          if (!work.stopped.get()) emit("onDownloadError", payload(current) + ("error" to current.error!!))
        }
      }
    } finally {
      synchronized(lock) {
        if (!jobs.containsKey(job.id)) {
          store.cleanInputs(job)
          store.remove(job)
        }
        else if (jobs[job.id]?.stage != "publishing") store.output(job).delete()
        this.work = null
        kickLocked()
        notifyIdle()
      }
    }
  }

  private fun download(work: Work, index: Int) {
    val job = work.job
    val request = Request.Builder().url(job.plan.urls[index])
    synchronized(lock) {
      require(!job.requiresHeaders || headers.containsKey(job.id)) { MISSING_HEADERS }
      headers[job.id]?.forEach { (name, value) -> request.header(name, value) }
    }
    val call = client.newCall(request.build())
    work.call = call
    try {
      checkRunning(work)
      call.execute().use { response ->
        check(response.isSuccessful) { "HTTP error: ${response.code}" }
        val body = response.body ?: throw IOException("Missing response body")
        val total = body.contentLength()
        val part = store.part(job, index)
        part.parentFile?.let { check(it.isDirectory || it.mkdirs()) { "Cannot create download directory" } }
        store.marker(job, index).delete()
        var written = 0L
        var lastReport = 0L
        val baseBytes = completedBytes(job)
        val baseProgress = sourceProgress(job)
        body.byteStream().use { input ->
          FileOutputStream(part).use { output ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
              checkRunning(work)
              val count = input.read(buffer)
              if (count < 0) break
              output.write(buffer, 0, count)
              written += count
              val now = android.os.SystemClock.elapsedRealtime()
              if (now - lastReport >= PROGRESS_INTERVAL_MS) {
                val portion = if (total > 0) written.toDouble() / total else 0.0
                report(work, baseProgress + DOWNLOAD_PROGRESS_WEIGHT * portion / job.plan.urls.size, baseBytes + written)
                lastReport = now
              }
            }
            output.fd.sync()
          }
        }
        checkRunning(work)
        check(written > 0 && (total < 0 || total == written)) { "Downloaded track is empty or incomplete" }
        Os.rename(part.path, store.source(job, index).path)
        store.markComplete(job, index)
        report(work, sourceProgress(job), completedBytes(job))
      }
    } finally {
      work.call = null
      store.part(job, index).delete()
    }
  }

  private fun publish(job: DownloadBundleJob) {
    val output = store.output(job)
    val destination = store.destination(job)
    check(job.publishedSize > 0) { "Missing validated remux size" }
    if (output.exists()) {
      check(!destination.exists()) { "The download destination already exists" }
      check(output.length() == job.publishedSize) { "Remux output is incomplete" }
      Os.rename(output.path, destination.path)
    }
    check(destination.length() == job.publishedSize) { "Published remux is incomplete" }
    job.stage = "completed"
    store.save(job)
    val event = payload(job) + mapOf("filePath" to destination.path, "progress" to 1.0)
    store.cleanInputs(job)
    jobs.remove(job.id)
    headers.remove(job.id)
    progress.remove(job.id)
    bytesWritten.remove(job.id)
    startedJobs.remove(job.id)
    emit("onDownloadComplete", event)
    store.remove(job)
  }
}
