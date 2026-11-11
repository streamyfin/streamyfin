import { REDACTED_PLACEHOLDER } from "@/constants/Privacy";

// Credential query parameters can appear outside scheme-anchored URLs:
// server-relative paths ("/Videos/{id}/stream?ApiKey=...") and URLs broken by
// an unencoded space escape the URL regexes, so known credential params are
// redacted wherever they occur. A value runs to the next `&`, whitespace or
// quote, so punctuation right after it goes too: over-redaction is the safe
// side of this trade.
// `userId`/`deviceId` are not credentials, but they identify the person and
// their install, so they are redacted alongside the secrets.
const CREDENTIAL_PARAM_PATTERN =
  /([?&](?:api_key|apikey|x-emby-token|access_token|token|userid|deviceid)=)[^&\s"']+/gi;

// Whatever sits before the last @ of a URL's authority is userinfo: user and
// password, a token alone, an email as the user name, a password holding an @.
// A proxy's basic auth written into the server address would otherwise reach
// the log with every URL built on it. A / ? or # ends the authority, and so
// does a double quote: no URL holds one, and in a JSON log line it closes the
// string. A single quote stays in, as userinfo may hold one (RFC 3986).
const USERINFO_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)[^\s/?#"]*@/gi;

export const redactCredentials = (value: string): string =>
  value
    .replace(USERINFO_PATTERN, `$1${REDACTED_PLACEHOLDER}@`)
    .replace(CREDENTIAL_PARAM_PATTERN, `$1${REDACTED_PLACEHOLDER}`);
