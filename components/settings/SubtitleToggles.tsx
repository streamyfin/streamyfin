import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View, type ViewProps } from "react-native";
import { Input } from "@/components/common/Input";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Stepper } from "@/components/inputs/Stepper";
import { SubtitlePreview } from "@/components/settings/SubtitlePreview";
import { AudioTranscodeMode, useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";
import { useMedia } from "./MediaContext";

interface Props extends ViewProps {}

type AlignX = "left" | "center" | "right";
type AlignY = "top" | "center" | "bottom";

const AUDIO_TRANSCODE_MODES = [
  AudioTranscodeMode.Auto,
  AudioTranscodeMode.ForceStereo,
  AudioTranscodeMode.Allow51,
  AudioTranscodeMode.AllowAll,
] as const;

export const SubtitleToggles: React.FC<Props> = React.memo(({ ...props }) => {
  const isTv = Platform.isTV;

  const media = useMedia();
  const { pluginSettings } = useSettings();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const { t } = useTranslation();

  const [openSubtitlesApiKey, setOpenSubtitlesApiKey] = useState(
    settings?.openSubtitlesApiKey || "",
  );

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

  const audioLanguageOptionGroups = useMemo(() => {
    const options = [
      {
        type: "radio" as const,
        label: t("home.settings.audio.none"),
        value: "none",
        selected: !settings?.defaultAudioLanguage,
        onPress: () => updateSettings({ defaultAudioLanguage: null }),
      },
      ...(cultures?.map((culture) => ({
        type: "radio" as const,
        label:
          culture.DisplayName ||
          culture.ThreeLetterISOLanguageName ||
          t("home.settings.subtitles.unknown_language"),
        value:
          culture.ThreeLetterISOLanguageName ||
          culture.DisplayName ||
          "unknown",
        selected:
          culture.ThreeLetterISOLanguageName ===
          settings?.defaultAudioLanguage?.ThreeLetterISOLanguageName,
        onPress: () => updateSettings({ defaultAudioLanguage: culture }),
      })) || []),
    ];

    return [{ options }];
  }, [cultures, settings?.defaultAudioLanguage, t, updateSettings]);

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
        label:
          culture.DisplayName || t("home.settings.subtitles.unknown_language"),
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

    return [{ options }];
  }, [cultures, settings?.defaultSubtitleLanguage, t, updateSettings]);

  const subtitleModeOptionGroups = useMemo(() => {
    const options = subtitleModes.map((mode) => ({
      type: "radio" as const,
      label: t(subtitleModeKeys[mode]) || String(mode),
      value: String(mode),
      selected: mode === settings?.subtitleMode,
      onPress: () => updateSettings({ subtitleMode: mode }),
    }));

    return [{ options }];
  }, [settings?.subtitleMode, t, updateSettings]);

  const audioTranscodeModeLabels = useMemo(
    (): Record<AudioTranscodeMode, string> => ({
      [AudioTranscodeMode.Auto]: t("home.settings.audio.transcode_mode.auto"),
      [AudioTranscodeMode.ForceStereo]: t(
        "home.settings.audio.transcode_mode.stereo",
      ),
      [AudioTranscodeMode.Allow51]: t("home.settings.audio.transcode_mode.5_1"),
      [AudioTranscodeMode.AllowAll]: t(
        "home.settings.audio.transcode_mode.passthrough",
      ),
    }),
    [t],
  );

  const audioTranscodeModeOptions = useMemo(
    () => [
      {
        options: AUDIO_TRANSCODE_MODES.map((mode) => ({
          type: "radio" as const,
          label: audioTranscodeModeLabels[mode],
          value: mode,
          selected:
            settings?.audioTranscodeMode === mode ||
            (mode === AudioTranscodeMode.Auto && !settings?.audioTranscodeMode),
          onPress: () => updateSettings({ audioTranscodeMode: mode }),
        })),
      },
    ],
    [audioTranscodeModeLabels, settings?.audioTranscodeMode, updateSettings],
  );

  const fontOptions = useMemo(
    () => [
      { label: t("home.settings.subtitles.fonts.system"), value: "System" },
      {
        label: t("home.settings.subtitles.fonts.sans_serif"),
        value: "sans-serif",
      },
      { label: t("home.settings.subtitles.fonts.serif"), value: "serif" },
      {
        label: t("home.settings.subtitles.fonts.monospace"),
        value: "monospace",
      },
      {
        label: t("home.settings.subtitles.fonts.dyslexic"),
        value: "opendyslexic",
      },
    ],
    [t],
  );

  const fontOptionGroups = useMemo(() => {
    const options = fontOptions.map((font) => ({
      type: "radio" as const,
      label: font.label,
      value: font.value,
      selected: font.value === settings?.subtitleFont,
      onPress: () => {
        if (!pluginSettings?.subtitleFont?.locked) {
          updateSettings({ subtitleFont: font.value });
        }
      },
    }));

    return [{ options }];
  }, [
    fontOptions,
    settings?.subtitleFont,
    pluginSettings?.subtitleFont?.locked,
    updateSettings,
  ]);

  const alignXOptionGroups = useMemo(() => {
    const isLocked = pluginSettings?.subtitleAlignX?.locked === true;
    const options = (["left", "center", "right"] as AlignX[]).map((align) => ({
      type: "radio" as const,
      label: t(`home.settings.subtitles.align.${align}`),
      value: align,
      selected: align === (settings?.subtitleAlignX ?? "center"),
      disabled: isLocked,
      onPress: () => {
        if (!isLocked) updateSettings({ subtitleAlignX: align });
      },
    }));
    return [{ options }];
  }, [
    pluginSettings?.subtitleAlignX?.locked,
    settings?.subtitleAlignX,
    t,
    updateSettings,
  ]);

  const alignYOptionGroups = useMemo(() => {
    const isLocked = pluginSettings?.subtitleAlignY?.locked === true;
    const options = (["top", "center", "bottom"] as AlignY[]).map((align) => ({
      type: "radio" as const,
      label: t(`home.settings.subtitles.align.${align}`),
      value: align,
      selected: align === (settings?.subtitleAlignY ?? "bottom"),
      disabled: isLocked,
      onPress: () => {
        if (!isLocked) updateSettings({ subtitleAlignY: align });
      },
    }));
    return [{ options }];
  }, [
    pluginSettings?.subtitleAlignY?.locked,
    settings?.subtitleAlignY,
    t,
    updateSettings,
  ]);

  const subtitleColors = useMemo(
    () => [
      { name: t("home.settings.subtitles.colors.white"), hex: "#FFFFFF" },
      { name: t("home.settings.subtitles.colors.yellow"), hex: "#FFFF00" },
      { name: t("home.settings.subtitles.colors.cyan"), hex: "#00FFFF" },
      { name: t("home.settings.subtitles.colors.green"), hex: "#00FF00" },
      { name: t("home.settings.subtitles.colors.magenta"), hex: "#FF00FF" },
      { name: t("home.settings.subtitles.colors.red"), hex: "#FF0000" },
    ],
    [t],
  );

  if (isTv) return null;
  if (!settings) return null;

  return (
    <View {...props}>
      <ListGroup
        className='mb-4'
        title={t("home.settings.subtitles.language_behavior_title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.subtitles.language_behavior_hint")}
          </Text>
        }
      >
        <Text className='px-4 pt-3 pb-1 text-[#8E8D91] text-xs uppercase'>
          {t("home.settings.audio.audio_title")}
        </Text>

        <ListItem title={t("home.settings.audio.audio_language")}>
          <PlatformDropdown
            groups={audioLanguageOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings?.defaultAudioLanguage?.DisplayName ||
                    t("home.settings.audio.none")}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.audio.language")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.audio.play_default_audio_track")}
          disabled={pluginSettings?.playDefaultAudioTrack?.locked}
        >
          <SettingSwitch
            value={settings.playDefaultAudioTrack}
            disabled={pluginSettings?.playDefaultAudioTrack?.locked}
            onValueChange={(value) =>
              updateSettings({ playDefaultAudioTrack: value })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.audio.set_audio_track")}
          disabled={pluginSettings?.rememberAudioSelections?.locked}
        >
          <SettingSwitch
            value={settings.rememberAudioSelections}
            disabled={pluginSettings?.rememberAudioSelections?.locked}
            onValueChange={(value) =>
              updateSettings({ rememberAudioSelections: value })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.audio.transcode_mode.title")}
          subtitle={t("home.settings.audio.transcode_mode.description")}
        >
          <PlatformDropdown
            groups={audioTranscodeModeOptions}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {
                    audioTranscodeModeLabels[
                      settings?.audioTranscodeMode || AudioTranscodeMode.Auto
                    ]
                  }
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.audio.transcode_mode.title")}
          />
        </ListItem>

        <Text className='px-4 pt-3 pb-1 text-[#8E8D91] text-xs uppercase'>
          {t("home.settings.subtitles.subtitle_title")}
        </Text>

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
                  {t(
                    subtitleModeKeys[settings?.subtitleMode] ??
                      "home.settings.subtitles.modes.Default",
                  )}
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
          <SettingSwitch
            value={settings.rememberSubtitleSelections}
            disabled={pluginSettings?.rememberSubtitleSelections?.locked}
            onValueChange={(value) =>
              updateSettings({ rememberSubtitleSelections: value })
            }
          />
        </ListItem>
      </ListGroup>

      <ListGroup
        className='mb-4'
        title={t("home.settings.subtitles.subtitle_appearance_title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.subtitles.subtitle_appearance_hint")}
          </Text>
        }
      >
        <SubtitlePreview />

        <ListItem
          title={t("home.settings.subtitles.subtitle_font")}
          disabled={pluginSettings?.subtitleFont?.locked}
        >
          <PlatformDropdown
            groups={fontOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {fontOptions.find((f) => f.value === settings?.subtitleFont)
                    ?.label ?? t("home.settings.subtitles.fonts.system")}
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
                key={color.hex}
                disabled={pluginSettings?.subtitleColor?.locked}
                accessibilityRole='button'
                accessibilityLabel={t(
                  "home.settings.subtitles.color_accessibility_label",
                  { color: color.name },
                )}
                accessibilityState={{
                  disabled: !!pluginSettings?.subtitleColor?.locked,
                  selected: settings.subtitleColor === color.hex,
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => {
                  if (!pluginSettings?.subtitleColor?.locked) {
                    updateSettings({ subtitleColor: color.hex });
                  }
                }}
                className='w-6 h-6 rounded-full border-2'
                style={{
                  backgroundColor: color.hex,
                  borderColor:
                    settings.subtitleColor === color.hex
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
            value={settings.subtitleSize ?? 1.0}
            disabled={pluginSettings?.subtitleSize?.locked}
            step={0.1}
            min={0.1}
            max={3.0}
            onUpdate={(value) =>
              updateSettings({ subtitleSize: Math.round(value * 10) / 10 })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_margin_y")}
          disabled={pluginSettings?.subtitleMarginY?.locked}
        >
          <Stepper
            value={settings.subtitleMarginY ?? 0}
            disabled={pluginSettings?.subtitleMarginY?.locked}
            step={5}
            min={-100}
            max={100}
            onUpdate={(value) => {
              if (!pluginSettings?.subtitleMarginY?.locked) {
                updateSettings({ subtitleMarginY: value });
              }
            }}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_align_x")}
          disabled={pluginSettings?.subtitleAlignX?.locked}
        >
          <PlatformDropdown
            groups={alignXOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(
                    `home.settings.subtitles.align.${settings?.subtitleAlignX ?? "center"}`,
                  )}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.subtitle_align_x")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_align_y")}
          disabled={pluginSettings?.subtitleAlignY?.locked}
        >
          <PlatformDropdown
            groups={alignYOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(
                    `home.settings.subtitles.align.${settings?.subtitleAlignY ?? "bottom"}`,
                  )}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.subtitle_align_y")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_background")}
          subtitle={t("home.settings.subtitles.subtitle_background_hint")}
          disabled={pluginSettings?.subtitleBackground?.locked}
        >
          <SettingSwitch
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
              value={settings.subtitleBackgroundOpacity ?? 40}
              disabled={pluginSettings?.subtitleBackgroundOpacity?.locked}
              step={5}
              min={0}
              max={100}
              appendValue='%'
              onUpdate={(value) =>
                updateSettings({ subtitleBackgroundOpacity: value })
              }
            />
          </ListItem>
        )}

        {settings.subtitleBackground && (
          <ListItem
            title={t("home.settings.subtitles.subtitle_background_padding")}
            disabled={pluginSettings?.subtitleBackgroundPadding?.locked}
          >
            <Stepper
              value={settings.subtitleBackgroundPadding ?? 12}
              disabled={pluginSettings?.subtitleBackgroundPadding?.locked}
              step={1}
              min={0}
              max={30}
              onUpdate={(value) =>
                updateSettings({ subtitleBackgroundPadding: value })
              }
            />
          </ListItem>
        )}
      </ListGroup>

      <ListGroup
        title={t("home.settings.subtitles.opensubtitles_title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.subtitles.opensubtitles_hint")}
          </Text>
        }
      >
        <View className='p-4'>
          <Text className='text-xs text-gray-400 mb-2'>
            {t("home.settings.subtitles.opensubtitles_api_key")}
          </Text>
          <Input
            className='border border-neutral-800'
            placeholder={t(
              "home.settings.subtitles.opensubtitles_api_key_placeholder",
            )}
            value={openSubtitlesApiKey}
            onChangeText={setOpenSubtitlesApiKey}
            onBlur={() => {
              updateSettings({ openSubtitlesApiKey });
            }}
            autoCapitalize='none'
            autoCorrect={false}
            secureTextEntry
          />
          <Text className='text-xs text-gray-500 mt-2'>
            {t("home.settings.subtitles.opensubtitles_get_key")}
          </Text>
        </View>
      </ListGroup>
    </View>
  );
});

SubtitleToggles.displayName = "SubtitleToggles";
