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

            // Create the base downloads directory
            val baseDownloadsDir = File(context.filesDir, "downloads")
            if (!baseDownloadsDir.exists()) {
                baseDownloadsDir.mkdirs()
                android.util.Log.d(TAG, "Created base downloads directory: ${baseDownloadsDir.absolutePath}")
            }

            val databaseProvider = StandaloneDatabaseProvider(context)

            // Initialize the cache with a temporary directory
            val tempCacheDir = File(baseDownloadsDir, "temp")
            if (!tempCacheDir.exists()) {
                tempCacheDir.mkdirs()
                android.util.Log.d(TAG, "Created temp cache directory: ${tempCacheDir.absolutePath}")
            }

            downloadCache = SimpleCache(
                tempCacheDir,
                NoOpCacheEvictor(),
                databaseProvider
            )

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

                                // Move files from temp directory to providerId directory
                                val tempDir = File(baseDownloadsDir, "temp")
                                val providerDir = File(baseDownloadsDir, metadata.providedId)
                                if (tempDir.exists() && tempDir.isDirectory) {
                                    tempDir.listFiles()?.forEach { file ->
                                        val destination = File(providerDir, file.name)
                                        if (file.renameTo(destination)) {
                                            android.util.Log.d(TAG, "Moved ${file.name} to ${destination.absolutePath}")
                                        } else {
                                            android.util.Log.e(TAG, "Failed to move ${file.name} to ${destination.absolutePath}")
                                        }
                                    }
                                }

                                // Generate the .m3u8 playlist
                                createM3U8Playlist(context, metadata.providedId)

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

            // Create the specific download directory
            val downloadDir = File(context.filesDir, "downloads/$providedId")
            if (!downloadDir.exists()) {
                downloadDir.mkdirs()
                android.util.Log.d(TAG, "Created directory: ${downloadDir.absolutePath}")
            }

            try {
                // Create MediaItem with proper URI
                val mediaItem = MediaItem.Builder()
                    .setUri(Uri.parse(url))
                    .setCustomCacheKey(providedId) // This is optional and depends on the media type
                    .build()

                val downloadRequest = DownloadRequest.Builder(providedId, Uri.parse(url))
                    .setData(providedId.toByteArray())
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
            // Save the metadata file directly in the /downloads folder
            val metadataFile = File(
                context.filesDir,
                "downloads/${metadata.providedId}.json" // Save outside the providerId folder
            )

            metadataFile.parentFile?.mkdirs()

            android.util.Log.d(TAG, "Saving metadata to: ${metadataFile.absolutePath}")
            metadataFile.writeText(JSONObject(metadata.metadata).toString())
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Error saving metadata file", e)
            e.printStackTrace()
        }
    }

    private fun createM3U8Playlist(context: Context, providerId: String) {
    val providerDir = File(context.filesDir, "downloads/$providerId")

    // Check if the provider directory exists 
    if (!providerDir.exists() || !providerDir.isDirectory) {
        android.util.Log.e("M3U8", "Provider directory does not exist: ${providerDir.absolutePath}")
        return
    }

    // List all subfolders (0/, 1/, 2/, etc.)
    val subFolders = providerDir.listFiles { file -> 
        file.isDirectory && file.name.matches(Regex("\\d+")) // Match folders with numeric names
    }

    if (subFolders.isNullOrEmpty()) {
        android.util.Log.e("M3U8", "No subfolders found in ${providerDir.absolutePath}")
        return
    }

    // Collect all .v3.exo files from subfolders
    val segmentFiles = mutableListOf<File>()
    subFolders.forEach { folder ->
        val filesInFolder = folder.listFiles { file ->
            file.isFile && file.name.endsWith(".v3.exo") 
        }
        if (!filesInFolder.isNullOrEmpty()) {
            segmentFiles.addAll(filesInFolder)
        }
    }

    if (segmentFiles.isEmpty()) {
        android.util.Log.e("M3U8", "No .v3.exo files found in any subfolder")
        return
    }

    // Sort files by their numeric names (e.g., 102.124532.v3.exo)
    val sortedFiles = segmentFiles.sortedBy { file ->
        file.nameWithoutExtension.toDoubleOrNull() ?: 0.0
    }

    // Create the .m3u8 file
    val m3u8File = File(providerDir, "playlist.m3u8")
    m3u8File.bufferedWriter().use { writer ->
        // Write the M3U8 header
        writer.write("#EXTM3U\n")
        writer.write("#EXT-X-VERSION:3\n")
        writer.write("#EXT-X-TARGETDURATION:10\n") // Adjust target duration as needed
        writer.write("#EXT-X-MEDIA-SEQUENCE:0\n") // Start sequence from 0

        // Write each segment with absolute path
        sortedFiles.forEach { file ->
            val segmentDuration = 10.0 // Adjust segment duration as needed
            val absolutePath = "file://${file.absolutePath}" // Add file:// prefix and use absolute path
            writer.write("#EXTINF:$segmentDuration,\n") 
            writer.write("$absolutePath\n") // Use absolute path instead of relative
        }

        // Write the end tag
        writer.write("#EXT-X-ENDLIST\n")
    }

    android.util.Log.d("M3U8", "Playlist created at: ${m3u8File.absolutePath}")
}
}