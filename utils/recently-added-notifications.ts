import { Api, Jellyfin } from "@jellyfin/sdk";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { storage } from "@/utils/mmkv";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getAuthHeaders } from "./jellyfin/jellyfin";
import { getOrSetDeviceId } from "./device";
import { getDeviceName } from "react-native-device-info";

export const RECENTLY_ADDED_SENT_NOTIFICATIONS_ITEM_IDS_KEY =
  "notification_send_for_item_ids";

const acceptedIemTypes = ["Movie", "Episode", "Series"];

async function sendNewItemNotification(item: BaseItemDto) {
  if (Platform.isTV) return;
  if (!item.Type) return;

  if (!acceptedIemTypes.includes(item.Type)) return;

  if (item.Type === "Movie")
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `New Movie Added`,
        body: `${item.Name} (${item.ProductionYear})`,
      },
      trigger: null,
    });
  else if (item.Type === "Episode")
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `New Episode Added`,
        body: `${item.SeriesName} - ${item.Name}`,
      },
      trigger: null,
    });
  else if (item.Type === "Series")
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `New Series Added`,
        body: `${item.Name} (${item.ProductionYear})`,
      },
      trigger: null,
    });
}

/**
 * Fetches recently added items from Jellyfin and sends notifications for new content.
 *
 * This function performs the following operations:
 * 1. Retrieves previously notified item IDs from storage
 * 2. Connects to Jellyfin server using provided credentials
 * 3. Fetches 5 most recent episodes and 5 most recent movies
 * 4. Checks for new items that haven't been notified before
 * 5. Sends notifications for new items
 * 6. Updates storage with new item IDs
 *
 * Note: On first run (when no previous notifications exist), it will store all
 * current items without sending notifications to avoid mass-notifications.
 *
 * @param userId - The Jellyfin user ID to fetch items for
 * @param basePath - The base URL of the Jellyfin server
 * @param token - The authentication token for the Jellyfin server
 */
export async function fetchAndStoreRecentlyAdded(
  userId: string,
  basePath: string,
  token: string
) {
  try {
    const deviceName = await getDeviceName();
    const id = getOrSetDeviceId();

    // Get stored items
    const _alreadySentItemIds = storage.getString(
      RECENTLY_ADDED_SENT_NOTIFICATIONS_ITEM_IDS_KEY
    );
    const alreadySentItemIds: string[] = _alreadySentItemIds
      ? JSON.parse(_alreadySentItemIds)
      : [];

    console.log(
      "fetchAndStoreRecentlyAdded ~ notifications stored:",
      alreadySentItemIds.length
    );

    const jellyfin = new Jellyfin({
      clientInfo: { name: "Streamyfin", version: "0.27.0" },
      deviceInfo: {
        name: deviceName,
        id,
      },
    });

    const api = jellyfin?.createApi(basePath, token);

    const response1 = await getItemsApi(api).getItems({
      userId: userId,
      limit: 5,
      recursive: true,
      includeItemTypes: ["Episode"],
      sortOrder: ["Descending"],
      sortBy: ["DateCreated"],
    });
    const response2 = await getItemsApi(api).getItems({
      userId: userId,
      limit: 5,
      recursive: true,
      includeItemTypes: ["Movie"],
      sortOrder: ["Descending"],
      sortBy: ["DateCreated"],
    });

    const newEpisodes =
      response1.data.Items?.map((item) => ({
        Id: item.Id,
        Name: item.Name,
        DateCreated: item.DateCreated,
        Type: item.Type,
      })) ?? [];

    const newMovies =
      response2.data.Items?.map((item) => ({
        Id: item.Id,
        Name: item.Name,
        DateCreated: item.DateCreated,
        Type: item.Type,
      })) ?? [];

    const newIds: string[] = [];
    const items = [...newEpisodes, ...newMovies];

    // Don't send initial mass-notifications if there are no previously sent notifications
    if (alreadySentItemIds.length === 0) {
      // Store all items as sent (since these items are already in the users library)
      storage.set(
        RECENTLY_ADDED_SENT_NOTIFICATIONS_ITEM_IDS_KEY,
        JSON.stringify(items.map((item) => item.Id))
      );
      return;
    } else {
      // Only send notifications for items that haven't been sent yet
      for (const newItem of items) {
        const alreadySentNotificationFor = alreadySentItemIds.some(
          (id) => id === newItem.Id
        );

        if (!alreadySentNotificationFor) {
          const fullItem = await getUserLibraryApi(api).getItem({
            itemId: newItem.Id!,
            userId: userId,
          });

          await sendNewItemNotification(fullItem.data);
          newIds.push(newItem.Id!);
        }
      }
      // Store all new items as sent, so that we don't send notifications for them again
      storage.set(
        RECENTLY_ADDED_SENT_NOTIFICATIONS_ITEM_IDS_KEY,
        JSON.stringify([...new Set([...alreadySentItemIds, ...newIds])])
      );
    }
  } catch (error) {
    console.error("Error fetching recently added items:", error);
  }
}
