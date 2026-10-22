@file:OptIn(androidx.media3.common.util.UnstableApi::class)

package expo.modules.exoplayerplayer

import android.net.Uri
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.TransferListener
import java.io.IOException
import java.net.URI
import java.net.URISyntaxException

/*
 * Kept identical to its twin in the other player module (exoplayer-player and mpv-player);
 * modules/exoplayer-player/src/upgradeRedirectDataSource.test.ts fails when they differ.
 */

/**
 * Which requests carry a stream's headers (the Jellyfin token, custom proxy headers): those to
 * the stream's own host and port, as the app scopes custom headers (docs/custom-headers.md). A
 * scheme's default port counts as no port, so http://host and https://host are the same server,
 * and once the stream is on https the headers never go out over plain http. An HLS child
 * playlist, a segment or a subtitle on another host gets none, whatever sent the player there.
 */
internal class StreamHeaderScope(streamUrl: String) {
    private val stream = parse(streamUrl)

    fun covers(url: String): Boolean {
        val stream = stream ?: return false
        val target = parse(url) ?: return false
        if (!target.host.equals(stream.host, ignoreCase = true)) return false
        if (target.port != stream.port) return false
        return target.scheme.equals(stream.scheme, ignoreCase = true) ||
            (stream.isHttp && target.scheme.equals("https", ignoreCase = true))
    }

    /** A URL's scheme, host and port, a scheme's default port counting as none. */
    private class Address(val scheme: String, val host: String, port: Int) {
        val isHttp = scheme.equals("http", ignoreCase = true)
        val port = when {
            port == 80 && isHttp -> -1
            port == 443 && scheme.equals("https", ignoreCase = true) -> -1
            else -> port
        }
    }

    companion object {
        private val REDIRECT_CODES = setOf(300, 301, 302, 303, 307, 308)

        // An authority java.net.URI reads as registry-based, as it does a host name with an
        // underscore (a Docker service, a LAN name): optional user info, the host, a port.
        private val AUTHORITY = Regex("""^(?:[^@/]*@)?([A-Za-z0-9._~-]+|\[[0-9A-Fa-f:.]+])(?::(\d+))?$""")

        /**
         * Where a redirect from [from] to [location] leads when it is the one HttpURLConnection
         * never follows by itself, from http to https; null for any other response.
         */
        fun upgradeTarget(from: String, responseCode: Int, location: String?): String? {
            if (responseCode !in REDIRECT_CODES || location == null) return null
            val sourceUri = toUri(from) ?: return null
            val source = addressOf(sourceUri) ?: return null
            // A relative or scheme-relative location keeps the protocol: not an upgrade.
            val targetUri = try {
                sourceUri.resolve(location.trim())
            } catch (e: IllegalArgumentException) {
                return null
            }
            val target = addressOf(targetUri) ?: return null
            if (!source.isHttp || !target.scheme.equals("https", ignoreCase = true)) return null
            return targetUri.toString()
        }

        private fun parse(url: String): Address? = toUri(url)?.let(::addressOf)

        private fun toUri(url: String): URI? = try {
            URI(url)
        } catch (e: URISyntaxException) {
            null
        }

        private fun addressOf(uri: URI): Address? {
            val scheme = uri.scheme ?: return null
            if (!uri.host.isNullOrEmpty()) return Address(scheme, uri.host, uri.port)
            val authority = AUTHORITY.matchEntire(uri.rawAuthority ?: return null) ?: return null
            val port = authority.groupValues[2].toIntOrNull() ?: -1
            return Address(scheme, authority.groupValues[1], port)
        }
    }
}

/**
 * The HTTP source of both ExoPlayer paths. Each request goes out with the stream's headers only
 * when StreamHeaderScope covers its address, and an http to https redirect is followed here,
 * since HttpURLConnection refuses it. Other redirects stay with HttpURLConnection, which drops
 * Authorization when one changes origin, and a redirect from https to http still fails.
 */
internal class UpgradeRedirectDataSource internal constructor(
    private val scope: StreamHeaderScope,
    private val withHeaders: DataSource,
    private val withoutHeaders: DataSource,
) : DataSource {
    private var current: DataSource? = null

    override fun addTransferListener(transferListener: TransferListener) {
        withHeaders.addTransferListener(transferListener)
        withoutHeaders.addTransferListener(transferListener)
    }

    override fun open(dataSpec: DataSpec): Long {
        val first = sourceFor(dataSpec.uri.toString())
        current = first
        try {
            return first.open(dataSpec)
        } catch (redirect: HttpDataSource.InvalidResponseCodeException) {
            val location = redirect.headerFields.entries
                .firstOrNull { it.key?.equals("Location", ignoreCase = true) == true }
                ?.value?.firstOrNull()
            val target = StreamHeaderScope.upgradeTarget(dataSpec.uri.toString(), redirect.responseCode, location)
                ?: throw redirect
            first.close()
            val next = sourceFor(target)
            current = next
            try {
                return next.open(dataSpec.withUri(Uri.parse(target)))
            } catch (hop: IOException) {
                // The hop's own failure, with the redirect that led to it.
                hop.addSuppressed(redirect)
                throw hop
            }
        }
    }

    private fun sourceFor(url: String) = if (scope.covers(url)) withHeaders else withoutHeaders

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
        checkNotNull(current).read(buffer, offset, length)

    override fun getUri(): Uri? = current?.uri

    override fun getResponseHeaders(): Map<String, List<String>> = current?.responseHeaders ?: emptyMap()

    override fun close() {
        current?.close()
        current = null
    }

    /** [streamUrl] is the address the player loads; its host and port decide where [headers] go. */
    class Factory(private val headers: Map<String, String>, streamUrl: String) : DataSource.Factory {
        private val scope = StreamHeaderScope(streamUrl)

        override fun createDataSource(): DataSource = UpgradeRedirectDataSource(
            scope,
            DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers).createDataSource(),
            DefaultHttpDataSource.Factory().createDataSource(),
        )
    }
}
