import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

const TV_DISCOVERY_ITEM_LIMIT = 12;
const TV_DISCOVERY_SECTION_LIMIT = 3;

export interface TVDiscoveryItem {
  id: string;
  itemType?: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  route: string;
  playRoute?: string;
}

export interface TVDiscoverySection {
  title: string;
  items: TVDiscoveryItem[];
}

export interface TVDiscoveryPayload {
  version: 1;
  updatedAt: string;
  sections: TVDiscoverySection[];
}

function getTVDiscoveryImage(
  item: BaseItemDto,
  api: Api,
): { url: string } | undefined {
  const baseUrl = api.basePath;

  // Top Shelf items render in poster shape (portrait 2:3), so request the
  // matching Primary poster art. Requesting backdrops here would force the
  // extension to crop them into a poster, which looked bad. Each URL is gated
  // on its image tag so we never hand the extension a URL the server can't
  // fulfill (which would render a broken/blank poster).
  const posterParams = "?fillWidth=400" + "&fillHeight=600" + "&quality=90";

  const posterUrl = (id: string, tag: string) =>
    `${baseUrl}/Items/${id}/Images/Primary${posterParams}` +
    `&tag=${encodeURIComponent(tag)}`;

  // For episodes, prefer the season -> show poster over the episode's own
  // primary: episode primary images are usually landscape stills that crop
  // badly in poster shape, and since most episodes have one the season/show
  // poster would otherwise never get used.
  if (item.Type === "Episode") {
    // Season poster — for an episode the immediate parent is the season, so
    // ParentPrimaryImageTag is the season's primary tag.
    if (item.SeasonId && item.ParentPrimaryImageTag) {
      return { url: posterUrl(item.SeasonId, item.ParentPrimaryImageTag) };
    }

    // Show poster
    if (item.SeriesId && item.SeriesPrimaryImageTag) {
      return { url: posterUrl(item.SeriesId, item.SeriesPrimaryImageTag) };
    }
  }

  // Item's own poster (movies, series, or an episode with no season/show art)
  const primaryTag = item.ImageTags?.Primary;
  if (item.Id && primaryTag) {
    return { url: posterUrl(item.Id, primaryTag) };
  }

  return undefined;
}

function formatEpisodeNumber(item: BaseItemDto): string | undefined {
  const season = item.ParentIndexNumber;
  const episode = item.IndexNumber;

  if (season != null && episode != null) {
    return `S${season} • E${episode}`;
  }

  if (season != null) return `Season ${season}`;
  if (episode != null) return `Episode ${episode}`;

  return undefined;
}

function getTVDiscoveryTitle(item: BaseItemDto): string {
  if (item.Type === "Episode") {
    const episodeNumber = formatEpisodeNumber(item);

    if (item.SeriesName && episodeNumber) {
      return `${item.SeriesName} - ${episodeNumber}`;
    }

    if (item.SeriesName) return item.SeriesName;
    if (episodeNumber) return episodeNumber;
    return item.Name || "";
  }

  return item.Name || "";
}

function getTVDiscoverySubtitle(item: BaseItemDto): string | undefined {
  if (item.Type === "Episode") return undefined;

  return item.ProductionYear ? String(item.ProductionYear) : item.Type;
}

function sectionFromItems(
  title: string,
  items: BaseItemDto[] | undefined,
  api: Api,
): TVDiscoverySection | null {
  const payloadItems = (items || [])
    .filter((item) => item.Id && item.Name)
    .slice(0, TV_DISCOVERY_ITEM_LIMIT)
    .map((item) => {
      const image = getTVDiscoveryImage(item, api);
      return {
        id: item.Id!,
        itemType: item.Type || undefined,
        title: getTVDiscoveryTitle(item),
        subtitle: getTVDiscoverySubtitle(item),
        imageUrl: image?.url,
        route: `streamyfin://topshelf/item?id=${encodeURIComponent(item.Id!)}&type=${encodeURIComponent(item.Type || "")}`,
        playRoute: `streamyfin://topshelf/play?id=${encodeURIComponent(item.Id!)}`,
      };
    });

  if (payloadItems.length === 0) return null;

  return {
    title,
    items: payloadItems,
  };
}

export function buildTVDiscoveryPayload({
  api,
  sections,
}: {
  api: Api | null | undefined;
  sections: Array<{ title: string; items: BaseItemDto[] | undefined }>;
}): TVDiscoveryPayload | null {
  if (!api) return null;

  const payloadSections = sections
    .map((section) => sectionFromItems(section.title, section.items, api))
    .filter((section): section is TVDiscoverySection => section !== null)
    .slice(0, TV_DISCOVERY_SECTION_LIMIT);

  if (payloadSections.length === 0) return null;

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    sections: payloadSections,
  };
}
