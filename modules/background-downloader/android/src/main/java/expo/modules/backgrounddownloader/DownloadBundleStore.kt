package expo.modules.backgrounddownloader

import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URI

internal data class DownloadBundlePlan(
  val videoUrl: String,
  val audioUrls: List<String>,
  val destinationPath: String,
  val audioTitles: List<String>,
  val audioLanguages: List<String>
) {
  val urls get() = listOf(videoUrl) + audioUrls

  fun json() = JSONObject().apply {
    put("videoUrl", videoUrl)
    put("audioUrls", JSONArray(audioUrls))
    put("destinationPath", destinationPath)
    put("audioTitles", JSONArray(audioTitles))
    put("audioLanguages", JSONArray(audioLanguages))
  }

  companion object {
    fun parse(json: JSONObject): DownloadBundlePlan {
      fun strings(key: String): List<String> = json.getJSONArray(key).let { array ->
        (0 until array.length()).map { array.getString(it) }
      }
      return DownloadBundlePlan(
        json.getString("videoUrl"), strings("audioUrls"), json.getString("destinationPath"),
        strings("audioTitles"), strings("audioLanguages")
      ).also { plan ->
        require(plan.audioTitles.size == plan.urls.size &&
          plan.audioLanguages.size == plan.urls.size && plan.destinationPath.endsWith(".mkv", true)) {
          "Invalid multi-track download plan"
        }
        require(plan.urls.all {
          val uri = URI(it)
          uri.scheme?.lowercase() in listOf("http", "https") && uri.host != null
        }) { "Invalid multi-track source URL" }
      }
    }
  }
}

internal data class DownloadBundleJob(
  val id: String,
  val taskId: Int,
  val itemId: String,
  var plan: DownloadBundlePlan,
  var requiresHeaders: Boolean,
  var estimatedTotalBytes: Long,
  var stage: String = "queued",
  var error: String? = null,
  var publishedSize: Long = 0,
  var labels: Map<String, String> = emptyMap()
) {
  fun json() = JSONObject().apply {
    put("id", id)
    put("taskId", taskId)
    put("itemId", itemId)
    put("plan", plan.json())
    put("requiresHeaders", requiresHeaders)
    put("estimatedTotalBytes", estimatedTotalBytes)
    put("stage", stage)
    error?.let { put("error", it) }
    put("publishedSize", publishedSize)
    put("labels", JSONObject(labels))
  }
}

/** Only completion markers prove a source is reusable; file existence alone never does. */
internal class DownloadBundleStore(private val documentsRoot: File) {
  private val directory = File(documentsRoot, "multi-track-downloads")

  fun validateDestination(path: String): String {
    val file = (if (path.startsWith("file://")) File(URI(path)) else File(path)).canonicalFile
    require(file.path.startsWith(documentsRoot.canonicalPath + File.separator)) {
      "Multi-track destination must be inside app documents"
    }
    return file.path
  }

  fun destination(job: DownloadBundleJob) = File(job.plan.destinationPath)
  fun source(job: DownloadBundleJob, index: Int) = File("${job.plan.destinationPath}.bundle-${job.id}.$index.mp4")
  fun part(job: DownloadBundleJob, index: Int) = File("${source(job, index).path}.part")
  fun marker(job: DownloadBundleJob, index: Int) = File("${source(job, index).path}.complete")
  fun output(job: DownloadBundleJob) = File("${job.plan.destinationPath}.bundle-${job.id}.muxing.mkv")

  fun completedSize(job: DownloadBundleJob, index: Int): Long {
    val expected = runCatching { String(AtomicFile(marker(job, index)).readFully()).toLong() }.getOrNull() ?: return 0
    return if (expected > 0 && source(job, index).length() == expected) expected else 0
  }

  fun workingBytes(job: DownloadBundleJob): Long = output(job).length() +
    job.plan.urls.indices.sumOf { source(job, it).length() + part(job, it).length() + marker(job, it).length() }

  fun save(job: DownloadBundleJob) {
    check(directory.isDirectory || directory.mkdirs()) { "Cannot create download manifest directory" }
    atomicWrite(File(directory, "${job.id}.json"), job.json().toString().toByteArray())
  }

  fun markComplete(job: DownloadBundleJob, index: Int) {
    val size = source(job, index).length()
    check(size > 0) { "Downloaded track is empty" }
    atomicWrite(marker(job, index), size.toString().toByteArray())
  }

  private fun atomicWrite(file: File, bytes: ByteArray) {
    val atomic = AtomicFile(file)
    val stream = atomic.startWrite()
    try {
      stream.write(bytes)
      atomic.finishWrite(stream)
    } catch (error: Exception) {
      atomic.failWrite(stream)
      throw error
    }
  }

  fun load(): List<DownloadBundleJob> =
    directory.listFiles()?.map { File(directory, it.name.removeSuffix(".bak")) }
      ?.filter { it.extension == "json" }?.distinctBy { it.name }?.mapNotNull { file ->
      runCatching {
        val json = JSONObject(String(AtomicFile(file).readFully()))
        val id = json.getString("id")
        java.util.UUID.fromString(id)
        val plan = DownloadBundlePlan.parse(json.getJSONObject("plan"))
        validateDestination(plan.destinationPath)
        DownloadBundleJob(
          id, json.getInt("taskId"), json.getString("itemId"), plan,
          json.getBoolean("requiresHeaders"), json.optLong("estimatedTotalBytes"),
          json.optString("stage", "queued"), json.optString("error").takeIf { it.isNotEmpty() },
          json.optLong("publishedSize"),
          json.optJSONObject("labels")?.let { labels ->
            labels.keys().asSequence().associateWith { labels.getString(it) }
          } ?: emptyMap()
        )
      }.getOrNull()
    }?.sortedByDescending { it.taskId } ?: emptyList()

  fun cleanInputs(job: DownloadBundleJob) {
    job.plan.urls.indices.forEach {
      source(job, it).delete()
      part(job, it).delete()
      AtomicFile(marker(job, it)).delete()
    }
    output(job).delete()
  }

  fun remove(job: DownloadBundleJob) = AtomicFile(File(directory, "${job.id}.json")).delete()
}
