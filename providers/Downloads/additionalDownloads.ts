import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Directory, File, Paths } from "expo-file-system";
import { getItemImage } from "@/utils/getItemImage";
import { fetchAndParseSegments } from "@/utils/segments";
import { generateTrickplayUrl, getTrickplayInfo } from "@/utils/trickplay";
import type { MediaTimeSegment, TrickPlayData } from "./types";
import { generateFilename } from "./utils";

/**
 * Downloads trickplay images for an item
 * @returns TrickPlayData with path and size, or undefined if not available
 */
export async function downloadTrickplayImages(
  item: BaseItemDto,
): Promise<TrickPlayData | undefined> {
  const trickplayInfo = getTrickplayInfo(item);
  if (!trickplayInfo || !item.Id) {
    return undefined;
  }

  const filename = generateFilename(item);
  const trickplayDir = new Directory(Paths.document, `${filename}_trickplay`);

  // Create directory if it doesn't exist
  if (!trickplayDir.exists) {
    trickplayDir.create({ intermediates: true });
  }

  let totalSize = 0;
  const downloadPromises: Promise<void>[] = [];

  for (let index = 0; index < trickplayInfo.totalImageSheets; index++) {
    const url = generateTrickplayUrl(item, index);
    if (!url) continue;

    const destination = new File(trickplayDir, `${index}.jpg`);

    // Skip if already exists
    if (destination.exists) {
      totalSize += destination.size;
      continue;
    }

    downloadPromises.push(
      File.downloadFileAsync(url, destination)
        .then(() => {
          totalSize += destination.size;
        })
        .catch((error) => {
          console.error(
            `[TRICKPLAY] Failed to download sheet ${index}:`,
            error,
          );
        }),
    );
  }

  await Promise.all(downloadPromises);

  return {
    path: trickplayDir.uri,
    size: totalSize,
  };
}

/**
 * Downloads external subtitle files and updates their delivery URLs to local paths
 * @returns Updated media source with local subtitle paths
 */
export async function downloadSubtitles(
  mediaSource: MediaSourceInfo,
  item: BaseItemDto,
  apiBasePath: string,
): Promise<MediaSourceInfo> {
  const externalSubtitles = mediaSource.MediaStreams?.filter(
    (stream) =>
      stream.Type === "Subtitle" && stream.DeliveryMethod === "External",
  );

  if (!externalSubtitles || externalSubtitles.length === 0) {
    return mediaSource;
  }

  const filename = generateFilename(item);
  const downloadPromises = externalSubtitles.map(async (subtitle) => {
    if (!subtitle.DeliveryUrl) return;

    const url = apiBasePath + subtitle.DeliveryUrl;
    const extension = subtitle.Codec || "srt";
    const destination = new File(
      Paths.document,
      `${filename}_subtitle_${subtitle.Index}.${extension}`,
    );

    // Skip if already exists
    if (destination.exists) {
      subtitle.DeliveryUrl = destination.uri;
      return;
    }

    try {
      await File.downloadFileAsync(url, destination);
      subtitle.DeliveryUrl = destination.uri;
    } catch (error) {
      console.error(
        `[SUBTITLES] Failed to download subtitle ${subtitle.Index}:`,
        error,
      );
    }
  });

  await Promise.all(downloadPromises);

  return mediaSource;
}

/**
 * Downloads and saves the cover image for an item
 * @returns Path to the saved image, or undefined if failed
 */
export async function downloadCoverImage(
  item: BaseItemDto,
  api: Api,
  saveImageFn: (itemId: string, url?: string) => Promise<void>,
): Promise<string | undefined> {
  if (!item.Id) {
    console.log(`[COVER] No item ID for cover image`);
    return undefined;
  }

  try {
    const itemImage = getItemImage({
      item,
      api,
      variant: "Primary",
      quality: 90,
      width: 500,
    });

    if (!itemImage?.uri) {
      return undefined;
    }

    await saveImageFn(item.Id, itemImage.uri);

    return itemImage.uri;
  } catch (error) {
    console.error(`[COVER] Failed to download cover image:`, error);
    return undefined;
  }
}

/**
 * Downloads and saves the series primary image for an episode
 * @returns Path to the saved image, or undefined if failed
 */
export async function downloadSeriesImage(
  item: BaseItemDto,
  saveSeriesImageFn: (item: BaseItemDto) => Promise<void>,
): Promise<void> {
  if (item.Type !== "Episode" || !item.SeriesId) {
    return;
  }

  try {
    await saveSeriesImageFn(item);
  } catch (error) {
    console.error(`[COVER] Failed to download series image:`, error);
  }
}

/**
 * Fetches intro and credit segments for an item
 */
export async function fetchSegments(
  itemId: string,
  api: Api,
): Promise<{
  introSegments?: MediaTimeSegment[];
  creditSegments?: MediaTimeSegment[];
}> {
  try {
    const segments = await fetchAndParseSegments(itemId, api);
    return {
      introSegments: segments.introSegments,
      creditSegments: segments.creditSegments,
    };
  } catch (error) {
    console.error(`[SEGMENTS] Failed to fetch segments:`, error);
    return {
      introSegments: undefined,
      creditSegments: undefined,
    };
  }
}

/**
 * Orchestrates all additional downloads for a completed item
 * Called after main video download completes
 */
export async function downloadAdditionalAssets(params: {
  item: BaseItemDto;
  mediaSource: MediaSourceInfo;
  api: Api;
  saveImageFn: (itemId: string, url?: string) => Promise<void>;
  saveSeriesImageFn: (item: BaseItemDto) => Promise<void>;
}): Promise<{
  trickPlayData?: TrickPlayData;
  updatedMediaSource: MediaSourceInfo;
  introSegments?: MediaTimeSegment[];
  creditSegments?: MediaTimeSegment[];
}> {
  const { item, mediaSource, api, saveImageFn, saveSeriesImageFn } = params;

  // Run all downloads in parallel for speed
  const [
    trickPlayData,
    updatedMediaSource,
    segments,
    // Cover images (fire and forget, errors are logged)
  ] = await Promise.all([
    downloadTrickplayImages(item),
    // Only download subtitles for non-transcoded streams
    mediaSource.TranscodingUrl
      ? Promise.resolve(mediaSource)
      : downloadSubtitles(mediaSource, item, api.basePath || ""),
    item.Id
      ? fetchSegments(item.Id, api)
      : Promise.resolve({
          introSegments: undefined,
          creditSegments: undefined,
        }),
    // Cover image downloads (run but don't wait for results)
    downloadCoverImage(item, api, saveImageFn).catch((err) => {
      console.error("[COVER] Error downloading cover:", err);
      return undefined;
    }),
    downloadSeriesImage(item, saveSeriesImageFn).catch((err) => {
      console.error("[COVER] Error downloading series image:", err);
      return undefined;
    }),
  ]);

  return {
    trickPlayData,
    updatedMediaSource,
    introSegments: segments.introSegments,
    creditSegments: segments.creditSegments,
  };
}
