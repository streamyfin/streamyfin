import type React from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, TextInput } from "react-native";
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

  // Local state, committed on blur: every keystroke would otherwise rebuild
  // the (still-mounted) home screen's queries per intermediate value.
  const [nextUpDaysCutoff, setNextUpDaysCutoff] = useState(
    settings?.nextUpDaysCutoff ?? "",
  );

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
          title={t("home.settings.appearance.next_up_days_cutoff")}
          subtitle={t("home.settings.appearance.next_up_days_cutoff_hint")}
        >
          <TextInput
            className='text-white text-right min-w-[60px]'
            keyboardType='number-pad'
            placeholder={t("home.settings.appearance.next_up_days_cutoff_off")}
            placeholderTextColor='#8E8D91'
            value={nextUpDaysCutoff}
            onChangeText={(text) =>
              setNextUpDaysCutoff(text.replace(/[^0-9]/g, ""))
            }
            onEndEditing={() =>
              updateSettings({
                nextUpDaysCutoff: nextUpDaysCutoff || undefined,
              })
            }
          />
        </ListItem>
        <ListItem
          title={t("home.settings.appearance.next_up_disable_first_episode")}
          subtitle={t(
            "home.settings.appearance.next_up_disable_first_episode_hint",
          )}
        >
          <SettingSwitch
            value={settings.nextUpDisableFirstEpisode}
            onValueChange={(value) =>
              updateSettings({ nextUpDisableFirstEpisode: value })
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
