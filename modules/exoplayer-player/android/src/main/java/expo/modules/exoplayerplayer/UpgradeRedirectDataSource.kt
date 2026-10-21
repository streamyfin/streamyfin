@file:OptIn(androidx.media3.common.util.UnstableApi::class)

package expo.modules.exoplayerplayer

import android.net.Uri
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.TransferListener
import java.net.URI

/**
 * The one redirect HttpURLConnection never follows by itself: from http to https. Media3 can
 * follow it (setAllowCrossProtocolRedirects), but then it follows every redirect itself and sends
 * each hop the stream's headers, the Jellyfin token included, whatever the host and even over
 * plain http. Here the stream's headers go on to the https address only on the same host.
 *
 * Kept identical to its twin in the mpv-player module (ExoPlayerEngine).
 */
internal object UpgradeRedirects {
    data class Hop(val target: String, val keepHeaders: Boolean)

    private val REDIRECT_CODES = setOf(300, 301, 302, 303, 307, 308)

    /** Where a response to [from] sends the request when it is an upgrade, or null. */
    fun next(from: String, responseCode: Int, location: String?): Hop? {
        if (responseCode !in REDIRECT_CODES || location == null) return null
        return try {
            val source = URI(from)
            val target = source.resolve(location.trim())
            // A relative or scheme-relative location keeps the protocol: not an upgrade.
            if (!source.scheme.equals("http", ignoreCase = true)) return null
            if (!target.scheme.equals("https", ignoreCase = true) || target.host.isNullOrEmpty()) return null
            Hop(target.toString(), keepHeaders = target.host.equals(source.host, ignoreCase = true))
        } catch (e: IllegalArgumentException) {
            null
        } catch (e: java.net.URISyntaxException) {
            null
        }
    }
}

/**
 * An HTTP source that follows an http to https redirect as UpgradeRedirects decides. Everything
 * else is DefaultHttpDataSource's own behaviour: HttpURLConnection follows the redirects that keep
 * the protocol, and drops Authorization when one of them changes origin.
 */
internal class UpgradeRedirectDataSource private constructor(
    private val withHeaders: DataSource,
    private val withoutHeaders: DataSource,
) : DataSource {
    private var current: DataSource? = null

    override fun addTransferListener(transferListener: TransferListener) {
        withHeaders.addTransferListener(transferListener)
        withoutHeaders.addTransferListener(transferListener)
    }

    override fun open(dataSpec: DataSpec): Long {
        current = withHeaders
        try {
            return withHeaders.open(dataSpec)
        } catch (e: HttpDataSource.InvalidResponseCodeException) {
            val location = e.headerFields.entries
                .firstOrNull { it.key?.equals("Location", ignoreCase = true) == true }
                ?.value?.firstOrNull()
            val hop = UpgradeRedirects.next(dataSpec.uri.toString(), e.responseCode, location) ?: throw e
            withHeaders.close()
            val source = if (hop.keepHeaders) withHeaders else withoutHeaders
            current = source
            return source.open(dataSpec.withUri(Uri.parse(hop.target)))
        }
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
        checkNotNull(current).read(buffer, offset, length)

    override fun getUri(): Uri? = current?.uri

    override fun getResponseHeaders(): Map<String, List<String>> = current?.responseHeaders ?: emptyMap()

    override fun close() {
        current?.close()
        current = null
    }

    class Factory(private val headers: Map<String, String>) : DataSource.Factory {
        override fun createDataSource(): DataSource = UpgradeRedirectDataSource(
            DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers).createDataSource(),
            DefaultHttpDataSource.Factory().createDataSource(),
        )
    }
}
