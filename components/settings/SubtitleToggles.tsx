import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View, type ViewProps } from "react-native";
import { Switch } from "react-native-gesture-handler";
import { Stepper } from "@/components/inputs/Stepper";
import { useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";
import { useMedia } from "./MediaContext";
import { SubtitlePreview } from "./SubtitlePreview";

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

  const subtitleModeKeys: Record<string, string> = {
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

  const fontOptions = [
    { label: "System", value: "System" },
    { label: "Sans-Serif", value: "sans-serif" },
    { label: "Serif", value: "serif" },
    { label: "Monospace", value: "monospace" },
  ];

  const fontOptionGroups = useMemo(() => {
    const options = fontOptions.map((font) => ({
      type: "radio" as const,
      label: font.label,
      value: font.value,
      selected: font.value === settings?.subtitleFont,
      onPress: () => updateSettings({ subtitleFont: font.value }),
    }));

    return [
      {
        options,
      },
    ];
  }, [settings?.subtitleFont, updateSettings]);

  const subtitleColors = [
    { name: "White", value: "#FFFFFF" },
    { name: "Yellow", value: "#FFFF00" },
    { name: "Cyan", value: "#00FFFF" },
    { name: "Green", value: "#00FF00" },
    { name: "Magenta", value: "#FF00FF" },
    { name: "Red", value: "#FF0000" },
  ];

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
        <SubtitlePreview />

        <ListItem title={t("home.settings.subtitles.subtitle_language")}>
          <PlatformDropdown
            groups={subtitleLanguageOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
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
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(subtitleModeKeys[settings?.subtitleMode])}
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
          title={t("home.settings.subtitles.subtitle_font")}
          disabled={pluginSettings?.subtitleFont?.locked}
        >
          <PlatformDropdown
            groups={fontOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {
                    fontOptions.find((f) => f.value === settings?.subtitleFont)
                      ?.label
                  }
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.subtitle_font")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_color")}
          disabled={pluginSettings?.subtitleColor?.locked}
        >
          <View className='flex flex-row items-center space-x-2'>
            {subtitleColors.map((color) => (
              <TouchableOpacity
                key={color.value}
                onPress={() => updateSettings({ subtitleColor: color.value })}
                className='w-6 h-6 rounded-full border-2'
                style={{
                  backgroundColor: color.value,
                  borderColor:
                    settings.subtitleColor === color.value
                      ? "white"
                      : "transparent",
                }}
              />
            ))}
          </View>
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_size")}
          disabled={pluginSettings?.subtitleSize?.locked}
        >
          <Stepper
            value={settings.subtitleSize / 100}
            disabled={pluginSettings?.subtitleSize?.locked}
            step={0.1}
            min={0.3}
            max={1.5}
            onUpdate={(value) =>
              updateSettings({ subtitleSize: Math.round(value * 100) })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_background")}
          subtitle={t("home.settings.subtitles.subtitle_background_hint")}
          disabled={pluginSettings?.subtitleBackground?.locked}
        >
          <Switch
            value={settings.subtitleBackground}
            disabled={pluginSettings?.subtitleBackground?.locked}
            onValueChange={(value) =>
              updateSettings({ subtitleBackground: value })
            }
          />
        </ListItem>

        {settings.subtitleBackground && (
          <ListItem
            title={t("home.settings.subtitles.subtitle_background_opacity")}
            disabled={pluginSettings?.subtitleBackgroundOpacity?.locked}
          >
            <Stepper
              value={settings.subtitleBackgroundOpacity}
              disabled={pluginSettings?.subtitleBackgroundOpacity?.locked}
              step={10}
              min={10}
              max={100}
              appendValue='%'
              onUpdate={(value) =>
                updateSettings({ subtitleBackgroundOpacity: value })
              }
            />
          </ListItem>
        )}

        {/* {settings.subtitleBackground && (
          <ListItem
            title={t("home.settings.subtitles.subtitle_background_padding")}
            disabled={pluginSettings?.subtitleBackgroundPadding?.locked}
          >
            <Stepper
              value={settings.subtitleBackgroundPadding}
              disabled={pluginSettings?.subtitleBackgroundPadding?.locked}
              step={1}
              min={0}
              max={20}
              onUpdate={(value) =>
                updateSettings({ subtitleBackgroundPadding: value })
              }
            />
          </ListItem>
        )} */}
      </ListGroup>
    </View>
  );
};
