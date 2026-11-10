import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { TFunction } from "i18next";
import type { TrailerSource } from "@/utils/atoms/settings";

export type Trailer =
  | { source: "library"; id: string; name?: string | null; item: BaseItemDto }
  | { source: "remote"; url: string; name?: string | null };

/** The trailer source choices in the order the settings list them. */
export const TRAILER_SOURCE_LABEL_KEYS: Record<TrailerSource, string> = {
  preferLibrary: "home.settings.appearance.trailer_source_prefer_library",
  preferRemote: "home.settings.appearance.trailer_source_prefer_remote",
  libraryOnly: "home.settings.appearance.trailer_source_library_only",
  remoteOnly: "home.settings.appearance.trailer_source_remote_only",
};

export interface RemoteTrailerLink {
  url?: string | null;
  name?: string | null;
}

/** A library trailer: its own item, or a video kept as a trailer extra. */
export const isTrailerItem = (item: BaseItemDto) =>
  item.Type === "Trailer" || item.ExtraType === "Trailer";

/**
 * The title the player shows. A trailer says it is one: its own name is
 * usually just the film's, which reads as the film playing.
 */
export const playerTitle = (t: TFunction, item: BaseItemDto) =>
  item.Name && isTrailerItem(item)
    ? t("player.trailer_title", { name: item.Name })
    : (item.Name ?? undefined);

/**
 * Each trailer's name with where it plays from, as the trailer pickers list
 * them. Entries that would read the same are numbered: providers name most
 * remote trailers just "Trailer".
 */
export const trailerLabels = (t: TFunction, trailers: Trailer[]) => {
  const names = trailers.map(
    (trailer) => trailer.name || t("item_card.trailer_count", { count: 1 }),
  );
  const keys = trailers.map((trailer, i) => `${trailer.source}:${names[i]}`);
  const totals = new Map<string, number>();
  for (const key of keys) totals.set(key, (totals.get(key) ?? 0) + 1);

  const numbered = new Map<string, number>();
  return trailers.map((trailer, i) => {
    let name = names[i];
    if ((totals.get(keys[i]) ?? 0) > 1) {
      const number = (numbered.get(keys[i]) ?? 0) + 1;
      numbered.set(keys[i], number);
      name = t("item_card.trailer_numbered", { name, number });
    }
    return trailer.source === "library"
      ? t("item_card.trailer_library", { name })
      : t("item_card.trailer_remote", { name });
  });
};

/**
 * Every trailer the setting allows, the one a tap plays first. Remote links
 * are deduplicated: metadata providers often list the same video twice.
 */
export const pickTrailers = (
  source: TrailerSource,
  libraryTrailers: BaseItemDto[],
  remoteLinks: RemoteTrailerLink[],
): Trailer[] => {
  const library: Trailer[] = libraryTrailers.flatMap((item) =>
    item.Id ? [{ source: "library", id: item.Id, name: item.Name, item }] : [],
  );

  const seen = new Set<string>();
  const remote: Trailer[] = remoteLinks.flatMap(({ url, name }) => {
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ source: "remote", url, name }];
  });

  switch (source) {
    case "libraryOnly":
      return library;
    case "remoteOnly":
      return remote;
    case "preferRemote":
      return [...remote, ...library];
    default:
      return [...library, ...remote];
  }
};
