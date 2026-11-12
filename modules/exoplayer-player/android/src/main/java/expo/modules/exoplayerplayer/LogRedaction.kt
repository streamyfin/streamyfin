package expo.modules.exoplayerplayer

// The parameters utils/redactCredentials.ts masks for the JS side, plus the userinfo of a URL that carries credentials before its host. A release build still writes
// Log.d to logcat, and an external subtitle URL carries the session's token in its query.
// Whatever sits before an @ in the authority is userinfo: user:password, an empty user
// (:password@), a token alone (token@), a password holding a colon, or an @ (an email as
// the user name): it runs to the last @ of the authority. A scheme is case insensitive, and
// userinfo never runs past the authority: a / ? or # ends it (RFC 3986), and so does a
// double quote, which no URL holds and which closes the string in a JSON log line.
private val USERINFO = Regex(
    "([a-z][a-z0-9+.-]*://)[^\\s/?#\"]*@",
    RegexOption.IGNORE_CASE
)
private val CREDENTIAL_PARAM = Regex(
    "([?&](?:api_key|apikey|x-emby-token|access_token|token|userid|deviceid)=)[^&\\s\"']+",
    RegexOption.IGNORE_CASE
)

internal fun redactCredentials(value: String): String =
    value
        .replace(USERINFO, "$1[redacted]@")
        .replace(CREDENTIAL_PARAM, "$1[redacted]")

// An item or media source id, with or without its dashes.
private const val JELLYFIN_ID =
    "[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}"
// Jellyfin's own media routes, whole: an item's stream, HLS playlist or segment (the fMP4
// init segment is -1), sidecar subtitle with or without its start ticks, and Live TV's stream
// files. Routes match in any case, as Jellyfin serves them (a TranscodingUrl is lowercase).
// Whatever precedes the route (a base path) is group 1.
private val JELLYFIN_MEDIA_ROUTE = Regex(
    "^(.*?)(" +
        "/(?:Videos|Audio)/$JELLYFIN_ID/(?:stream(?:\\.\\w+)?|universal|(?:master|main|live)\\.m3u8|" +
        "hls1?/\\w+/-?\\d+\\.\\w+|$JELLYFIN_ID/Subtitles/\\d+/(?:(?:\\d+/)?Stream\\.\\w+|subtitles\\.m3u8))|" +
        "/LiveTv/(?:LiveStreamFiles|LiveRecordings)/$JELLYFIN_ID/stream(?:\\.\\w+)?" +
        ")$",
    RegexOption.IGNORE_CASE
)
private val REMOTE_URL = Regex(
    "([a-z][a-z0-9+.-]*://)(?:[^\\s/?#]*@)?([^\\s/?#\"'<>]*)([^\\s\"'<>]*)",
    RegexOption.IGNORE_CASE
)
private val LOCAL_SCHEMES = setOf("file://", "content://", "asset://", "android.resource://")

/**
 * Every URL in [text] as a log line may carry it. A URL whose path is one of Jellyfin's media
 * routes keeps that route, credentials masked, with any base path before it hidden; a local file
 * keeps its path; any other URL keeps only its origin. A path handed through from a remote source
 * (an IPTV or .strm item) can hold its credentials as path segments (/movie/USER/PASS/123.mkv),
 * which no parameter list can name, so only a route matched whole is trusted.
 */
internal fun redactStreamUrls(text: String): String =
    REMOTE_URL.replace(redactCredentials(text)) { url ->
        val (scheme, host, rest) = url.destructured
        val path = rest.substringBefore('?').substringBefore('#')
        val route = JELLYFIN_MEDIA_ROUTE.matchEntire(path)
        when {
            scheme.lowercase() in LOCAL_SCHEMES -> url.value
            route != null -> {
                val base = if (route.groupValues[1].isEmpty()) "" else "/[base]"
                scheme + host + base + route.groupValues[2] + rest.substring(path.length)
            }
            else -> "$scheme$host/[redacted]"
        }
    }
