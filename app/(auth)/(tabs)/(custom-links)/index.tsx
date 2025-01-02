import { FlatList, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useCallback, useEffect, useState } from "react";
import { useAtom } from "jotai/index";
import { apiAtom } from "@/providers/JellyfinProvider";
import { ListItem } from "@/components/list/ListItem";
import * as WebBrowser from "expo-web-browser";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "@/components/common/Text";

export interface MenuLink {
  name: string;
  url: string;
  icon: string;
}

export default function menuLinks() {
  const [api] = useAtom(apiAtom);
  const insets = useSafeAreaInsets();
  const [menuLinks, setMenuLinks] = useState<MenuLink[]>([]);

  const getMenuLinks = useCallback(async () => {
    try {
      const response = await api?.axiosInstance.get(
        api?.basePath + "/web/config.json"
      );
      const config = response?.data;

      if (!config && !config.hasOwnProperty("menuLinks")) {
        console.error("Menu links not found");
        return;
      }

      setMenuLinks(config?.menuLinks as MenuLink[]);
    } catch (error) {
      console.error("Failed to retrieve config:", error);
    }
  }, [api]);

  useEffect(() => {
    getMenuLinks();
  }, []);
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: 10,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      data={menuLinks}
      renderItem={({ item }) => (
        <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(item.url)}>
          <ListItem
            title={item.name}
            iconAfter={<Ionicons name="link" size={24} color="white" />}
          />
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => (
        <View
          style={{
            width: 10,
            height: 10,
          }}
        />
      )}
      ListEmptyComponent={
        <View className="flex flex-col items-center justify-center h-full">
          <Text className="font-bold text-xl text-neutral-500">No links</Text>
        </View>
      }
    />
  );
}
