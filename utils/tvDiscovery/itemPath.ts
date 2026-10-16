const HOME = "/(auth)/(tabs)/(home)";

// A season number the way the payload builder writes it: digits and nothing
// else.
const SEASON_INDEX = /^\d+$/;

/**
 * Where a `streamyfin://topshelf/item` link lands inside the app. The other
 * half of the link built in `payload.ts`: a parameter added there is read
 * here.
 *
 * The values come from a deep link, so anyone can write one, and the router
 * hands them over already decoded. Each goes back into the path encoded, the
 * way `payload.ts` wrote it, so a value stays a value: it cannot add a
 * parameter of its own or point at another screen.
 */
export function getTopShelfItemPath({
  id,
  type,
  seriesId,
  seasonIndex,
}: {
  id: string;
  type?: string;
  seriesId?: string;
  seasonIndex?: string;
}): string {
  if (type === "Series") {
    return `${HOME}/series/${encodeURIComponent(id)}`;
  }

  // The same landing a season card has inside the app (getItemNavigation):
  // the series page with that season selected. Without the series there is
  // nothing to open but the item page, which is what a tile published before
  // the link carried it still gets.
  if (type === "Season" && seriesId) {
    const season =
      seasonIndex && SEASON_INDEX.test(seasonIndex)
        ? `?seasonIndex=${seasonIndex}`
        : "";
    return `${HOME}/series/${encodeURIComponent(seriesId)}${season}`;
  }

  return `${HOME}/items/page?id=${encodeURIComponent(id)}`;
}
