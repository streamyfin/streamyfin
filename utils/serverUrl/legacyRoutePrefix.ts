/**
 * An address ending in one of the route aliases Jellyfin 12 removed
 * (jellyfin/jellyfin#15669), split into what comes before it. The host is
 * matched on its own so `https://emby` or `emby:8096` never loses its name,
 * and only the last segment goes, so a base path such as `/jellyfin` stays.
 */
const LEGACY_ROUTE_PREFIX_RE =
  /^((?:https?:\/\/)?(?:[^/?#@\s]*@)?(?:\[[^\]]*\]|[^/?#:@\s]+)(?::\d+)?(?:\/[^?#]*?[^/?#])?)\/+(?:emby|mediabrowser)\/*$/i;

/**
 * Drops a trailing `/emby` or `/mediabrowser` from a server address. Older
 * servers answer under those prefixes as well as at the root, and Jellyfin 12
 * only at the root.
 */
export function stripLegacyRoutePrefix(url: string): string {
  return url.replace(LEGACY_ROUTE_PREFIX_RE, "$1");
}
