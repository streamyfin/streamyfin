import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
import { Switch } from "react-native-gesture-handler";
import {
  OUTLINE_THICKNESS_OPTIONS,
  VLC_COLOR_OPTIONS,
} from "@/constants/SubtitleConstants";
import { useSettings, VideoPlayerIOS } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { Stepper } from "../inputs/Stepper";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";

interface Props extends ViewProps {}

/**
 * VLC Subtitle Settings component
 * Only shown when VLC is the active player (Android always, iOS when VLC selected)
 * Note: These settings are applied via VLC init options and take effect on next playback
 */
export const VlcSubtitleSettings: React.FC<Props> = ({ ...props }) => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();

  // Only show for VLC users
  const isVlcPlayer =
    Platform.OS === "android" ||
    (Platform.OS === "ios" && settings.videoPlayerIOS === VideoPlayerIOS.VLC);

  const textColorOptions = useMemo(
    () => [
      {
        options: VLC_COLOR_OPTIONS.map((color) => ({
          type: "radio" as const,
          label: color,
          value: color,
          selected: settings.vlcTextColor === color,
          onPress: () => updateSettings({ vlcTextColor: color }),
        })),
      },
    ],
    [settings.vlcTextColor, updateSettings],
  );

  const backgroundColorOptions = useMemo(
    () => [
      {
        options: VLC_COLOR_OPTIONS.map((color) => ({
          type: "radio" as const,
          label: color,
          value: color,
          selected: settings.vlcBackgroundColor === color,
          onPress: () => updateSettings({ vlcBackgroundColor: color }),
        })),
      },
    ],
    [settings.vlcBackgroundColor, updateSettings],
  );

  const outlineColorOptions = useMemo(
    () => [
      {
        options: VLC_COLOR_OPTIONS.map((color) => ({
          type: "radio" as const,
          label: color,
          value: color,
          selected: settings.vlcOutlineColor === color,
          onPress: () => updateSettings({ vlcOutlineColor: color }),
        })),
      },
    ],
    [settings.vlcOutlineColor, updateSettings],
  );

  const outlineThicknessOptions = useMemo(
    () => [
      {
        options: OUTLINE_THICKNESS_OPTIONS.map((thickness) => ({
          type: "radio" as const,
          label: thickness,
          value: thickness,
          selected: settings.vlcOutlineThickness === thickness,
          onPress: () => updateSettings({ vlcOutlineThickness: thickness }),
        })),
      },
    ],
    [settings.vlcOutlineThickness, updateSettings],
  );

  if (!isVlcPlayer) return null;
  if (Platform.isTV) return null;

  return (
    <View {...props}>
      <ListGroup
        title={t("home.settings.vlc_subtitles.title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.vlc_subtitles.hint")}
          </Text>
        }
      >
        {/* Text Color */}
        <ListItem title={t("home.settings.vlc_subtitles.text_color")}>
          <PlatformDropdown
            groups={textColorOptions}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings.vlcTextColor || "White"}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.vlc_subtitles.text_color")}
          />
        </ListItem>

        {/* Background Color */}
        <ListItem title={t("home.settings.vlc_subtitles.background_color")}>
          <PlatformDropdown
            groups={backgroundColorOptions}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings.vlcBackgroundColor || "Black"}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.vlc_subtitles.background_color")}
          />
        </ListItem>

        {/* Background Opacity */}
        <ListItem title={t("home.settings.vlc_subtitles.background_opacity")}>
          <Stepper
            value={Math.round(
              ((settings.vlcBackgroundOpacity ?? 128) / 255) * 100,
            )}
            step={10}
            min={0}
            max={100}
            appendValue='%'
            onUpdate={(value) =>
              updateSettings({
                vlcBackgroundOpacity: Math.round((value / 100) * 255),
              })
            }
          />
        </ListItem>

        {/* Outline Color */}
        <ListItem title={t("home.settings.vlc_subtitles.outline_color")}>
          <PlatformDropdown
            groups={outlineColorOptions}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings.vlcOutlineColor || "Black"}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.vlc_subtitles.outline_color")}
          />
        </ListItem>

        {/* Outline Opacity */}
        <ListItem title={t("home.settings.vlc_subtitles.outline_opacity")}>
          <Stepper
            value={Math.round(
              ((settings.vlcOutlineOpacity ?? 255) / 255) * 100,
            )}
            step={10}
            min={0}
            max={100}
            appendValue='%'
            onUpdate={(value) =>
              updateSettings({
                vlcOutlineOpacity: Math.round((value / 100) * 255),
              })
            }
          />
        </ListItem>

        {/* Outline Thickness */}
        <ListItem title={t("home.settings.vlc_subtitles.outline_thickness")}>
          <PlatformDropdown
            groups={outlineThicknessOptions}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings.vlcOutlineThickness || "Normal"}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.vlc_subtitles.outline_thickness")}
          />
        </ListItem>

        {/* Bold Text */}
        <ListItem title={t("home.settings.vlc_subtitles.bold")}>
          <Switch
            value={settings.vlcIsBold ?? false}
            onValueChange={(value) => updateSettings({ vlcIsBold: value })}
          />
        </ListItem>

        {/* Subtitle Margin */}
        <ListItem title={t("home.settings.vlc_subtitles.margin")}>
          <Stepper
            value={settings.vlcSubtitleMargin ?? 40}
            step={10}
            min={0}
            max={200}
            onUpdate={(value) =>
              updateSettings({ vlcSubtitleMargin: Math.round(value) })
            }
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
