import settings from "@/app/(auth)/(tabs)/(home)/settings";
import { Switch, View } from "react-native";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { useSettings } from "@/utils/atoms/settings";
import React, { useCallback, useEffect, useMemo } from "react";
import { BACKGROUND_FETCH_TASK_RECENTLY_ADDED } from "@/utils/background-tasks";
import { storage } from "@/utils/mmkv";
import { RECENTLY_ADDED_SENT_NOTIFICATIONS_ITEM_IDS_KEY } from "@/utils/recently-added-notifications";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import { useMMKVNumber } from "react-native-mmkv";

export const RecentlyAddedNotificationsSettings: React.FC = ({ ...props }) => {
  const [settings, updateSettings] = useSettings();

  const clearRecentlyAddedNotifications = useCallback(() => {
    storage.delete(RECENTLY_ADDED_SENT_NOTIFICATIONS_ITEM_IDS_KEY);
  }, []);

  const recentlyAddedNotificationsItemIds = useMemo(() => {
    const s = storage.getString(RECENTLY_ADDED_SENT_NOTIFICATIONS_ITEM_IDS_KEY);
    if (!s) return [] as string[];
    try {
      const t: string[] = JSON.parse(s);
      return t;
    } catch (e) {
      throw new Error("Failed to parse recently added notifications item ids");
    }
  }, []);

  const [triggerCount, setTriggerCount] = useMMKVNumber(
    "notification_send_for_item_ids.count"
  );

  return (
    <View className="mb-4" {...props}>
      <ListGroup title={"Recently Added Notifications"}>
        <ListItem title={"Recently added notifications"}>
          <Switch
            value={settings.recentlyAddedNotifications}
            onValueChange={(recentlyAddedNotifications) =>
              updateSettings({ recentlyAddedNotifications })
            }
          />
        </ListItem>
        <ListItem title={`Trigger count (${triggerCount || 0})`} />
        <ListItem
          textColor="red"
          onPress={clearRecentlyAddedNotifications}
          title={`Reset recently added notifications (${recentlyAddedNotificationsItemIds.length})`}
        />
      </ListGroup>
    </View>
  );
};
