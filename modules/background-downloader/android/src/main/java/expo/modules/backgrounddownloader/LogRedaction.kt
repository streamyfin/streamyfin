package expo.modules.backgrounddownloader

// What utils/redactCredentials.ts masks for the JS side: the credential parameters, and the
// userinfo of a URL that carries credentials before its host (a proxy's basic auth in the server
// address). A release build still writes Log.d to logcat, and a download URL carries the session's
// token in its query. Userinfo runs to the last @ of the authority, which a / ? or # ends.
private val USERINFO = Regex(
  "([a-z][a-z0-9+.-]*://)[^\\s/?#]*@",
  RegexOption.IGNORE_CASE
)
private val CREDENTIAL_PARAM = Regex(
  "([?&](?:api_key|apikey|x-emby-token|access_token|token|userid|deviceid)=)[^&\\s\"']+",
  RegexOption.IGNORE_CASE
)

internal fun redactCredentials(value: String): String =
  value
    .replace(USERINFO, "\$1[redacted]@")
    .replace(CREDENTIAL_PARAM, "\$1[redacted]")
