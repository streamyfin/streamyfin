import { useRouter } from "expo-router";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Switch } from "react-native";
import DisabledSetting from "@/components/settings/DisabledSetting";
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
          disabled={pluginSettings?.showCustomMenuLinks?.locked}
          onPress={() =>
            Linking.openURL(
              "https://jellyfin.org/docs/general/clients/web-config/#custom-menu-links",
            )
          }
        >
          <Switch
            value={settings.showCustomMenuLinks}
            disabled={pluginSettings?.showCustomMenuLinks?.locked}
            onValueChange={(value) =>
              updateSettings({ showCustomMenuLinks: value })
            }
          />
        </ListItem>
        <ListItem title={t("home.settings.other.show_large_home_carousel")}>
          <Switch
            value={settings.showLargeHomeCarousel}
            onValueChange={(value) =>
              updateSettings({ showLargeHomeCarousel: value })
            }
          />
        </ListItem>
        <ListItem
          title={t("home.settings.appearance.merge_next_up_continue_watching")}
        >
          <Switch
            value={settings.mergeNextUpAndContinueWatching}
            onValueChange={(value) =>
              updateSettings({ mergeNextUpAndContinueWatching: value })
            }
          />
        </ListItem>
        <ListItem
          onPress={() =>
            router.push("/settings/appearance/hide-libraries/page")
          }
          title={t("home.settings.other.hide_libraries")}
          showArrow
        />
      </ListGroup>
    </DisabledSetting>
  );
};
