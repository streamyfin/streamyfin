package expo.modules.mpvplayer.nativeplayer.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * Minimal bitmap loader for the player chrome (next-episode card, episode
 * list). The module pulls in no image library, so this mirrors the fetch
 * TrickplayProvider and MediaSessionController already do by hand — http(s)
 * plus the file:// URLs that offline downloads produce — behind an LruCache
 * and a per-URL inflight latch so a recomposition storm can't fan out fetches.
 */
private object RemoteImageCache {
    private const val MAX_CACHE_BYTES = 16 * 1024 * 1024 // 16 MB

    private val scope = CoroutineScope(Dispatchers.IO)
    private val cache = object : LruCache<String, Bitmap>(MAX_CACHE_BYTES) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }
    private val inflight = ConcurrentHashMap<String, Deferred<Bitmap?>>()

    suspend fun load(url: String): Bitmap? {
        cache.get(url)?.let { return it }
        inflight[url]?.let { return it.await() }

        val deferred = scope.async {
            try {
                val bitmap = if (url.startsWith("file://")) {
                    val path = Uri.parse(url).path ?: url.removePrefix("file://")
                    BitmapFactory.decodeFile(File(path).absolutePath)
                } else {
                    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                        connectTimeout = 10000
                        readTimeout = 20000
                    }
                    conn.inputStream.use { BitmapFactory.decodeStream(it) }
                }
                bitmap?.also { cache.put(url, it) }
            } catch (e: Exception) {
                null
            } finally {
                inflight.remove(url)
            }
        }
        inflight[url] = deferred
        return deferred.await()
    }
}

/**
 * Draws [url] once it resolves, holding a faint placeholder fill until then —
 * the card must not reflow when the image lands, so the caller always sizes it.
 */
@Composable
fun RemoteImage(
    url: String?,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    contentScale: ContentScale = ContentScale.Crop
) {
    var bitmap by remember(url) { mutableStateOf<Bitmap?>(null) }

    LaunchedEffect(url) {
        bitmap = url?.takeIf { it.isNotBlank() }?.let { RemoteImageCache.load(it) }
    }

    Box(modifier = modifier.background(Color.White.copy(alpha = 0.08f))) {
        bitmap?.let { bmp ->
            Image(
                bitmap = bmp.asImageBitmap(),
                contentDescription = contentDescription,
                contentScale = contentScale,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}
