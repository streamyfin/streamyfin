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

  // 1. Episode backdrop
  const episodeBackdrop = item.BackdropImageTags?.[0];
  if (item.Id && episodeBackdrop) {
    return {
      url:
        `${baseUrl}/Items/${item.Id}/Images/Backdrop/0` +
        `?fillWidth=1920` +
        `&fillHeight=1080` +
        `&quality=90` +
        `&tag=${encodeURIComponent(episodeBackdrop)}`,
    };
  }

  // 2. Series backdrop
  if (item.SeriesId) {
    return {
      url:
        `${baseUrl}/Items/${item.SeriesId}/Images/Backdrop` +
        `?fillWidth=1920` +
        `&fillHeight=1080` +
        `&quality=90`,
    };
  }

  // 3. Generic item backdrop
  const backdrop = item.BackdropImageTags?.[0];
  if (item.Id && backdrop) {
    return {
      url:
        `${baseUrl}/Items/${item.Id}/Images/Backdrop/0` +
        `?fillWidth=1920` +
        `&fillHeight=1080` +
        `&quality=90` +
        `&tag=${encodeURIComponent(backdrop)}`,
    };
  }

  // 4. Last resort: crop poster into landscape
  const primaryTag = item.ImageTags?.Primary;
  if (item.Id && primaryTag) {
    return {
      url:
        `${baseUrl}/Items/${item.Id}/Images/Primary` +
        `?fillWidth=1920` +
        `&fillHeight=1080` +
        `&quality=90` +
        `&tag=${encodeURIComponent(primaryTag)}`,
    };
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
