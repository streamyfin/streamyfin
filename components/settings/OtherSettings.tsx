import { BITRATES } from "@/components/BitrateSelector";
import Dropdown from "@/components/common/Dropdown";
import DisabledSetting from "@/components/settings/DisabledSetting";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { ScreenOrientationEnum, useSettings } from "@/utils/atoms/settings";
import {
  BACKGROUND_FETCH_TASK,
  registerBackgroundFetchAsync,
  unregisterBackgroundFetchAsync,
} from "@/utils/background-tasks";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type React from "react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, Switch, TouchableOpacity } from "react-native";
import { toast } from "sonner-native";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
const BackgroundFetch = !Platform.isTV
  ? require("expo-background-fetch")
  : null;
const TaskManager = !Platform.isTV ? require("expo-task-manager") : null;

export const OtherSettings: React.FC = () => {
  const router = useRouter();
  const [settings, updateSettings, pluginSettings] = useSettings();

  const { t } = useTranslation();

  /********************
   * Background task
   *******************/
  const checkStatusAsync = async () => {
    if (Platform.isTV) return;

    await BackgroundFetch.getStatusAsync();
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
  };

  useEffect(() => {
    (async () => {
      const registered = await checkStatusAsync();

      if (settings?.autoDownload === true && !registered) {
        registerBackgroundFetchAsync();
        toast.success("Background downloads enabled");
      } else if (settings?.autoDownload === false && registered) {
        unregisterBackgroundFetchAsync();
        toast.info("Background downloads disabled");
      } else if (settings?.autoDownload === true && registered) {
        // Don't to anything
      } else if (settings?.autoDownload === false && !registered) {
        // Don't to anything
      } else {
        updateSettings({ autoDownload: false });
      }
    })();
  }, [settings?.autoDownload]);
  /**********************
   *********************/

  const disabled = useMemo(
    () =>
      pluginSettings?.followDeviceOrientation?.locked === true &&
      pluginSettings?.defaultVideoOrientation?.locked === true &&
      pluginSettings?.safeAreaInControlsEnabled?.locked === true &&
      pluginSettings?.showCustomMenuLinks?.locked === true &&
      pluginSettings?.hiddenLibraries?.locked === true &&
      pluginSettings?.disableHapticFeedback?.locked === true,
    [pluginSettings],
  );

  const orientations = [
    ScreenOrientation.OrientationLock.DEFAULT,
    ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ScreenOrientation.OrientationLock.LANDSCAPE_LEFT,
    ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
  ];

  const orientationTranslations = useMemo(
    () => ({
      [ScreenOrientation.OrientationLock.DEFAULT]:
        "home.settings.other.orientations.DEFAULT",
      [ScreenOrientation.OrientationLock.PORTRAIT_UP]:
        "home.settings.other.orientations.PORTRAIT_UP",
      [ScreenOrientation.OrientationLock.LANDSCAPE_LEFT]:
        "home.settings.other.orientations.LANDSCAPE_LEFT",
      [ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT]:
        "home.settings.other.orientations.LANDSCAPE_RIGHT",
    }),
    [],
  );

  if (!settings) return null;

  return (
    <DisabledSetting disabled={disabled}>
      <ListGroup title={t("home.settings.other.other_title")} className=''>
        <ListItem
          title={t("home.settings.other.follow_device_orientation")}
          disabled={pluginSettings?.followDeviceOrientation?.locked}
        >
          <Switch
            value={settings.followDeviceOrientation}
            disabled={pluginSettings?.followDeviceOrientation?.locked}
            onValueChange={(value) =>
              updateSettings({ followDeviceOrientation: value })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.video_orientation")}
          disabled={
            pluginSettings?.defaultVideoOrientation?.locked ||
            settings.followDeviceOrientation
          }
        >
          <Dropdown
            data={orientations}
            disabled={
              pluginSettings?.defaultVideoOrientation?.locked ||
              settings.followDeviceOrientation
            }
            keyExtractor={String}
            titleExtractor={(item) => t(ScreenOrientationEnum[item])}
            title={
              <TouchableOpacity className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(
                    orientationTranslations[
                      settings.defaultVideoOrientation as keyof typeof orientationTranslations
                    ],
                  ) || "Unknown Orientation"}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </TouchableOpacity>
            }
            label={t("home.settings.other.orientation")}
            onSelected={(defaultVideoOrientation) =>
              updateSettings({ defaultVideoOrientation })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.safe_area_in_controls")}
          disabled={pluginSettings?.safeAreaInControlsEnabled?.locked}
        >
          <Switch
            value={settings.safeAreaInControlsEnabled}
            disabled={pluginSettings?.safeAreaInControlsEnabled?.locked}
            onValueChange={(value) =>
              updateSettings({ safeAreaInControlsEnabled: value })
            }
          />
        </ListItem>

        {/* {(Platform.OS === "ios" || Platform.isTVOS)&& (
          <ListItem
            title={t("home.settings.other.video_player")}
            disabled={pluginSettings?.defaultPlayer?.locked}
          >
            <Dropdown
              data={Object.values(VideoPlayer).filter(isNumber)}
              disabled={pluginSettings?.defaultPlayer?.locked}
              keyExtractor={String}
              titleExtractor={(item) => t(`home.settings.other.video_players.${VideoPlayer[item]}`)}
              title={
                <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
                  <Text className="mr-1 text-[#8E8D91]">
                    {t(`home.settings.other.video_players.${VideoPlayer[settings.defaultPlayer]}`)}
                  </Text>
                  <Ionicons
                    name="chevron-expand-sharp"
                    size={18}
                    color="#5A5960"
                  />
                </TouchableOpacity>
              }
              label={t("home.settings.other.orientation")}
              onSelected={(defaultPlayer) =>
                updateSettings({ defaultPlayer })
              }
            />
          </ListItem>
        )} */}

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
        <ListItem
          onPress={() => router.push("/settings/hide-libraries/page")}
          title={t("home.settings.other.hide_libraries")}
          showArrow
        />
        <ListItem
          title={t("home.settings.other.default_quality")}
          disabled={pluginSettings?.defaultBitrate?.locked}
        >
          <Dropdown
            data={BITRATES}
            disabled={pluginSettings?.defaultBitrate?.locked}
            keyExtractor={(item) => item.key}
            titleExtractor={(item) => item.key}
            title={
              <TouchableOpacity className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings.defaultBitrate?.key}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </TouchableOpacity>
            }
            label={t("home.settings.other.default_quality")}
            onSelected={(defaultBitrate) => updateSettings({ defaultBitrate })}
          />
        </ListItem>
        <ListItem
          title={t("home.settings.other.disable_haptic_feedback")}
          disabled={pluginSettings?.disableHapticFeedback?.locked}
        >
          <Switch
            value={settings.disableHapticFeedback}
            disabled={pluginSettings?.disableHapticFeedback?.locked}
            onValueChange={(disableHapticFeedback) =>
              updateSettings({ disableHapticFeedback })
            }
          />
        </ListItem>
      </ListGroup>
    </DisabledSetting>
  );
};
