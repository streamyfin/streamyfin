import { useSettings } from "@/utils/atoms/settings";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const PluginSettings = () => {
  const [settings, updateSettings] = useSettings();

  const router = useRouter();

  if (!settings) return null;
  return (
    <View>
      <ListGroup title="Plugins">
        <ListItem
          onPress={() => router.push("/settings/jellyseerr/page")}
          title={"Jellyseerr"}
          showArrow
        />
        <ListItem
          onPress={() => router.push("/settings/marlin-search/page")}
          title="Marlin Search"
          showArrow
        />
      </ListGroup>
    </View>
  );
};
