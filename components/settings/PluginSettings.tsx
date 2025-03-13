import { useSettings } from "@/utils/atoms/settings";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { useTranslation } from "react-i18next";

export const PluginSettings = () => {
  const [settings, updateSettings] = useSettings();

  const router = useRouter();

  const { t } = useTranslation();

  if (!settings) return null;
  return (
    <View>
      <ListGroup
        title={t("home.settings.plugins.plugins_title")}
        className="mb-4"
      >
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
