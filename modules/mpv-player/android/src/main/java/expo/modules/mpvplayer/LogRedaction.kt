package expo.modules.mpvplayer

// The parameters utils/redactCredentials.ts masks for the JS side, plus the userinfo of a URL that carries credentials before its host. A release build still writes
// Log.d to logcat, and an external subtitle URL carries the session's token in its query.
// Whatever sits before an @ in the authority is userinfo: user:password, an empty user
// (:password@), a token alone (token@), a password holding a colon. A scheme is case
// insensitive, and userinfo never runs past the authority: a / ? or # ends it (RFC 3986).
private val USERINFO = Regex(
    "([a-z][a-z0-9+.-]*://)[^\\s/?#@]+@",
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

// Jellyfin's own media endpoints, behind any base path: /Videos/{id}/..., /Audio/{id}/... (an item
// id with or without its dashes) and Live TV's.
private val JELLYFIN_MEDIA_PATH = Regex(
    "/(?:(?:Videos|Audio)/[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}|LiveTv)(?:[/?#]|$)"
)
private val REMOTE_URL = Regex(
    "([a-z][a-z0-9+.-]*://)(?:[^\\s/?#@]+@)?([^\\s/?#\"'<>]*)([^\\s\"'<>]*)",
    RegexOption.IGNORE_CASE
)
private val LOCAL_SCHEMES = setOf("file://", "content://", "asset://", "android.resource://")

/**
 * Every URL in [text] as a log line may carry it. A Jellyfin endpoint keeps its path, credentials
 * masked; a local file keeps its path; any other URL keeps only its origin. A path handed through
 * from a remote source (an IPTV or .strm item) can hold its credentials as path segments
 * (/movie/USER/PASS/123.mkv), which no parameter list can name.
 */
internal fun redactStreamUrls(text: String): String =
    REMOTE_URL.replace(redactCredentials(text)) { url ->
        val (scheme, host, rest) = url.destructured
        when {
            scheme.lowercase() in LOCAL_SCHEMES -> url.value
            JELLYFIN_MEDIA_PATH.containsMatchIn(rest.substringBefore('?').substringBefore('#')) -> url.value
            else -> "$scheme$host/[redacted]"
        }
    }
