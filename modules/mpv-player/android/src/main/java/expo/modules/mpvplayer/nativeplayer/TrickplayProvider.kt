package expo.modules.mpvplayer.nativeplayer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max
import kotlin.math.roundToInt

class TrickplayProvider(private val config: TrickplayRecord) {

    private val scope = CoroutineScope(Dispatchers.IO)
    private val maxCacheBytes = 50 * 1024 * 1024 // 50 MB
    private val cache = object : LruCache<Int, Bitmap>(maxCacheBytes) {
        override fun sizeOf(key: Int, value: Bitmap): Int {
            return value.byteCount
        }
    }

    private val inflight = ConcurrentHashMap<Int, Deferred<Bitmap?>>()

    val isAvailable: Boolean
        get() = config.sheetUrls.isNotEmpty() &&
                config.intervalMs > 0 &&
                config.tileCols > 0 &&
                config.tileRows > 0 &&
                config.thumbWidth > 0 &&
                config.thumbHeight > 0

    val aspectRatio: Double
        get() = if (config.thumbHeight > 0 && config.thumbWidth > 0) config.thumbWidth / config.thumbHeight else 16.0 / 9.0

    fun tileIndex(seconds: Double): Int {
        if (!isAvailable) return 0
        return max(0, ((seconds * 1000) / config.intervalMs).toInt())
    }

    suspend fun thumbnail(seconds: Double): Bitmap? = withContext(Dispatchers.IO) {
        if (!isAvailable) return@withContext null

        val tile = tileIndex(seconds)
        val tilesPerSheet = config.tileCols * config.tileRows
        if (tilesPerSheet <= 0) return@withContext null

        val sheetIndex = tile / tilesPerSheet
        if (sheetIndex < 0 || sheetIndex >= config.sheetUrls.size) return@withContext null

        val tileInSheet = tile % tilesPerSheet
        val col = tileInSheet % config.tileCols
        val row = tileInSheet / config.tileCols

        val sheet = getSheetBitmap(sheetIndex) ?: return@withContext null

        // Warm neighboring sheets
        prefetchSheet(sheetIndex + 1)
        prefetchSheet(sheetIndex - 1)

        val actualTileW = sheet.width.toFloat() / maxOf(1, config.tileCols).toFloat()
        val sheetAspect = if (config.thumbHeight > 0 && config.thumbWidth > 0) {
            config.thumbWidth / config.thumbHeight
        } else {
            16.0 / 9.0
        }
        val actualTileH = (actualTileW / sheetAspect).toFloat()

        val cropX = (col * actualTileW).roundToInt().coerceIn(0, maxOf(0, sheet.width - 1))
        val cropY = (row * actualTileH).roundToInt().coerceIn(0, maxOf(0, sheet.height - 1))
        val cropW = actualTileW.roundToInt().coerceAtMost(sheet.width - cropX)
        val cropH = actualTileH.roundToInt().coerceAtMost(sheet.height - cropY)

        if (cropW <= 0 || cropH <= 0) return@withContext null

        try {
            Bitmap.createBitmap(sheet, cropX, cropY, cropW, cropH)
        } catch (e: Exception) {
            null
        }
    }

    private suspend fun getSheetBitmap(index: Int): Bitmap? {
        cache.get(index)?.let { return it }

        val existingDeferred = inflight[index]
        if (existingDeferred != null) {
            return existingDeferred.await()
        }

        if (index < 0 || index >= config.sheetUrls.size) return null
        val urlString = config.sheetUrls[index]

        val deferred = scope.async {
            try {
                val bitmap = if (urlString.startsWith("file://")) {
                    val filePath = Uri.parse(urlString).path ?: urlString.removePrefix("file://")
                    BitmapFactory.decodeFile(File(filePath).absolutePath)
                } else {
                    val url = URL(urlString)
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 10000
                        readTimeout = 20000
                        config.headers?.forEach { (k, v) -> setRequestProperty(k, v) }
                    }
                    conn.inputStream.use { input ->
                        BitmapFactory.decodeStream(input)
                    }
                }
                if (bitmap != null) {
                    cache.put(index, bitmap)
                }
                bitmap
            } catch (e: Exception) {
                null
            } finally {
                inflight.remove(index)
            }
        }

        inflight[index] = deferred
        return deferred.await()
    }

    private fun prefetchSheet(index: Int) {
        if (index < 0 || index >= config.sheetUrls.size) return
        if (cache.get(index) != null || inflight.containsKey(index)) return
        scope.launch {
            getSheetBitmap(index)
        }
    }
}
