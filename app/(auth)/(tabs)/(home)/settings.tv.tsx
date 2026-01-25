import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import type { TVOptionItem } from "@/components/tv";
import {
  TVLogoutButton,
  TVSectionHeader,
  TVSettingsOptionButton,
  TVSettingsRow,
  TVSettingsStepper,
  TVSettingsTextInput,
  TVSettingsToggle,
} from "@/components/tv";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { apiAtom, useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import {
  AudioTranscodeMode,
  TVTypographyScale,
  useSettings,
} from "@/utils/atoms/settings";

export default function SettingsTV() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { logout } = useJellyfin();
  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);
  const { showOptions } = useTVOptionModal();
  const typography = useScaledTVTypography();

  // Local state for OpenSubtitles API key (only commit on blur)
  const [openSubtitlesApiKey, setOpenSubtitlesApiKey] = useState(
    settings.openSubtitlesApiKey || "",
  );

  const currentAudioTranscode =
    settings.audioTranscodeMode || AudioTranscodeMode.Auto;
  const currentSubtitleMode =
    settings.subtitleMode || SubtitlePlaybackMode.Default;
  const currentAlignX = settings.mpvSubtitleAlignX ?? "center";
  const currentAlignY = settings.mpvSubtitleAlignY ?? "bottom";
  const currentTypographyScale =
    settings.tvTypographyScale || TVTypographyScale.Default;

  // Audio transcoding options
  const audioTranscodeModeOptions: TVOptionItem<AudioTranscodeMode>[] = useMemo(
    () => [
      {
        label: t("home.settings.audio.transcode_mode.auto"),
        value: AudioTranscodeMode.Auto,
        selected: currentAudioTranscode === AudioTranscodeMode.Auto,
      },
      {
        label: t("home.settings.audio.transcode_mode.stereo"),
        value: AudioTranscodeMode.ForceStereo,
        selected: currentAudioTranscode === AudioTranscodeMode.ForceStereo,
      },
      {
        label: t("home.settings.audio.transcode_mode.5_1"),
        value: AudioTranscodeMode.Allow51,
        selected: currentAudioTranscode === AudioTranscodeMode.Allow51,
      },
      {
        label: t("home.settings.audio.transcode_mode.passthrough"),
        value: AudioTranscodeMode.AllowAll,
        selected: currentAudioTranscode === AudioTranscodeMode.AllowAll,
      },
    ],
    [t, currentAudioTranscode],
  );

  // Subtitle mode options
  const subtitleModeOptions: TVOptionItem<SubtitlePlaybackMode>[] = useMemo(
    () => [
      {
        label: t("home.settings.subtitles.modes.Default"),
        value: SubtitlePlaybackMode.Default,
        selected: currentSubtitleMode === SubtitlePlaybackMode.Default,
      },
      {
        label: t("home.settings.subtitles.modes.Smart"),
        value: SubtitlePlaybackMode.Smart,
        selected: currentSubtitleMode === SubtitlePlaybackMode.Smart,
      },
      {
        label: t("home.settings.subtitles.modes.OnlyForced"),
        value: SubtitlePlaybackMode.OnlyForced,
        selected: currentSubtitleMode === SubtitlePlaybackMode.OnlyForced,
      },
      {
        label: t("home.settings.subtitles.modes.Always"),
        value: SubtitlePlaybackMode.Always,
        selected: currentSubtitleMode === SubtitlePlaybackMode.Always,
      },
      {
        label: t("home.settings.subtitles.modes.None"),
        value: SubtitlePlaybackMode.None,
        selected: currentSubtitleMode === SubtitlePlaybackMode.None,
      },
    ],
    [t, currentSubtitleMode],
  );

  // MPV alignment options
  const alignXOptions: TVOptionItem<string>[] = useMemo(
    () => [
      { label: "Left", value: "left", selected: currentAlignX === "left" },
      {
        label: "Center",
        value: "center",
        selected: currentAlignX === "center",
      },
      { label: "Right", value: "right", selected: currentAlignX === "right" },
    ],
    [currentAlignX],
  );

  const alignYOptions: TVOptionItem<string>[] = useMemo(
    () => [
      { label: "Top", value: "top", selected: currentAlignY === "top" },
      {
        label: "Center",
        value: "center",
        selected: currentAlignY === "center",
      },
      {
        label: "Bottom",
        value: "bottom",
        selected: currentAlignY === "bottom",
      },
    ],
    [currentAlignY],
  );

  // Typography scale options
  const typographyScaleOptions: TVOptionItem<TVTypographyScale>[] = useMemo(
    () => [
      {
        label: t("home.settings.appearance.text_size_small"),
        value: TVTypographyScale.Small,
        selected: currentTypographyScale === TVTypographyScale.Small,
      },
      {
        label: t("home.settings.appearance.text_size_default"),
        value: TVTypographyScale.Default,
        selected: currentTypographyScale === TVTypographyScale.Default,
      },
      {
        label: t("home.settings.appearance.text_size_large"),
        value: TVTypographyScale.Large,
        selected: currentTypographyScale === TVTypographyScale.Large,
      },
      {
        label: t("home.settings.appearance.text_size_extra_large"),
        value: TVTypographyScale.ExtraLarge,
        selected: currentTypographyScale === TVTypographyScale.ExtraLarge,
      },
    ],
    [t, currentTypographyScale],
  );

  // Get display labels for option buttons
  const audioTranscodeLabel = useMemo(() => {
    const option = audioTranscodeModeOptions.find((o) => o.selected);
    return option?.label || t("home.settings.audio.transcode_mode.auto");
  }, [audioTranscodeModeOptions, t]);

  const subtitleModeLabel = useMemo(() => {
    const option = subtitleModeOptions.find((o) => o.selected);
    return option?.label || t("home.settings.subtitles.modes.Default");
  }, [subtitleModeOptions, t]);

  const alignXLabel = useMemo(() => {
    const option = alignXOptions.find((o) => o.selected);
    return option?.label || "Center";
  }, [alignXOptions]);

  const alignYLabel = useMemo(() => {
    const option = alignYOptions.find((o) => o.selected);
    return option?.label || "Bottom";
  }, [alignYOptions]);

  const typographyScaleLabel = useMemo(() => {
    const option = typographyScaleOptions.find((o) => o.selected);
    return option?.label || t("home.settings.appearance.text_size_default");
  }, [typographyScaleOptions, t]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + 120,
            paddingBottom: insets.bottom + 60,
            paddingHorizontal: insets.left + 80,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Text
            style={{
              fontSize: typography.title,
              fontWeight: "bold",
              color: "#FFFFFF",
              marginBottom: 8,
            }}
          >
            {t("home.settings.settings_title")}
          </Text>

          {/* Audio Section */}
          <TVSectionHeader title={t("home.settings.audio.audio_title")} />
          <TVSettingsOptionButton
            label={t("home.settings.audio.transcode_mode.title")}
            value={audioTranscodeLabel}
            onPress={() =>
              showOptions({
                title: t("home.settings.audio.transcode_mode.title"),
                options: audioTranscodeModeOptions,
                onSelect: (value) =>
                  updateSettings({ audioTranscodeMode: value }),
              })
            }
            isFirst
          />

          {/* Subtitles Section */}
          <TVSectionHeader
            title={t("home.settings.subtitles.subtitle_title")}
          />
          <TVSettingsOptionButton
            label={t("home.settings.subtitles.subtitle_mode")}
            value={subtitleModeLabel}
            onPress={() =>
              showOptions({
                title: t("home.settings.subtitles.subtitle_mode"),
                options: subtitleModeOptions,
                onSelect: (value) => updateSettings({ subtitleMode: value }),
              })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.subtitles.set_subtitle_track")}
            value={settings.rememberSubtitleSelections}
            onToggle={(value) =>
              updateSettings({ rememberSubtitleSelections: value })
            }
          />
          <TVSettingsStepper
            label={t("home.settings.subtitles.subtitle_size")}
            value={settings.subtitleSize / 100}
            onDecrease={() => {
              const newValue = Math.max(0.3, settings.subtitleSize / 100 - 0.1);
              updateSettings({ subtitleSize: Math.round(newValue * 100) });
            }}
            onIncrease={() => {
              const newValue = Math.min(1.5, settings.subtitleSize / 100 + 0.1);
              updateSettings({ subtitleSize: Math.round(newValue * 100) });
            }}
            formatValue={(v) => `${v.toFixed(1)}x`}
          />

          {/* MPV Subtitles Section */}
          <TVSectionHeader title='MPV Subtitle Settings' />
          <TVSettingsStepper
            label='Subtitle Scale'
            value={settings.mpvSubtitleScale ?? 1.0}
            onDecrease={() => {
              const newValue = Math.max(
                0.5,
                (settings.mpvSubtitleScale ?? 1.0) - 0.1,
              );
              updateSettings({
                mpvSubtitleScale: Math.round(newValue * 10) / 10,
              });
            }}
            onIncrease={() => {
              const newValue = Math.min(
                2.0,
                (settings.mpvSubtitleScale ?? 1.0) + 0.1,
              );
              updateSettings({
                mpvSubtitleScale: Math.round(newValue * 10) / 10,
              });
            }}
            formatValue={(v) => `${v.toFixed(1)}x`}
          />
          <TVSettingsStepper
            label='Vertical Margin'
            value={settings.mpvSubtitleMarginY ?? 0}
            onDecrease={() => {
              const newValue = Math.max(
                0,
                (settings.mpvSubtitleMarginY ?? 0) - 5,
              );
              updateSettings({ mpvSubtitleMarginY: newValue });
            }}
            onIncrease={() => {
              const newValue = Math.min(
                100,
                (settings.mpvSubtitleMarginY ?? 0) + 5,
              );
              updateSettings({ mpvSubtitleMarginY: newValue });
            }}
          />
          <TVSettingsOptionButton
            label='Horizontal Alignment'
            value={alignXLabel}
            onPress={() =>
              showOptions({
                title: "Horizontal Alignment",
                options: alignXOptions,
                onSelect: (value) =>
                  updateSettings({
                    mpvSubtitleAlignX: value as "left" | "center" | "right",
                  }),
              })
            }
          />
          <TVSettingsOptionButton
            label='Vertical Alignment'
            value={alignYLabel}
            onPress={() =>
              showOptions({
                title: "Vertical Alignment",
                options: alignYOptions,
                onSelect: (value) =>
                  updateSettings({
                    mpvSubtitleAlignY: value as "top" | "center" | "bottom",
                  }),
              })
            }
          />

          {/* OpenSubtitles Section */}
          <TVSectionHeader
            title={
              t("home.settings.subtitles.opensubtitles_title") ||
              "OpenSubtitles"
            }
          />
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: typography.callout - 2,
              marginBottom: 16,
              marginLeft: 8,
            }}
          >
            {t("home.settings.subtitles.opensubtitles_hint") ||
              "Enter your OpenSubtitles API key to enable client-side subtitle search as a fallback when your Jellyfin server doesn't have a subtitle provider configured."}
          </Text>
          <TVSettingsTextInput
            label={
              t("home.settings.subtitles.opensubtitles_api_key") || "API Key"
            }
            value={openSubtitlesApiKey}
            placeholder={
              t("home.settings.subtitles.opensubtitles_api_key_placeholder") ||
              "Enter API key..."
            }
            onChangeText={setOpenSubtitlesApiKey}
            onBlur={() => updateSettings({ openSubtitlesApiKey })}
            secureTextEntry
          />
          <Text
            style={{
              color: "#6B7280",
              fontSize: typography.callout - 4,
              marginTop: 8,
              marginLeft: 8,
            }}
          >
            {t("home.settings.subtitles.opensubtitles_get_key") ||
              "Get your free API key at opensubtitles.com/en/consumers"}
          </Text>

          {/* Appearance Section */}
          <TVSectionHeader title={t("home.settings.appearance.title")} />
          <TVSettingsOptionButton
            label={t("home.settings.appearance.text_size")}
            value={typographyScaleLabel}
            onPress={() =>
              showOptions({
                title: t("home.settings.appearance.text_size"),
                options: typographyScaleOptions,
                onSelect: (value) =>
                  updateSettings({ tvTypographyScale: value }),
              })
            }
          />
          <TVSettingsToggle
            label={t(
              "home.settings.appearance.merge_next_up_continue_watching",
            )}
            value={settings.mergeNextUpAndContinueWatching}
            onToggle={(value) =>
              updateSettings({ mergeNextUpAndContinueWatching: value })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.appearance.show_home_backdrop")}
            value={settings.showHomeBackdrop}
            onToggle={(value) => updateSettings({ showHomeBackdrop: value })}
          />
          <TVSettingsToggle
            label={t("home.settings.appearance.show_hero_carousel")}
            value={settings.showTVHeroCarousel}
            onToggle={(value) => updateSettings({ showTVHeroCarousel: value })}
          />
          <TVSettingsToggle
            label={t("home.settings.appearance.show_series_poster_on_episode")}
            value={settings.showSeriesPosterOnEpisode}
            onToggle={(value) =>
              updateSettings({ showSeriesPosterOnEpisode: value })
            }
          />

          {/* User Section */}
          <TVSectionHeader
            title={t("home.settings.user_info.user_info_title")}
          />
          <TVSettingsRow
            label={t("home.settings.user_info.user")}
            value={user?.Name || "-"}
            showChevron={false}
          />
          <TVSettingsRow
            label={t("home.settings.user_info.server")}
            value={api?.basePath || "-"}
            showChevron={false}
          />

          {/* Logout Button */}
          <View style={{ marginTop: 48, alignItems: "center" }}>
            <TVLogoutButton onPress={logout} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
