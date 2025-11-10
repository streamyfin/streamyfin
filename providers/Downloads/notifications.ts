import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import * as Notifications from "expo-notifications";
import type { TFunction } from "i18next";
import { Platform } from "react-native";

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
  if (Platform.isTV) return;

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
