import { ScreenOrientationEnum, useSettings } from "@/utils/atoms/settings";
import {
  BACKGROUND_FETCH_TASK,
  registerBackgroundFetchAsync,
  unregisterBackgroundFetchAsync,
} from "@/utils/background-tasks";
import { Ionicons } from "@expo/vector-icons";
import * as BackgroundFetch from "expo-background-fetch";
import { useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as TaskManager from "expo-task-manager";
import React, { useEffect, useMemo } from "react";
import { Linking, Switch, TouchableOpacity } from "react-native";
import { toast } from "sonner-native";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import DisabledSetting from "@/components/settings/DisabledSetting";
import Dropdown from "@/components/common/Dropdown";

export const OtherSettings: React.FC = () => {
  const router = useRouter();
  const [settings, updateSettings, pluginSettings] = useSettings();

  /********************
   * Background task
   *******************/
  const checkStatusAsync = async () => {
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
      pluginSettings?.autoRotate?.locked === true &&
      pluginSettings?.defaultVideoOrientation?.locked === true &&
      pluginSettings?.safeAreaInControlsEnabled?.locked === true &&
      pluginSettings?.showCustomMenuLinks?.locked === true &&
      pluginSettings?.hiddenLibraries?.locked === true &&
      pluginSettings?.disableHapticFeedback?.locked === true,
    [pluginSettings]
  );

  const orientations = [
    ScreenOrientation.OrientationLock.DEFAULT,
    ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ScreenOrientation.OrientationLock.LANDSCAPE_LEFT,
    ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
  ];

  if (!settings) return null;

  return (
    <DisabledSetting disabled={disabled}>
      <ListGroup title="Other" className="">
        <ListItem
          title="Auto rotate"
          disabled={pluginSettings?.autoRotate?.locked}
        >
          <Switch
            value={settings.autoRotate}
            disabled={pluginSettings?.autoRotate?.locked}
            onValueChange={(value) => updateSettings({ autoRotate: value })}
          />
        </ListItem>

        <ListItem
          title="Video orientation"
          disabled={
            pluginSettings?.defaultVideoOrientation?.locked ||
            settings.autoRotate
          }
        >
          <Dropdown
            data={orientations}
            disabled={
              pluginSettings?.defaultVideoOrientation?.locked ||
              settings.autoRotate
            }
            keyExtractor={String}
            titleExtractor={(item) => ScreenOrientationEnum[item]}
            title={
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
                <Text className="mr-1 text-[#8E8D91]">
                  {ScreenOrientationEnum[settings.defaultVideoOrientation]}
                </Text>
                <Ionicons
                  name="chevron-expand-sharp"
                  size={18}
                  color="#5A5960"
                />
              </TouchableOpacity>
            }
            label="Orientation"
            onSelected={(defaultVideoOrientation) =>
              updateSettings({ defaultVideoOrientation })
            }
          />
        </ListItem>

        <ListItem
          title="Safe area in controls"
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

        <ListItem
          title="Show Custom Menu Links"
          disabled={pluginSettings?.showCustomMenuLinks?.locked}
          onPress={() =>
            Linking.openURL(
              "https://jellyfin.org/docs/general/clients/web-config/#custom-menu-links"
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
          title="Hide Libraries"
          showArrow
        />
        <ListItem
          title="Disable Haptic Feedback"
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
