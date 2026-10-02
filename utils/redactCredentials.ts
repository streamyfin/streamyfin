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

export const redactCredentials = (value: string): string =>
  value.replace(CREDENTIAL_PARAM_PATTERN, `$1${REDACTED_PLACEHOLDER}`);
