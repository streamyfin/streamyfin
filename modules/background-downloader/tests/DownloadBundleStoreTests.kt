package expo.modules.backgrounddownloader

import java.io.File
import java.util.UUID
import org.json.JSONObject

/** Standalone JVM checks, compiled with the test AtomicFile double and org.json. */
fun main() {
  val root = File(".android-bundle-store-tests-${UUID.randomUUID()}").absoluteFile
  check(root.mkdirs())
  try {
    val store = DownloadBundleStore(root)
    val plan = DownloadBundlePlan(
      "https://example.invalid/video.mp4", listOf("https://example.invalid/audio.mp4"),
      File(root, "offline/movie.mkv").path, listOf("English", "French"), listOf("eng", "fra")
    )
    val parsed = DownloadBundlePlan.parse(plan.json())
    check(parsed == plan)
    val primaryOnly = plan.copy(audioUrls = emptyList(), audioTitles = listOf("English"), audioLanguages = listOf("eng"))
    check(DownloadBundlePlan.parse(primaryOnly.json()) == primaryOnly)
    check(runCatching {
      DownloadBundlePlan.parse(JSONObject(plan.json().toString()).put("audioTitles", org.json.JSONArray(listOf("English"))))
    }.isFailure)
    check(runCatching { store.validateDestination(File(root.parent, "outside.mkv").path) }.isFailure)
    check(store.validateDestination("file://${plan.destinationPath}") == plan.destinationPath)
    val job = DownloadBundleJob(UUID.randomUUID().toString(), -2, "movie", plan, true, 100)
    store.save(job)
    val restored = store.load().single()
    check(restored == job)
    check(restored.requiresHeaders)
    check(!job.json().has("headers"))
    store.source(job, 0).parentFile!!.mkdirs()
    store.source(job, 0).writeText("partial")
    check(store.completedSize(job, 0) == 0L)
    check(store.workingBytes(job) == 7L)
    store.source(job, 0).writeText("complete source")
    store.markComplete(job, 0)
    check(store.completedSize(restored, 0) == 15L)
    store.source(job, 0).writeText("truncated")
    check(store.completedSize(restored, 0) == 0L)
    store.source(job, 0).writeText("complete source")
    check(store.completedSize(DownloadBundleStore(root).load().single(), 0) == 15L)
    check(store.completedSize(restored, 1) == 0L)
    store.destination(job).writeText("unrelated final")
    store.output(job).writeText("partial mux")
    store.part(job, 1).writeText("interrupted download")
    check(store.workingBytes(job) == 48L)
    store.cleanInputs(job)
    store.remove(job)
    check(store.destination(job).readText() == "unrelated final")
    check(!store.source(job, 0).exists() && !store.marker(job, 0).exists())
    check(!store.part(job, 1).exists() && !store.output(job).exists())
    check(store.load().isEmpty())
    check(store.workingBytes(job) == 0L)
    println("DownloadBundleStore JVM: validation, markers, recovery, credentials, and cancellation checks passed")
  } finally {
    root.deleteRecursively()
  }
}
