import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform } from "react-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import DisabledSetting from "@/components/settings/DisabledSetting";
import useRouter from "@/hooks/useAppRouter";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const AppearanceSettings: React.FC = () => {
  const router = useRouter();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();

  const disabled = useMemo(
    () =>
      pluginSettings?.showCustomMenuLinks?.locked === true &&
      pluginSettings?.hiddenLibraries?.locked === true,
    [pluginSettings],
  );

  if (!settings) return null;

  return (
    <DisabledSetting disabled={disabled}>
      <ListGroup title={t("home.settings.appearance.title")} className=''>
        <ListItem
          title={t("home.settings.other.show_custom_menu_links")}
          subtitle={t("home.settings.other.show_custom_menu_links_hint")}
          disabled={pluginSettings?.showCustomMenuLinks?.locked}
          onPress={() =>
            Linking.openURL(
              "https://jellyfin.org/docs/general/clients/web-config/#custom-menu-links",
            )
          }
        >
          <SettingSwitch
            value={settings.showCustomMenuLinks}
            disabled={pluginSettings?.showCustomMenuLinks?.locked}
            onValueChange={(value) =>
              updateSettings({ showCustomMenuLinks: value })
            }
          />
        </ListItem>
        {Platform.OS === "ios" && (
          <ListItem
            title={t("home.settings.appearance.show_hero_carousel")}
            subtitle={t("home.settings.appearance.show_hero_carousel_hint")}
            disabled={pluginSettings?.showHeroCarousel?.locked}
          >
            <SettingSwitch
              value={settings.showHeroCarousel}
              disabled={pluginSettings?.showHeroCarousel?.locked}
              onValueChange={(value) =>
                updateSettings({ showHeroCarousel: value })
              }
            />
          </ListItem>
        )}
        <ListItem
          title={t("home.settings.appearance.merge_next_up_continue_watching")}
          subtitle={t(
            "home.settings.appearance.merge_next_up_continue_watching_hint",
          )}
        >
          <SettingSwitch
            value={settings.mergeNextUpAndContinueWatching}
            onValueChange={(value) =>
              updateSettings({ mergeNextUpAndContinueWatching: value })
            }
          />
        </ListItem>
        <ListItem
          title={t("home.settings.appearance.use_episode_images_next_up")}
          subtitle={t(
            "home.settings.appearance.use_episode_images_next_up_hint",
          )}
        >
          <SettingSwitch
            value={settings.useEpisodeImagesForNextUp}
            onValueChange={(value) =>
              updateSettings({ useEpisodeImagesForNextUp: value })
            }
          />
        </ListItem>
        <ListItem
          title={t("home.settings.appearance.hide_remote_session_button")}
          subtitle={t(
            "home.settings.appearance.hide_remote_session_button_hint",
          )}
        >
          <SettingSwitch
            value={settings.hideRemoteSessionButton}
            onValueChange={(value) =>
              updateSettings({ hideRemoteSessionButton: value })
            }
          />
        </ListItem>
        {Platform.OS === "ios" && !Platform.isTV && (
          <ListItem
            title={t("home.settings.appearance.download_live_activity")}
            subtitle={t("home.settings.appearance.download_live_activity_hint")}
          >
            <SettingSwitch
              value={settings.showDownloadLiveActivity}
              onValueChange={(value) =>
                updateSettings({ showDownloadLiveActivity: value })
              }
            />
          </ListItem>
        )}
        <ListItem
          onPress={() =>
            router.push("/settings/appearance/hide-libraries/page")
          }
          title={t("home.settings.other.hide_libraries")}
          subtitle={t("home.settings.other.select_libraries_you_want_to_hide")}
          showArrow
        />
      </ListGroup>
    </DisabledSetting>
  );
};
