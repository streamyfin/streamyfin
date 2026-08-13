import { useTranslation } from "react-i18next";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import useRouter from "@/hooks/useAppRouter";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const PluginSettings = () => {
  const { settings, updateSettings } = useSettings();

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
        title='Jellyseerr'
        showArrow
      />
      <ListItem
        onPress={() => router.push("/settings/plugins/streamystats/page")}
        title='Streamystats'
        showArrow
      />
      <ListItem
        onPress={() => router.push("/settings/plugins/marlin-search/page")}
        title='Marlin Search'
        showArrow
      />
      <ListItem
        onPress={() => router.push("/settings/plugins/kefinTweaks/page")}
        title='KefinTweaks'
        showArrow
      />
      {/* Lookups the client makes directly, without going through Jellyfin. */}
      <ListItem
        title={t("home.settings.plugins.wikidata_awards")}
        subtitle={t("home.settings.plugins.wikidata_awards_hint")}
      >
        <SettingSwitch
          value={settings.wikidataAwardsEnabled}
          onValueChange={(value) =>
            updateSettings({ wikidataAwardsEnabled: value })
          }
        />
      </ListItem>
      <ListItem
        title={t("home.settings.plugins.opensubtitles_enabled")}
        subtitle={t("home.settings.plugins.opensubtitles_enabled_hint")}
      >
        <SettingSwitch
          value={settings.openSubtitlesEnabled}
          onValueChange={(value) =>
            updateSettings({ openSubtitlesEnabled: value })
          }
        />
      </ListItem>
    </ListGroup>
  );
};
