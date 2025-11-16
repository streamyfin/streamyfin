import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const PluginSettings = () => {
  const { settings } = useSettings();

  const router = useRouter();

  const { t } = useTranslation();

  if (!settings) return null;

  return (
    <ListGroup
      title={t("home.settings.plugins.plugins_title")}
      className='mb-4'
    >
      <ListItem
        onPress={() => router.push("/settings/plugins/jellyseerr/page")}
        title={"Jellyseerr"}
        showArrow
      />
      <ListItem
        onPress={() => router.push("/settings/plugins/marlin-search/page")}
        title='Marlin Search'
        showArrow
      />
    </ListGroup>
  );
};
