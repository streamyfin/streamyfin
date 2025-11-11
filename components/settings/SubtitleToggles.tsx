import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
import { Switch } from "react-native-gesture-handler";
import { Stepper } from "@/components/inputs/Stepper";
import {
  OUTLINE_THICKNESS,
  type OutlineThickness,
  VLC_COLORS,
  type VLCColor,
} from "@/constants/SubtitleConstants";
import { useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";
import { useMedia } from "./MediaContext";

interface Props extends ViewProps {}

export const SubtitleToggles: React.FC<Props> = ({ ...props }) => {
  const isTv = Platform.isTV;

  const media = useMedia();
  const { pluginSettings } = useSettings();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const { t } = useTranslation();

  const subtitleModes = [
    SubtitlePlaybackMode.Default,
    SubtitlePlaybackMode.Smart,
    SubtitlePlaybackMode.OnlyForced,
    SubtitlePlaybackMode.Always,
    SubtitlePlaybackMode.None,
  ];

  const subtitleModeKeys = {
    [SubtitlePlaybackMode.Default]: "home.settings.subtitles.modes.Default",
    [SubtitlePlaybackMode.Smart]: "home.settings.subtitles.modes.Smart",
    [SubtitlePlaybackMode.OnlyForced]:
      "home.settings.subtitles.modes.OnlyForced",
    [SubtitlePlaybackMode.Always]: "home.settings.subtitles.modes.Always",
    [SubtitlePlaybackMode.None]: "home.settings.subtitles.modes.None",
  };

  const subtitleLanguageOptionGroups = useMemo(() => {
    const options = [
      {
        type: "radio" as const,
        label: t("home.settings.subtitles.none"),
        value: "none",
        selected: !settings?.defaultSubtitleLanguage,
        onPress: () => updateSettings({ defaultSubtitleLanguage: null }),
      },
      ...(cultures?.map((culture) => ({
        type: "radio" as const,
        label: culture.DisplayName || "Unknown",
        value:
          culture.ThreeLetterISOLanguageName ||
          culture.DisplayName ||
          "unknown",
        selected:
          culture.ThreeLetterISOLanguageName ===
          settings?.defaultSubtitleLanguage?.ThreeLetterISOLanguageName,
        onPress: () => updateSettings({ defaultSubtitleLanguage: culture }),
      })) || []),
    ];

    return [
      {
        options,
      },
    ];
  }, [cultures, settings?.defaultSubtitleLanguage, t, updateSettings]);

  const subtitleModeOptionGroups = useMemo(() => {
    const options = subtitleModes.map((mode) => ({
      type: "radio" as const,
      label: t(subtitleModeKeys[mode]) || String(mode),
      value: String(mode),
      selected: mode === settings?.subtitleMode,
      onPress: () => updateSettings({ subtitleMode: mode }),
    }));

    return [
      {
        options,
      },
    ];
  }, [settings?.subtitleMode, t, updateSettings]);

  const textColorOptionGroups = useMemo(() => {
    const colors = Object.keys(VLC_COLORS) as VLCColor[];
    const options = colors.map((color) => ({
      type: "radio" as const,
      label: t(`home.settings.subtitles.colors.${color}`),
      value: color,
      selected: (settings?.vlcTextColor || "White") === color,
      onPress: () => updateSettings({ vlcTextColor: color }),
    }));

    return [{ options }];
  }, [settings?.vlcTextColor, t, updateSettings]);

  const backgroundColorOptionGroups = useMemo(() => {
    const colors = Object.keys(VLC_COLORS) as VLCColor[];
    const options = colors.map((color) => ({
      type: "radio" as const,
      label: t(`home.settings.subtitles.colors.${color}`),
      value: color,
      selected: (settings?.vlcBackgroundColor || "Black") === color,
      onPress: () => updateSettings({ vlcBackgroundColor: color }),
    }));

    return [{ options }];
  }, [settings?.vlcBackgroundColor, t, updateSettings]);

  const outlineColorOptionGroups = useMemo(() => {
    const colors = Object.keys(VLC_COLORS) as VLCColor[];
    const options = colors.map((color) => ({
      type: "radio" as const,
      label: t(`home.settings.subtitles.colors.${color}`),
      value: color,
      selected: (settings?.vlcOutlineColor || "Black") === color,
      onPress: () => updateSettings({ vlcOutlineColor: color }),
    }));

    return [{ options }];
  }, [settings?.vlcOutlineColor, t, updateSettings]);

  const outlineThicknessOptionGroups = useMemo(() => {
    const thicknesses = Object.keys(OUTLINE_THICKNESS) as OutlineThickness[];
    const options = thicknesses.map((thickness) => ({
      type: "radio" as const,
      label: t(`home.settings.subtitles.thickness.${thickness}`),
      value: thickness,
      selected: (settings?.vlcOutlineThickness || "Normal") === thickness,
      onPress: () => updateSettings({ vlcOutlineThickness: thickness }),
    }));

    return [{ options }];
  }, [settings?.vlcOutlineThickness, t, updateSettings]);

  const backgroundOpacityOptionGroups = useMemo(() => {
    const opacities = [0, 32, 64, 96, 128, 160, 192, 224, 255];
    const options = opacities.map((opacity) => ({
      type: "radio" as const,
      label: `${Math.round((opacity / 255) * 100)}%`,
      value: opacity,
      selected: (settings?.vlcBackgroundOpacity ?? 128) === opacity,
      onPress: () => updateSettings({ vlcBackgroundOpacity: opacity }),
    }));

    return [{ options }];
  }, [settings?.vlcBackgroundOpacity, updateSettings]);

  const outlineOpacityOptionGroups = useMemo(() => {
    const opacities = [0, 32, 64, 96, 128, 160, 192, 224, 255];
    const options = opacities.map((opacity) => ({
      type: "radio" as const,
      label: `${Math.round((opacity / 255) * 100)}%`,
      value: opacity,
      selected: (settings?.vlcOutlineOpacity ?? 255) === opacity,
      onPress: () => updateSettings({ vlcOutlineOpacity: opacity }),
    }));

    return [{ options }];
  }, [settings?.vlcOutlineOpacity, updateSettings]);

  if (isTv) return null;
  if (!settings) return null;

  return (
    <View {...props}>
      <ListGroup
        title={t("home.settings.subtitles.subtitle_title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.subtitles.subtitle_hint")}
          </Text>
        }
      >
        <ListItem title={t("home.settings.subtitles.subtitle_language")}>
          <PlatformDropdown
            groups={subtitleLanguageOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings?.defaultSubtitleLanguage?.DisplayName ||
                    t("home.settings.subtitles.none")}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.language")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_mode")}
          disabled={pluginSettings?.subtitleMode?.locked}
        >
          <PlatformDropdown
            groups={subtitleModeOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(subtitleModeKeys[settings?.subtitleMode]) ||
                    t("home.settings.subtitles.loading")}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.subtitle_mode")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.set_subtitle_track")}
          disabled={pluginSettings?.rememberSubtitleSelections?.locked}
        >
          <Switch
            value={settings.rememberSubtitleSelections}
            disabled={pluginSettings?.rememberSubtitleSelections?.locked}
            onValueChange={(value) =>
              updateSettings({ rememberSubtitleSelections: value })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_size")}
          disabled={pluginSettings?.subtitleSize?.locked}
        >
          <Stepper
            value={settings.subtitleSize}
            disabled={pluginSettings?.subtitleSize?.locked}
            step={5}
            min={0}
            max={120}
            onUpdate={(subtitleSize) => updateSettings({ subtitleSize })}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.text_color")}>
          <PlatformDropdown
            groups={textColorOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(
                    `home.settings.subtitles.colors.${settings?.vlcTextColor || "White"}`,
                  )}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.text_color")}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.background_color")}>
          <PlatformDropdown
            groups={backgroundColorOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(
                    `home.settings.subtitles.colors.${settings?.vlcBackgroundColor || "Black"}`,
                  )}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.background_color")}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.outline_color")}>
          <PlatformDropdown
            groups={outlineColorOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(
                    `home.settings.subtitles.colors.${settings?.vlcOutlineColor || "Black"}`,
                  )}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.outline_color")}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.outline_thickness")}>
          <PlatformDropdown
            groups={outlineThicknessOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(
                    `home.settings.subtitles.thickness.${settings?.vlcOutlineThickness || "Normal"}`,
                  )}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.outline_thickness")}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.background_opacity")}>
          <PlatformDropdown
            groups={backgroundOpacityOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>{`${Math.round(((settings?.vlcBackgroundOpacity ?? 128) / 255) * 100)}%`}</Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.background_opacity")}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.outline_opacity")}>
          <PlatformDropdown
            groups={outlineOpacityOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>{`${Math.round(((settings?.vlcOutlineOpacity ?? 255) / 255) * 100)}%`}</Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.outline_opacity")}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.bold_text")}>
          <Switch
            value={settings?.vlcIsBold ?? false}
            onValueChange={(value) => updateSettings({ vlcIsBold: value })}
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
