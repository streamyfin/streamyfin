import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type * as NotificationsType from "expo-notifications";
import type { TFunction } from "i18next";
import { Platform } from "react-native";

// Conditionally import expo-notifications only on non-TV platforms
const Notifications = Platform.isTV
  ? null
  : (require("expo-notifications") as typeof NotificationsType);

// Track album downloads to prevent notification spam
interface AlbumDownloadTracker {
  totalTracks: number;
  completedTracks: number;
  albumName: string;
  artistName: string;
}

const albumDownloads = new Map<string, AlbumDownloadTracker>();

/**
 * Register a track as part of an album download
 */
export function registerAlbumTrack(
  albumId: string,
  albumName: string,
  artistName: string,
  totalTracks: number,
): void {
  if (!albumDownloads.has(albumId)) {
    albumDownloads.set(albumId, {
      totalTracks,
      completedTracks: 0,
      albumName,
      artistName,
    });
  }
}

/**
 * Mark a track as completed and check if album download is finished
 * Returns true if this was the last track and a notification should be sent
 */
export function markTrackCompleted(albumId: string): {
  shouldNotify: boolean;
  albumName?: string;
  artistName?: string;
  completedTracks?: number;
  totalTracks?: number;
} {
  const tracker = albumDownloads.get(albumId);
  if (!tracker) {
    // Track is not part of a tracked album download, allow individual notification
    return { shouldNotify: true };
  }

  tracker.completedTracks++;

  if (tracker.completedTracks >= tracker.totalTracks) {
    // All tracks completed, remove from tracker and send album notification
    albumDownloads.delete(albumId);
    return {
      shouldNotify: true,
      albumName: tracker.albumName,
      artistName: tracker.artistName,
      completedTracks: tracker.completedTracks,
      totalTracks: tracker.totalTracks,
    };
  }

  // More tracks remaining, suppress notification
  return { shouldNotify: false };
}

/**
 * Clear album download tracker (e.g., on error or cancellation)
 */
export function clearAlbumTracker(albumId: string): void {
  albumDownloads.delete(albumId);
}

/**
 * Generate notification content based on item type
 */
export function getNotificationContent(
  item: BaseItemDto,
  isSuccess: boolean,
  t: TFunction,
): { title: string; body: string } {
  if (item.Type === "Episode") {
    const season = item.ParentIndexNumber
      ? String(item.ParentIndexNumber).padStart(2, "0")
      : "??";
    const episode = item.IndexNumber
      ? String(item.IndexNumber).padStart(2, "0")
      : "??";
    const subtitle = `${item.Name} - [S${season}E${episode}] (${item.SeriesName})`;

    return {
      title: isSuccess
        ? t("home.downloads.toasts.download_completed")
        : t("home.downloads.toasts.download_failed"),
      body: subtitle,
    };
  }

  if (item.Type === "Movie") {
    const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
    const subtitle = `${item.Name}${year}`;

    return {
      title: isSuccess
        ? t("home.downloads.toasts.download_completed")
        : t("home.downloads.toasts.download_failed"),
      body: subtitle,
    };
  }

  return {
    title: isSuccess
      ? t("home.downloads.toasts.download_completed_for_item", {
          item: item.Name,
        })
      : t("home.downloads.toasts.download_failed_for_item", {
          item: item.Name,
        }),
    body: item.Name || "Unknown item",
  };
}

/**
 * Send a local notification for download events
 */
export async function sendDownloadNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<void> {
  if (Platform.isTV || !Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {}, // iOS requires data to be an object, not undefined
        ...(Platform.OS === "android" && { channelId: "downloads" }),
      },
      trigger: null,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
}
