const HOME = "/(auth)/(tabs)/(home)";

/**
 * Where a `streamyfin://topshelf/item` link lands inside the app. The other
 * half of the link built in `payload.ts`: a parameter added there is read
 * here.
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
    return `${HOME}/series/${id}`;
  }

  // The same landing a season card has inside the app (getItemNavigation):
  // the series page with that season selected. Without the series there is
  // nothing to open but the item page, which is what a tile published before
  // the link carried it still gets.
  if (type === "Season" && seriesId) {
    const season = seasonIndex ? `?seasonIndex=${seasonIndex}` : "";
    return `${HOME}/series/${seriesId}${season}`;
  }

  return `${HOME}/items/page?id=${id}`;
}
