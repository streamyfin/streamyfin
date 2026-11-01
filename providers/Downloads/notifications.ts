import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type * as NotificationsType from "expo-notifications";
import type { TFunction } from "i18next";
import { Platform } from "react-native";
import { DOWNLOAD_NOTIFICATION_CHANNEL } from "@/constants/Notifications";
import type { DownloadFailureReason } from "./downloadErrors";

// Conditionally import expo-notifications only on non-TV platforms
const Notifications = Platform.isTV
  ? null
  : (require("expo-notifications") as typeof NotificationsType);

/**
 * Generate notification content based on item type. A failed download's body says why it failed,
 * naming the item the way a completed download's body does.
 */
export function getNotificationContent(
  item: BaseItemDto,
  t: TFunction,
  failure?: DownloadFailureReason,
): { title: string; body: string } {
  const name = getNotificationItemName(item);

  if (failure) {
    return {
      title: t("home.downloads.toasts.download_failed"),
      body: t(`home.downloads.failure.${failure.kind}`, {
        item: name,
        status: failure.status,
      }),
    };
  }

  return {
    title:
      item.Type === "Episode" || item.Type === "Movie"
        ? t("home.downloads.toasts.download_completed")
        : t("home.downloads.toasts.download_completed_for_item", {
            item: item.Name,
          }),
    body: name,
  };
}

/** An episode with its number and series, a movie with its year. */
function getNotificationItemName(item: BaseItemDto): string {
  if (item.Type === "Episode") {
    const season = item.ParentIndexNumber
      ? String(item.ParentIndexNumber).padStart(2, "0")
      : "??";
    const episode = item.IndexNumber
      ? String(item.IndexNumber).padStart(2, "0")
      : "??";
    return `${item.Name} - [S${season}E${episode}] (${item.SeriesName})`;
  }

  if (item.Type === "Movie") {
    const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
    return `${item.Name}${year}`;
  }

  return item.Name || "Unknown item";
}

/**
 * Send a local notification for download events. Resolves to whether it will be shown: it is not
 * on TV, nor when the user has not allowed notifications.
 */
export async function sendDownloadNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<boolean> {
  if (Platform.isTV || !Notifications) return false;

  try {
    // Android drops a notification the user has not allowed without an error: ask first.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return false;
    // Android lets the user turn the downloads channel off on its own.
    if (Platform.OS === "android") {
      const channel = await Notifications.getNotificationChannelAsync(
        DOWNLOAD_NOTIFICATION_CHANNEL,
      );
      if (
        !channel ||
        channel.importance === Notifications.AndroidImportance.NONE
      ) {
        return false;
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {}, // iOS requires data to be an object, not undefined
        ...(Platform.OS === "android" && {
          channelId: DOWNLOAD_NOTIFICATION_CHANNEL,
        }),
      },
      trigger: null,
    });
    return true;
  } catch (error) {
    console.error("Failed to send notification:", error);
    return false;
  }
}
