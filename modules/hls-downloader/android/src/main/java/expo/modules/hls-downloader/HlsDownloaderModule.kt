package com.example.hlsdownloader

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.exoplayer.offline.DownloadRequest
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

@UnstableApi
class HlsDownloaderModule(private val context: ReactContext) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val downloadCache: SimpleCache
    private val downloadManager: DownloadManager
    private val activeDownloads = ConcurrentHashMap<String, DownloadInfo>()

    data class DownloadInfo(
        val metadata: Map<String, Any>,
        val startTime: Long,
        var downloadRequest: DownloadRequest? = null
    )

    init {
        // Initialize download cache
        val downloadDirectory = File(context.filesDir, "downloads")
        if (!downloadDirectory.exists()) {
            downloadDirectory.mkdirs()
        }
        
        downloadCache = SimpleCache(
            downloadDirectory,
            NoOpCacheEvictor(),
            DefaultHttpDataSource.Factory()
        )

        // Initialize download manager
        downloadManager = DownloadManager(
            context,
            createDatabaseProvider(),
            downloadCache,
            DefaultHttpDataSource.Factory(),
            null
        )

        // Start tracking downloads
        downloadManager.addListener(object : DownloadManager.Listener {
            override fun onDownloadChanged(
                downloadManager: DownloadManager,
                download: Download,
                finalException: Exception?
            ) {
                val downloadInfo = activeDownloads[download.request.id] ?: return
                
                when (download.state) {
                    Download.STATE_DOWNLOADING -> {
                        sendEvent("onProgress", mapOf(
                            "id" to download.request.id,
                            "progress" to (download.percentDownloaded / 100.0),
                            "state" to "DOWNLOADING",
                            "metadata" to downloadInfo.metadata,
                            "startTime" to downloadInfo.startTime
                        ))
                    }
                    Download.STATE_COMPLETED -> {
                        handleCompletedDownload(download, downloadInfo)
                    }
                    Download.STATE_FAILED -> {
                        handleFailedDownload(download, downloadInfo, finalException)
                    }
                }
            }
        })
    }

    fun downloadHLSAsset(providedId: String, url: String, metadata: Map<String, Any>?) {
        val startTime = System.currentTimeMillis()
        
        // Check if download already exists
        val downloadDir = File(context.filesDir, "downloads/$providedId")
        if (downloadDir.exists() && downloadDir.list()?.any { it.endsWith(".m3u8") } == true) {
            sendEvent("onComplete", mapOf(
                "id" to providedId,
                "location" to downloadDir.absolutePath,
                "state" to "DONE",
                "metadata" to (metadata ?: emptyMap()),
                "startTime" to startTime
            ))
            return
        }

        try {
            val mediaItem = MediaItem.fromUri(Uri.parse(url))
            val downloadRequest = DownloadRequest.Builder(providedId, mediaItem.mediaId)
                .setCustomCacheKey(providedId)
                .setData(metadata?.toString()?.toByteArray() ?: ByteArray(0))
                .build()

            activeDownloads[providedId] = DownloadInfo(
                metadata = metadata ?: emptyMap(),
                startTime = startTime,
                downloadRequest = downloadRequest
            )

            downloadManager.addDownload(downloadRequest)
            
            sendEvent("onProgress", mapOf(
                "id" to providedId,
                "progress" to 0.0,
                "state" to "PENDING",
                "metadata" to (metadata ?: emptyMap()),
                "startTime" to startTime
            ))
        } catch (e: Exception) {
            sendEvent("onError", mapOf(
                "id" to providedId,
                "error" to e.localizedMessage,
                "state" to "FAILED",
                "metadata" to (metadata ?: emptyMap()),
                "startTime" to startTime
            ))
        }
    }

    fun cancelDownload(providedId: String) {
        val downloadInfo = activeDownloads[providedId] ?: return
        downloadInfo.downloadRequest?.let { request ->
            downloadManager.removeDownload(request.id)
            sendEvent("onError", mapOf(
                "id" to providedId,
                "error" to "Download cancelled",
                "state" to "CANCELLED",
                "metadata" to downloadInfo.metadata,
                "startTime" to downloadInfo.startTime
            ))
            activeDownloads.remove(providedId)
        }
    }

    private fun handleCompletedDownload(download: Download, downloadInfo: DownloadInfo) {
        try {
            val downloadDir = File(context.filesDir, "downloads/${download.request.id}")
            if (!downloadDir.exists()) {
                downloadDir.mkdirs()
            }

            // Save metadata if present
            downloadInfo.metadata.takeIf { it.isNotEmpty() }?.let { metadata ->
                val metadataFile = File(downloadDir, "${download.request.id}.json")
                metadataFile.writeText(JSONObject(metadata).toString())
            }

            sendEvent("onComplete", mapOf(
                "id" to download.request.id,
                "location" to downloadDir.absolutePath,
                "state" to "DONE",
                "metadata" to downloadInfo.metadata,
                "startTime" to downloadInfo.startTime
            ))
        } catch (e: Exception) {
            handleFailedDownload(download, downloadInfo, e)
        } finally {
            activeDownloads.remove(download.request.id)
        }
    }

    private fun handleFailedDownload(
        download: Download,
        downloadInfo: DownloadInfo,
        error: Exception?
    ) {
        sendEvent("onError", mapOf(
            "id" to download.request.id,
            "error" to (error?.localizedMessage ?: "Unknown error"),
            "state" to "FAILED",
            "metadata" to downloadInfo.metadata,
            "startTime" to downloadInfo.startTime
        ))
        activeDownloads.remove(download.request.id)
    }

    private fun createDatabaseProvider() = StandaloneDatabaseProvider(context)

    private fun sendEvent(eventName: String, params: Map<String, Any>) {
        mainHandler.post {
            context
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    companion object {
        private const val DOWNLOAD_CONTENT_DIRECTORY = "downloads"
    }
}