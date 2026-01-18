import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useAtom } from "jotai";
import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import type { TVOptionItem } from "@/components/tv";
import { useTVFocusAnimation } from "@/components/tv";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { apiAtom, useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import { AudioTranscodeMode, useSettings } from "@/utils/atoms/settings";

// TV-optimized focusable row component
const TVSettingsRow: React.FC<{
  label: string;
  value: string;
  onPress?: () => void;
  isFirst?: boolean;
  showChevron?: boolean;
  disabled?: boolean;
}> = ({ label, value, onPress, isFirst, showChevron = true, disabled }) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.02 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={isFirst && !disabled}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: focused
              ? "rgba(255, 255, 255, 0.15)"
              : "rgba(255, 255, 255, 0.05)",
            borderRadius: 12,
            paddingVertical: 16,
            paddingHorizontal: 24,
            marginBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
        ]}
      >
        <Text style={{ fontSize: 20, color: "#FFFFFF" }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              fontSize: 18,
              color: "#9CA3AF",
              marginRight: showChevron ? 12 : 0,
            }}
          >
            {value}
          </Text>
          {showChevron && (
            <Ionicons name='chevron-forward' size={20} color='#6B7280' />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
};

// TV-optimized toggle row component
const TVSettingsToggle: React.FC<{
  label: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  isFirst?: boolean;
  disabled?: boolean;
}> = ({ label, value, onToggle, isFirst, disabled }) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.02 });

  return (
    <Pressable
      onPress={() => onToggle(!value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={isFirst && !disabled}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: focused
              ? "rgba(255, 255, 255, 0.15)"
              : "rgba(255, 255, 255, 0.05)",
            borderRadius: 12,
            paddingVertical: 16,
            paddingHorizontal: 24,
            marginBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
        ]}
      >
        <Text style={{ fontSize: 20, color: "#FFFFFF" }}>{label}</Text>
        <View
          style={{
            width: 56,
            height: 32,
            borderRadius: 16,
            backgroundColor: value ? "#34C759" : "#4B5563",
            justifyContent: "center",
            paddingHorizontal: 2,
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: "#FFFFFF",
              alignSelf: value ? "flex-end" : "flex-start",
            }}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
};

// TV-optimized stepper row component
const TVSettingsStepper: React.FC<{
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  formatValue?: (value: number) => string;
  isFirst?: boolean;
  disabled?: boolean;
}> = ({
  label,
  value,
  onDecrease,
  onIncrease,
  formatValue,
  isFirst,
  disabled,
}) => {
  const labelAnim = useTVFocusAnimation({ scaleAmount: 1.02 });
  const minusAnim = useTVFocusAnimation({ scaleAmount: 1.1 });
  const plusAnim = useTVFocusAnimation({ scaleAmount: 1.1 });

  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <View
      style={{
        backgroundColor:
          labelAnim.focused || minusAnim.focused || plusAnim.focused
            ? "rgba(255, 255, 255, 0.15)"
            : "rgba(255, 255, 255, 0.05)",
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 24,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Pressable
        onFocus={labelAnim.handleFocus}
        onBlur={labelAnim.handleBlur}
        hasTVPreferredFocus={isFirst && !disabled}
        disabled={disabled}
        focusable={!disabled}
      >
        <Animated.View style={labelAnim.animatedStyle}>
          <Text style={{ fontSize: 20, color: "#FFFFFF" }}>{label}</Text>
        </Animated.View>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          onPress={onDecrease}
          onFocus={minusAnim.handleFocus}
          onBlur={minusAnim.handleBlur}
          disabled={disabled}
          focusable={!disabled}
        >
          <Animated.View
            style={[
              minusAnim.animatedStyle,
              {
                width: 48,
                height: 36,
                borderRadius: 18,
                backgroundColor: minusAnim.focused ? "#FFFFFF" : "#4B5563",
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <Ionicons
              name='remove'
              size={24}
              color={minusAnim.focused ? "#000000" : "#FFFFFF"}
            />
          </Animated.View>
        </Pressable>
        <Text
          style={{
            fontSize: 18,
            color: "#FFFFFF",
            minWidth: 60,
            textAlign: "center",
            marginHorizontal: 16,
          }}
        >
          {displayValue}
        </Text>
        <Pressable
          onPress={onIncrease}
          onFocus={plusAnim.handleFocus}
          onBlur={plusAnim.handleBlur}
          disabled={disabled}
          focusable={!disabled}
        >
          <Animated.View
            style={[
              plusAnim.animatedStyle,
              {
                width: 48,
                height: 36,
                borderRadius: 18,
                backgroundColor: plusAnim.focused ? "#FFFFFF" : "#4B5563",
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <Ionicons
              name='add'
              size={24}
              color={plusAnim.focused ? "#000000" : "#FFFFFF"}
            />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
};

// TV Settings Option Button - displays current value and opens bottom sheet
const TVSettingsOptionButton: React.FC<{
  label: string;
  value: string;
  onPress: () => void;
  isFirst?: boolean;
  disabled?: boolean;
}> = ({ label, value, onPress, isFirst, disabled }) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.02 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={isFirst && !disabled}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: focused
              ? "rgba(255, 255, 255, 0.15)"
              : "rgba(255, 255, 255, 0.05)",
            borderRadius: 12,
            paddingVertical: 16,
            paddingHorizontal: 24,
            marginBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
        ]}
      >
        <Text style={{ fontSize: 20, color: "#FFFFFF" }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              fontSize: 18,
              color: "#9CA3AF",
              marginRight: 12,
            }}
          >
            {value}
          </Text>
          <Ionicons name='chevron-forward' size={20} color='#6B7280' />
        </View>
      </Animated.View>
    </Pressable>
  );
};

// TV-optimized text input component
const TVSettingsTextInput: React.FC<{
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  secureTextEntry?: boolean;
  disabled?: boolean;
}> = ({
  label,
  value,
  placeholder,
  onChangeText,
  onBlur,
  secureTextEntry,
  disabled,
}) => {
  const inputRef = useRef<TextInput>(null);
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.02 });

  const handleInputBlur = () => {
    handleBlur();
    onBlur?.();
  };

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      onFocus={handleFocus}
      onBlur={handleInputBlur}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: focused
              ? "rgba(255, 255, 255, 0.15)"
              : "rgba(255, 255, 255, 0.05)",
            borderRadius: 12,
            paddingVertical: 16,
            paddingHorizontal: 24,
            marginBottom: 8,
          },
        ]}
      >
        <Text style={{ fontSize: 16, color: "#9CA3AF", marginBottom: 8 }}>
          {label}
        </Text>
        <TextInput
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          placeholderTextColor='#6B7280'
          onChangeText={onChangeText}
          onBlur={handleInputBlur}
          secureTextEntry={secureTextEntry}
          autoCapitalize='none'
          autoCorrect={false}
          style={{
            fontSize: 18,
            color: "#FFFFFF",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderWidth: focused ? 2 : 1,
            borderColor: focused ? "#FFFFFF" : "#4B5563",
          }}
        />
      </Animated.View>
    </Pressable>
  );
};

// Section header component
const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <Text
    style={{
      fontSize: 16,
      fontWeight: "600",
      color: "#9CA3AF",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginTop: 32,
      marginBottom: 16,
      marginLeft: 8,
    }}
  >
    {title}
  </Text>
);

// Logout button component
const TVLogoutButton: React.FC<{ onPress: () => void; disabled?: boolean }> = ({
  onPress,
  disabled,
}) => {
  const { t } = useTranslation();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            shadowColor: "#ef4444",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.6 : 0,
            shadowRadius: focused ? 20 : 0,
          },
        ]}
      >
        <View
          style={{
            backgroundColor: focused ? "#ef4444" : "rgba(239, 68, 68, 0.8)",
            borderRadius: 12,
            paddingVertical: 18,
            paddingHorizontal: 48,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              color: "#FFFFFF",
            }}
          >
            {t("home.settings.log_out_button")}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
};

export default function SettingsTV() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { logout } = useJellyfin();
  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);
  const { showOptions } = useTVOptionModal();

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
              fontSize: 42,
              fontWeight: "bold",
              color: "#FFFFFF",
              marginBottom: 8,
            }}
          >
            {t("home.settings.settings_title")}
          </Text>

          {/* Audio Section */}
          <SectionHeader title={t("home.settings.audio.audio_title")} />
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
          <SectionHeader title={t("home.settings.subtitles.subtitle_title")} />
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
          <SectionHeader title='MPV Subtitle Settings' />
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
          <SectionHeader
            title={
              t("home.settings.subtitles.opensubtitles_title") ||
              "OpenSubtitles"
            }
          />
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 14,
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
              fontSize: 12,
              marginTop: 8,
              marginLeft: 8,
            }}
          >
            {t("home.settings.subtitles.opensubtitles_get_key") ||
              "Get your free API key at opensubtitles.com/en/consumers"}
          </Text>

          {/* Appearance Section */}
          <SectionHeader title={t("home.settings.appearance.title")} />
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

          {/* User Section */}
          <SectionHeader title={t("home.settings.user_info.user_info_title")} />
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
