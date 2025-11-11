import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const PluginSettings = () => {
  const { settings } = useSettings();

  const router = useRouter();

  const { t } = useTranslation();

  if (!settings) return null;
  return (
    <View className='mt-4'>
      <ListGroup
        title={t("home.settings.plugins.plugins_title")}
        className='mb-4'
      >
        <ListItem
          onPress={() => router.push("/settings/jellyseerr/page")}
          title={"Jellyseerr"}
          showArrow
        />
        <ListItem
          onPress={() => router.push("/settings/marlin-search/page")}
          title='Marlin Search'
          showArrow
        />
      </ListGroup>
    </View>
  );
};
