package expo.modules.hlsdownloader

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.database.StandaloneDatabaseProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

class HlsDownloaderModule : Module() {
    private val TAG = "HlsDownloaderModule"
    private var activeDownloads = mutableMapOf<String, DownloadMetadata>()
    private lateinit var downloadManager: DownloadManager
    private lateinit var downloadCache: SimpleCache
    private val executor = Executors.newSingleThreadExecutor()

    data class DownloadMetadata(
        val providedId: String,
        val metadata: Map<String, Any>,
        val startTime: Long
    )

    override fun definition() = ModuleDefinition {
        Name("HlsDownloader")

        Events(
            "onProgress",
            "onError",
            "onComplete"
        )

        OnCreate {
            android.util.Log.d(TAG, "Creating HLS Downloader module")
            val context = appContext.reactContext as Context
            
            val cacheDir = File(context.filesDir, "downloads")
            if (!cacheDir.exists()) {
                cacheDir.mkdirs()
                android.util.Log.d(TAG, "Created base downloads directory: ${cacheDir.absolutePath}")
            }

            val databaseProvider = StandaloneDatabaseProvider(context)
            downloadCache = SimpleCache(cacheDir, NoOpCacheEvictor(), databaseProvider)

            val dataSourceFactory = DefaultHttpDataSource.Factory()
                .setUserAgent("Streamyfin/1.0")
                .setAllowCrossProtocolRedirects(true)

            downloadManager = DownloadManager(
                context,
                databaseProvider,
                downloadCache,
                dataSourceFactory,
                executor
            )

            downloadManager.addListener(object : DownloadManager.Listener {
                override fun onDownloadChanged(
                    downloadManager: DownloadManager,
                    download: Download,
                    finalException: Exception?
                ) {
                    android.util.Log.d(TAG, "Download changed - State: ${download.state}, Progress: ${download.percentDownloaded}%")

                    val metadata = activeDownloads[download.request.id]
                    if (metadata != null) {
                        when (download.state) {
                            Download.STATE_COMPLETED -> {
                                android.util.Log.d(TAG, "Download completed for ${metadata.providedId}")
                                sendEvent(
                                    "onComplete",
                                    mapOf(
                                        "id" to metadata.providedId,
                                        "location" to download.request.uri.toString(),
                                        "state" to "DONE",
                                        "metadata" to metadata.metadata,
                                        "startTime" to metadata.startTime
                                    )
                                )
                                activeDownloads.remove(download.request.id)
                                saveMetadataFile(metadata)
                            }
                            Download.STATE_FAILED -> {
                                android.util.Log.e(TAG, "Download failed for ${metadata.providedId}", finalException)
                                sendEvent(
                                    "onError",
                                    mapOf(
                                        "id" to metadata.providedId,
                                        "error" to (finalException?.message ?: "Download failed"),
                                        "state" to "FAILED",
                                        "metadata" to metadata.metadata,
                                        "startTime" to metadata.startTime
                                    )
                                )
                                activeDownloads.remove(download.request.id)
                            }
                            else -> {
                                val progress = if (download.contentLength > 0) {
                                    download.bytesDownloaded.toFloat() / download.contentLength
                                } else 0f

                                android.util.Log.d(TAG, "Download progress for ${metadata.providedId}: $progress")

                                sendEvent(
                                    "onProgress",
                                    mapOf(
                                        "id" to metadata.providedId,
                                        "progress" to progress,
                                        "state" to when (download.state) {
                                            Download.STATE_DOWNLOADING -> "DOWNLOADING"
                                            Download.STATE_QUEUED -> "PENDING"
                                            Download.STATE_STOPPED -> "STOPPED"
                                            Download.STATE_REMOVING -> "REMOVING"
                                            Download.STATE_RESTARTING -> "RESTARTING"
                                            else -> "UNKNOWN"
                                        },
                                        "metadata" to metadata.metadata,
                                        "startTime" to metadata.startTime,
                                        "taskId" to download.request.id
                                    )
                                )
                            }
                        }
                    } else {
                        android.util.Log.w(TAG, "Received download update for unknown download id: ${download.request.id}")
                    }
                }

                override fun onDownloadsPausedChanged(
                    downloadManager: DownloadManager,
                    downloadsPaused: Boolean
                ) {
                    android.util.Log.d(TAG, "Downloads paused changed: $downloadsPaused")
                }

                override fun onIdle(downloadManager: DownloadManager) {
                    android.util.Log.d(TAG, "Download manager is idle")
                }
            })

            downloadManager.resumeDownloads()
        }

        Function("getActiveDownloads") {
            activeDownloads.map { (taskId, metadata) ->
                mapOf(
                    "id" to metadata.providedId,
                    "state" to "DOWNLOADING",
                    "metadata" to metadata.metadata,
                    "startTime" to metadata.startTime,
                    "taskId" to taskId
                )
            }
        }

        Function("downloadHLSAsset") { providedId: String, url: String, metadata: Map<String, Any>? ->
             android.util.Log.d(TAG, "Starting download for $providedId from $url")
            val startTime = System.currentTimeMillis()
            val context = appContext.reactContext as Context

            // Create the directory for this download
            val downloadDir = File(context.filesDir, "downloads/$providedId")
            if (!downloadDir.exists()) {
                downloadDir.mkdirs()
                android.util.Log.d(TAG, "Created directory: ${downloadDir.absolutePath}")
            }

            try {
                val downloadRequest = DownloadRequest.Builder(
                    providedId,
                    Uri.parse(url)
                )
                .setStreamKeys(emptyList())
                .build()

                downloadManager.addDownload(downloadRequest)
                android.util.Log.d(TAG, "Download request added for $providedId")

                saveMetadataFile(DownloadMetadata(
                    providedId = providedId,
                    metadata = metadata ?: emptyMap(),
                    startTime = startTime
                ))

                activeDownloads[providedId] = DownloadMetadata(
                    providedId = providedId,
                    metadata = metadata ?: emptyMap(),
                    startTime = startTime
                )

                sendEvent(
                    "onProgress",
                    mapOf(
                        "id" to providedId,
                        "progress" to 0.0,
                        "state" to "PENDING",
                        "metadata" to (metadata ?: emptyMap()),
                        "startTime" to startTime
                    )
                )

            } catch (e: Exception) {
                android.util.Log.e(TAG, "Error starting download for $providedId", e)
                sendEvent(
                    "onError",
                    mapOf(
                        "id" to providedId,
                        "error" to e.message,
                        "state" to "FAILED",
                        "metadata" to (metadata ?: emptyMap()),
                        "startTime" to startTime
                    )
                )
            }
        }

        Function("cancelDownload") { providedId: String ->
            activeDownloads[providedId]?.let { metadata ->
                downloadManager.removeDownload(providedId)
                sendEvent(
                    "onError",
                    mapOf(
                        "id" to metadata.providedId,
                        "error" to "Download cancelled",
                        "state" to "CANCELLED",
                        "metadata" to metadata.metadata,
                        "startTime" to metadata.startTime
                    )
                )
                activeDownloads.remove(providedId)
            }
        }
    }

    private fun saveMetadataFile(metadata: DownloadMetadata) {
        try {
            val context = appContext.reactContext as Context
            // Create metadata file in internal storage
            val metadataFile = File(
                context.filesDir,
                "downloads/${metadata.providedId}/${metadata.providedId}.json"
            )
            
            // Ensure the parent directory exists
            metadataFile.parentFile?.mkdirs()
            
            android.util.Log.d(TAG, "Saving metadata to: ${metadataFile.absolutePath}")
            metadataFile.writeText(JSONObject(metadata.metadata).toString())
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Error saving metadata file", e)
            e.printStackTrace()
        }
    }
}

