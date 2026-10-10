import { getLocales } from "expo-localization";
// The instance `@/i18n` configures, imported bare so a module that only needs
// the current language does not pull every catalogue in with it.
import i18next from "i18next";
// Not the barrel: it pulls MMKV and SecureStore in behind it.
import { isUrlForBaseUrl } from "@/utils/customHeaders/urlMatching";

/**
 * Jellyfin 12 localizes what it answers with (`MediaStream.DisplayTitle`,
 * `LocalizedLanguage`, websocket payloads) from this request header. Older
 * servers ignore it.
 */
export const ACCEPT_LANGUAGE_HEADER = "Accept-Language";

/**
 * One language tag and nothing else: letters, digits and hyphens.
 *
 * The header could carry a weighted list (`sv,en;q=0.8`), and this
 * deliberately cannot. mpv takes its request headers as one comma separated
 * list with no way to escape a comma, so a list would reach the server as
 * several broken header lines on every stream request. The same value goes to
 * every transport rather than a richer one to some of them.
 */
const LANGUAGE_TAG = /^[a-z]{2,8}(-[a-z0-9]{1,8})*$/i;

const asLanguageTag = (value: string | null | undefined): string | undefined =>
  value && LANGUAGE_TAG.test(value) ? value : undefined;

/**
 * The language to ask the server for: the one the app is displayed in, or the
 * device's when the app has none yet. Undefined when neither is a usable tag,
 * and then no header is sent at all.
 */
export const resolveAcceptLanguage = (
  appLanguage: string | null | undefined,
  getDeviceLanguage: () => string | null | undefined,
): string | undefined =>
  asLanguageTag(appLanguage) ?? asLanguageTag(getDeviceLanguage());

/**
 * Read per request rather than captured, so a language change in settings
 * applies to the next request without recreating the `Api`.
 */
export const getAcceptLanguage = (): string | undefined =>
  // The optional chain is for a device that reports no locale at all: this
  // runs inside the request interceptor, where a throw fails the request.
  resolveAcceptLanguage(i18next.language, () => getLocales()[0]?.languageTag);

/**
 * `headers` plus the language header, for the transports that take a plain
 * object (the players, the websocket).
 *
 * A header of that name already in `headers` is left alone, whatever its
 * case: it is one the user configured as a custom header, or one the media
 * source requires, and a plain object would otherwise carry both spellings
 * and send the header twice.
 */
export const withAcceptLanguage = (
  headers: Record<string, string>,
  language: string | undefined,
): Record<string, string> => {
  if (!language) return headers;

  const name = ACCEPT_LANGUAGE_HEADER.toLowerCase();
  if (Object.keys(headers).some((key) => key.toLowerCase() === name)) {
    return headers;
  }
  return { [ACCEPT_LANGUAGE_HEADER]: language, ...headers };
};

/**
 * The same, for a player's stream headers. A player sends its headers with
 * every request it makes, and an item's stream can live on someone else's
 * host, so the language only goes along when the server is what serves `url`.
 */
export const withAcceptLanguageForUrl = (
  headers: Record<string, string>,
  url: string | null | undefined,
  serverUrl: string | null | undefined,
): Record<string, string> =>
  url && serverUrl && isUrlForBaseUrl(url, serverUrl)
    ? withAcceptLanguage(headers, getAcceptLanguage())
    : headers;
