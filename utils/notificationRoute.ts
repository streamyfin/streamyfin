/**
 * Where a notification takes the app when it is opened.
 *
 * The plugin sends what the notification is about rather than a route, since a route is
 * the app's to know: an item's id and type, and for a batch of episodes the series and
 * the season they arrived in. A notification that says none of that opens the app where
 * it was, which is what anything posted to the plugin's own endpoint does.
 */
export const notificationRoute = (
  data: Record<string, unknown> | undefined | null,
): string | null => {
  if (!data) return null;

  // Anything that already carries a route, such as a notification posted by hand, is
  // taken as it is.
  if (typeof data.url === "string" && data.url.length > 0) return data.url;

  const type = (data.type ?? "").toString().toLowerCase();
  const itemId = typeof data.id === "string" ? data.id : undefined;
  const seriesId =
    typeof data.seriesId === "string" ? data.seriesId : undefined;
  const seasonIndex = data.seasonIndex;

  if (type === "movie" && itemId)
    return `/(auth)/(tabs)/home/items/page?id=${itemId}`;

  if (type !== "episode") return null;

  // One episode, so its own page.
  if (itemId) return `/(auth)/(tabs)/home/items/page?id=${itemId}`;

  // A season's worth of them, so the series, at that season when it is named.
  if (!seriesId) return null;

  return seasonIndex === undefined || seasonIndex === null || seasonIndex === ""
    ? `/(auth)/(tabs)/home/series/${seriesId}`
    : `/(auth)/(tabs)/home/series/${seriesId}?seasonIndex=${seasonIndex}`;
};
