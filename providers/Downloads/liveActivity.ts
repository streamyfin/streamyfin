import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Directory, File } from "expo-file-system";
import type { TFunction } from "i18next";
import { Platform } from "react-native";
import { BackgroundDownloader } from "@/modules";
import type { DownloadActivityMetadata } from "@/modules/background-downloader";
import { getItemImage } from "@/utils/getItemImage";

/**
 * Builds the payload for the iOS download Live Activity.
 *
 * The activity is driven natively from the URLSession delegate, which keeps running after iOS has
 * torn down the JS runtime. Nothing here can therefore be resolved later — every string and the
 * poster file must be in place before the download starts.
 *
 * iOS-only. Android already shows download progress through the foreground service in
 * `modules/background-downloader/android/.../DownloadService.kt`.
 */

const isSupported = Platform.OS === "ios" && !Platform.isTV;

/**
 * Title/subtitle for the activity, matching the phrasing `getNotificationContent` uses for the
 * completion notification so the two never disagree.
 */
function getActivityText(item: BaseItemDto): {
  title: string;
  subtitle: string;
} {
  if (item.Type === "Episode") {
    const season = item.ParentIndexNumber
      ? String(item.ParentIndexNumber).padStart(2, "0")
      : "??";
    const episode = item.IndexNumber
      ? String(item.IndexNumber).padStart(2, "0")
      : "??";

    return {
      title: item.SeriesName || item.Name || "",
      subtitle: `S${season}E${episode}${item.Name ? ` · ${item.Name}` : ""}`,
    };
  }

  if (item.Type === "Movie") {
    return {
      title: item.Name || "",
      subtitle: item.ProductionYear ? String(item.ProductionYear) : "",
    };
  }

  return { title: item.Name || "", subtitle: "" };
}

/**
 * Copies the item's poster into the App Group container. The widget extension runs in its own
 * process and cannot read the app's Documents directory, so the image has to be staged somewhere
 * both can reach.
 *
 * Only one download runs at a time, so the directory is cleared first and never accumulates.
 * Returns `undefined` on any failure — the activity falls back to an SF Symbol.
 */
async function stagePoster(
  item: BaseItemDto,
  api: Api,
): Promise<string | undefined> {
  const directoryPath = BackgroundDownloader.getLiveActivityDirectory();
  if (!directoryPath || !item.Id) return undefined;

  try {
    const image = getItemImage({
      item,
      api,
      variant: item.Type === "Episode" ? "SeriesPrimary" : "Primary",
      quality: 90,
      width: 300,
    });
    if (!image?.uri) return undefined;

    const directory = new Directory(`file://${directoryPath}`);
    if (!directory.exists) {
      directory.create({ intermediates: true });
    }
    for (const entry of directory.list()) {
      try {
        entry.delete();
      } catch {
        // A stale poster we cannot remove is harmless; the new one still overwrites by name.
      }
    }

    const fileName = `${item.Id}.jpg`;
    await File.downloadFileAsync(
      image.uri as string,
      new File(directory, fileName),
      { idempotent: true },
    );

    return fileName;
  } catch (error) {
    console.warn("[LiveActivity] Failed to stage poster:", error);
    return undefined;
  }
}

export async function buildDownloadActivityMetadata({
  item,
  api,
  t,
  estimatedTotalBytes,
}: {
  item: BaseItemDto;
  api: Api;
  t: TFunction;
  estimatedTotalBytes?: number;
}): Promise<DownloadActivityMetadata | undefined> {
  if (!isSupported || !item.Id) return undefined;

  const { title, subtitle } = getActivityText(item);
  const posterFileName = await stagePoster(item, api);

  return {
    itemId: item.Id,
    title,
    subtitle,
    posterFileName,
    estimatedTotalBytes: estimatedTotalBytes ?? 0,
    // Resolved here rather than in Swift so translations stay in translations/*.json only.
    labels: {
      downloading: t("home.downloads.live_activity.downloading"),
      completed: t("home.downloads.live_activity.completed"),
      failed: t("home.downloads.live_activity.failed"),
      queued: t("home.downloads.live_activity.queued"),
    },
  };
}

export function setDownloadLiveActivityEnabled(enabled: boolean): void {
  if (!isSupported) return;
  BackgroundDownloader.setLiveActivityEnabled(enabled);
}
