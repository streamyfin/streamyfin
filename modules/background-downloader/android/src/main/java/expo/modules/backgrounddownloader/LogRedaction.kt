package expo.modules.backgrounddownloader

// The parameters utils/redactCredentials.ts masks for the JS side. A release build still writes
// Log.d to logcat, and a download URL carries the session's token in its query.
private val CREDENTIAL_PARAM = Regex(
  "([?&](?:api_key|apikey|x-emby-token|access_token|token|userid|deviceid)=)[^&\\s\"']+",
  RegexOption.IGNORE_CASE
)

internal fun redactCredentials(value: String): String =
  value.replace(CREDENTIAL_PARAM, "\$1[redacted]")
