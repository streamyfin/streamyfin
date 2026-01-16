import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useAtom } from "jotai";
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { apiAtom, useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import { AudioTranscodeMode, useSettings } from "@/utils/atoms/settings";

// TV-optimized focusable row component
const TVSettingsRow: React.FC<{
  label: string;
  value: string;
  onPress?: () => void;
  isFirst?: boolean;
  showChevron?: boolean;
}> = ({ label, value, onPress, isFirst, showChevron = true }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.02);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={isFirst}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
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
        }}
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
}> = ({ label, value, onToggle, isFirst }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={() => onToggle(!value)}
      onFocus={() => {
        setFocused(true);
        animateTo(1.02);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={isFirst}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
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
        }}
      >
        <Text style={{ fontSize: 20, color: "#FFFFFF" }}>{label}</Text>
        <View
          style={{
            width: 56,
            height: 32,
            borderRadius: 16,
            backgroundColor: value ? "#7c3aed" : "#4B5563",
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
}> = ({ label, value, onDecrease, onIncrease, formatValue, isFirst }) => {
  const [focused, setFocused] = useState(false);
  const [buttonFocused, setButtonFocused] = useState<"minus" | "plus" | null>(
    null,
  );
  const scale = useRef(new Animated.Value(1)).current;
  const minusScale = useRef(new Animated.Value(1)).current;
  const plusScale = useRef(new Animated.Value(1)).current;

  const animateTo = (ref: Animated.Value, v: number) =>
    Animated.timing(ref, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <View
      style={{
        backgroundColor:
          focused || buttonFocused
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
        onFocus={() => {
          setFocused(true);
          animateTo(scale, 1.02);
        }}
        onBlur={() => {
          setFocused(false);
          animateTo(scale, 1);
        }}
        hasTVPreferredFocus={isFirst}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Text style={{ fontSize: 20, color: "#FFFFFF" }}>{label}</Text>
        </Animated.View>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          onPress={onDecrease}
          onFocus={() => {
            setButtonFocused("minus");
            animateTo(minusScale, 1.1);
          }}
          onBlur={() => {
            setButtonFocused(null);
            animateTo(minusScale, 1);
          }}
        >
          <Animated.View
            style={{
              transform: [{ scale: minusScale }],
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor:
                buttonFocused === "minus" ? "#7c3aed" : "#4B5563",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name='remove' size={24} color='#FFFFFF' />
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
          onFocus={() => {
            setButtonFocused("plus");
            animateTo(plusScale, 1.1);
          }}
          onBlur={() => {
            setButtonFocused(null);
            animateTo(plusScale, 1);
          }}
        >
          <Animated.View
            style={{
              transform: [{ scale: plusScale }],
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: buttonFocused === "plus" ? "#7c3aed" : "#4B5563",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name='add' size={24} color='#FFFFFF' />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
};

// TV-optimized dropdown selector
const TVSettingsDropdown: React.FC<{
  label: string;
  options: { label: string; value: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  isFirst?: boolean;
}> = ({ label, options, selectedValue, onSelect, isFirst }) => {
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const selectedLabel =
    options.find((o) => o.value === selectedValue)?.label || selectedValue;

  if (expanded) {
    return (
      <View
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          borderRadius: 12,
          marginBottom: 8,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            paddingVertical: 16,
            paddingHorizontal: 24,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255, 255, 255, 0.1)",
          }}
        >
          <Text style={{ fontSize: 18, color: "#9CA3AF" }}>{label}</Text>
        </View>
        {options.map((option, index) => (
          <TVDropdownOption
            key={option.value}
            label={option.label}
            selected={option.value === selectedValue}
            onSelect={() => {
              onSelect(option.value);
              setExpanded(false);
            }}
            isFirst={index === 0}
          />
        ))}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => setExpanded(true)}
      onFocus={() => {
        setFocused(true);
        animateTo(1.02);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={isFirst}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
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
        }}
      >
        <Text style={{ fontSize: 20, color: "#FFFFFF" }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 18, color: "#9CA3AF", marginRight: 12 }}>
            {selectedLabel}
          </Text>
          <Ionicons name='chevron-down' size={20} color='#6B7280' />
        </View>
      </Animated.View>
    </Pressable>
  );
};

// Dropdown option component
const TVDropdownOption: React.FC<{
  label: string;
  selected: boolean;
  onSelect: () => void;
  isFirst?: boolean;
}> = ({ label, selected, onSelect, isFirst }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onSelect}
      onFocus={() => {
        setFocused(true);
        animateTo(1.02);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={isFirst}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          backgroundColor: focused ? "rgba(124, 58, 237, 0.5)" : "transparent",
          paddingVertical: 14,
          paddingHorizontal: 24,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 18, color: "#FFFFFF" }}>{label}</Text>
        {selected && <Ionicons name='checkmark' size={24} color='#7c3aed' />}
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
const TVLogoutButton: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          shadowColor: "#ef4444",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: focused ? 0.6 : 0,
          shadowRadius: focused ? 20 : 0,
        }}
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

  // Audio transcoding options
  const audioTranscodeModeOptions = [
    {
      label: t("home.settings.audio.transcode_mode.auto"),
      value: AudioTranscodeMode.Auto,
    },
    {
      label: t("home.settings.audio.transcode_mode.stereo"),
      value: AudioTranscodeMode.ForceStereo,
    },
    {
      label: t("home.settings.audio.transcode_mode.5_1"),
      value: AudioTranscodeMode.Allow51,
    },
    {
      label: t("home.settings.audio.transcode_mode.passthrough"),
      value: AudioTranscodeMode.AllowAll,
    },
  ];

  // Subtitle mode options
  const subtitleModeOptions = [
    {
      label: t("home.settings.subtitles.modes.Default"),
      value: SubtitlePlaybackMode.Default,
    },
    {
      label: t("home.settings.subtitles.modes.Smart"),
      value: SubtitlePlaybackMode.Smart,
    },
    {
      label: t("home.settings.subtitles.modes.OnlyForced"),
      value: SubtitlePlaybackMode.OnlyForced,
    },
    {
      label: t("home.settings.subtitles.modes.Always"),
      value: SubtitlePlaybackMode.Always,
    },
    {
      label: t("home.settings.subtitles.modes.None"),
      value: SubtitlePlaybackMode.None,
    },
  ];

  // MPV alignment options
  const alignXOptions = [
    { label: "Left", value: "left" },
    { label: "Center", value: "center" },
    { label: "Right", value: "right" },
  ];

  const alignYOptions = [
    { label: "Top", value: "top" },
    { label: "Center", value: "center" },
    { label: "Bottom", value: "bottom" },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#000000" }}
      contentContainerStyle={{
        paddingTop: insets.top + 40,
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
      <TVSettingsDropdown
        label={t("home.settings.audio.transcode_mode.title")}
        options={audioTranscodeModeOptions}
        selectedValue={settings.audioTranscodeMode || AudioTranscodeMode.Auto}
        onSelect={(value) =>
          updateSettings({ audioTranscodeMode: value as AudioTranscodeMode })
        }
        isFirst
      />

      {/* Subtitles Section */}
      <SectionHeader title={t("home.settings.subtitles.subtitle_title")} />
      <TVSettingsDropdown
        label={t("home.settings.subtitles.subtitle_mode")}
        options={subtitleModeOptions}
        selectedValue={settings.subtitleMode || SubtitlePlaybackMode.Default}
        onSelect={(value) =>
          updateSettings({ subtitleMode: value as SubtitlePlaybackMode })
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
          updateSettings({ mpvSubtitleScale: Math.round(newValue * 10) / 10 });
        }}
        onIncrease={() => {
          const newValue = Math.min(
            2.0,
            (settings.mpvSubtitleScale ?? 1.0) + 0.1,
          );
          updateSettings({ mpvSubtitleScale: Math.round(newValue * 10) / 10 });
        }}
        formatValue={(v) => `${v.toFixed(1)}x`}
      />
      <TVSettingsStepper
        label='Vertical Margin'
        value={settings.mpvSubtitleMarginY ?? 0}
        onDecrease={() => {
          const newValue = Math.max(0, (settings.mpvSubtitleMarginY ?? 0) - 5);
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
      <TVSettingsDropdown
        label='Horizontal Alignment'
        options={alignXOptions}
        selectedValue={settings.mpvSubtitleAlignX ?? "center"}
        onSelect={(value) =>
          updateSettings({
            mpvSubtitleAlignX: value as "left" | "center" | "right",
          })
        }
      />
      <TVSettingsDropdown
        label='Vertical Alignment'
        options={alignYOptions}
        selectedValue={settings.mpvSubtitleAlignY ?? "bottom"}
        onSelect={(value) =>
          updateSettings({
            mpvSubtitleAlignY: value as "top" | "center" | "bottom",
          })
        }
      />

      {/* Appearance Section */}
      <SectionHeader title={t("home.settings.appearance.title")} />
      <TVSettingsToggle
        label={t("home.settings.appearance.merge_next_up_continue_watching")}
        value={settings.mergeNextUpAndContinueWatching}
        onToggle={(value) =>
          updateSettings({ mergeNextUpAndContinueWatching: value })
        }
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
  );
}
