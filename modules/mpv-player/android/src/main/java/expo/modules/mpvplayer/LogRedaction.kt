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
