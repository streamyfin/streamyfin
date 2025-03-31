import { Text } from "@/components/common/Text";
import { ListItem } from "@/components/list/ListItem";
import { apiAtom } from "@/providers/JellyfinProvider";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAtom } from "jotai/index";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { FlatList, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WebBrowser = !Platform.isTV ? require("expo-web-browser") : null;

export interface MenuLink {
  name: string;
  url: string;
  icon: string;
}

export default function menuLinks() {
  const [api] = useAtom(apiAtom);
  const insets = useSafeAreaInsets();
  const [menuLinks, setMenuLinks] = useState<MenuLink[]>([]);
  const { t } = useTranslation();

  const getMenuLinks = useCallback(async () => {
    try {
      const response = await api?.axiosInstance.get(
        `${api?.basePath}/web/config.json`,
      );
      const config = response?.data;

      if (!config && !Object.hasOwn(config, "menuLinks")) {
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
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingTop: 10,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      data={menuLinks}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => {
            if (!Platform.isTV) {
              WebBrowser.openBrowserAsync(item.url);
            }
          }}
        >
          <ListItem
            title={item.name}
            iconAfter={<Ionicons name='link' size={24} color='white' />}
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
        <View className='flex flex-col items-center justify-center h-full'>
          <Text className='font-bold text-xl text-neutral-500'>
            {t("custom_links.no_links")}
          </Text>
        </View>
      }
    />
  );
}
