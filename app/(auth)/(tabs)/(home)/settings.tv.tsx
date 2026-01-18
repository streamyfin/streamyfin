import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { BlurView } from "expo-blur";
import { useAtom } from "jotai";
import React, { useMemo, useRef, useState } from "react";
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
  disabled?: boolean;
}> = ({ label, value, onPress, isFirst, showChevron = true, disabled }) => {
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
      hasTVPreferredFocus={isFirst && !disabled}
      disabled={disabled}
      focusable={!disabled}
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
  disabled?: boolean;
}> = ({ label, value, onToggle, isFirst, disabled }) => {
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
      hasTVPreferredFocus={isFirst && !disabled}
      disabled={disabled}
      focusable={!disabled}
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
        hasTVPreferredFocus={isFirst && !disabled}
        disabled={disabled}
        focusable={!disabled}
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
          disabled={disabled}
          focusable={!disabled}
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
          disabled={disabled}
          focusable={!disabled}
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

// Option item type for bottom sheet selector
type TVSettingsOptionItem<T> = {
  label: string;
  value: T;
  selected: boolean;
};

// TV Settings Option Button - displays current value and opens bottom sheet
const TVSettingsOptionButton: React.FC<{
  label: string;
  value: string;
  onPress: () => void;
  isFirst?: boolean;
  disabled?: boolean;
}> = ({ label, value, onPress, isFirst, disabled }) => {
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
      hasTVPreferredFocus={isFirst && !disabled}
      disabled={disabled}
      focusable={!disabled}
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

// TV Settings Bottom Sheet - Apple TV style horizontal scrolling selector
const TVSettingsBottomSheet = <T,>({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: TVSettingsOptionItem<T>[];
  onSelect: (value: T) => void;
  onClose: () => void;
}) => {
  const initialSelectedIndex = useMemo(() => {
    const idx = options.findIndex((o) => o.selected);
    return idx >= 0 ? idx : 0;
  }, [options]);

  if (!visible) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <BlurView
        intensity={80}
        tint='dark'
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            paddingTop: 24,
            paddingBottom: 50,
            overflow: "visible",
          }}
        >
          {/* Title */}
          <Text
            style={{
              fontSize: 18,
              fontWeight: "500",
              color: "rgba(255,255,255,0.6)",
              marginBottom: 16,
              paddingHorizontal: 48,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {title}
          </Text>

          {/* Horizontal options */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ overflow: "visible" }}
            contentContainerStyle={{
              paddingHorizontal: 48,
              paddingVertical: 10,
              gap: 12,
            }}
          >
            {options.map((option, index) => (
              <TVSettingsOptionCard
                key={index}
                label={option.label}
                selected={option.selected}
                hasTVPreferredFocus={index === initialSelectedIndex}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
              />
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </View>
  );
};

// Option card for horizontal bottom sheet selector (Apple TV style)
const TVSettingsOptionCard: React.FC<{
  label: string;
  selected: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}> = ({ label, selected, hasTVPreferredFocus, onPress }) => {
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
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          width: 160,
          height: 75,
          backgroundColor: focused
            ? "#fff"
            : selected
              ? "rgba(255,255,255,0.2)"
              : "rgba(255,255,255,0.08)",
          borderRadius: 14,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 12,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            color: focused ? "#000" : "#fff",
            fontWeight: focused || selected ? "600" : "400",
            textAlign: "center",
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
        {selected && !focused && (
          <View
            style={{
              position: "absolute",
              top: 8,
              right: 8,
            }}
          >
            <Ionicons
              name='checkmark'
              size={16}
              color='rgba(255,255,255,0.8)'
            />
          </View>
        )}
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
      disabled={disabled}
      focusable={!disabled}
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

// Modal type for tracking open bottom sheets
type SettingsModalType =
  | "audioTranscode"
  | "subtitleMode"
  | "alignX"
  | "alignY"
  | null;

export default function SettingsTV() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { logout } = useJellyfin();
  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);

  // Modal state for option selectors
  const [openModal, setOpenModal] = useState<SettingsModalType>(null);

  const currentAudioTranscode =
    settings.audioTranscodeMode || AudioTranscodeMode.Auto;
  const currentSubtitleMode =
    settings.subtitleMode || SubtitlePlaybackMode.Default;
  const currentAlignX = settings.mpvSubtitleAlignX ?? "center";
  const currentAlignY = settings.mpvSubtitleAlignY ?? "bottom";

  // Audio transcoding options
  const audioTranscodeModeOptions = useMemo(
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
  const subtitleModeOptions = useMemo(
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
  const alignXOptions = useMemo(
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

  const alignYOptions = useMemo(
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

  const isModalOpen = openModal !== null;

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <View
        style={{ flex: 1, opacity: isModalOpen ? 0.3 : 1 }}
        focusable={!isModalOpen}
        isTVSelectable={!isModalOpen}
        pointerEvents={isModalOpen ? "none" : "auto"}
        accessibilityElementsHidden={isModalOpen}
        importantForAccessibility={isModalOpen ? "no-hide-descendants" : "auto"}
      >
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
            onPress={() => setOpenModal("audioTranscode")}
            isFirst
            disabled={isModalOpen}
          />

          {/* Subtitles Section */}
          <SectionHeader title={t("home.settings.subtitles.subtitle_title")} />
          <TVSettingsOptionButton
            label={t("home.settings.subtitles.subtitle_mode")}
            value={subtitleModeLabel}
            onPress={() => setOpenModal("subtitleMode")}
            disabled={isModalOpen}
          />
          <TVSettingsToggle
            label={t("home.settings.subtitles.set_subtitle_track")}
            value={settings.rememberSubtitleSelections}
            onToggle={(value) =>
              updateSettings({ rememberSubtitleSelections: value })
            }
            disabled={isModalOpen}
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
            disabled={isModalOpen}
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
            disabled={isModalOpen}
          />
          <TVSettingsOptionButton
            label='Horizontal Alignment'
            value={alignXLabel}
            onPress={() => setOpenModal("alignX")}
            disabled={isModalOpen}
          />
          <TVSettingsOptionButton
            label='Vertical Alignment'
            value={alignYLabel}
            onPress={() => setOpenModal("alignY")}
            disabled={isModalOpen}
          />

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
            disabled={isModalOpen}
          />
          <TVSettingsToggle
            label={t("home.settings.appearance.show_home_backdrop")}
            value={settings.showHomeBackdrop}
            onToggle={(value) => updateSettings({ showHomeBackdrop: value })}
            disabled={isModalOpen}
          />

          {/* User Section */}
          <SectionHeader title={t("home.settings.user_info.user_info_title")} />
          <TVSettingsRow
            label={t("home.settings.user_info.user")}
            value={user?.Name || "-"}
            showChevron={false}
            disabled={isModalOpen}
          />
          <TVSettingsRow
            label={t("home.settings.user_info.server")}
            value={api?.basePath || "-"}
            showChevron={false}
            disabled={isModalOpen}
          />

          {/* Logout Button */}
          <View style={{ marginTop: 48, alignItems: "center" }}>
            <TVLogoutButton onPress={logout} disabled={isModalOpen} />
          </View>
        </ScrollView>
      </View>

      {/* Bottom sheet modals */}
      <TVSettingsBottomSheet
        visible={openModal === "audioTranscode"}
        title={t("home.settings.audio.transcode_mode.title")}
        options={audioTranscodeModeOptions}
        onSelect={(value) =>
          updateSettings({ audioTranscodeMode: value as AudioTranscodeMode })
        }
        onClose={() => setOpenModal(null)}
      />

      <TVSettingsBottomSheet
        visible={openModal === "subtitleMode"}
        title={t("home.settings.subtitles.subtitle_mode")}
        options={subtitleModeOptions}
        onSelect={(value) =>
          updateSettings({ subtitleMode: value as SubtitlePlaybackMode })
        }
        onClose={() => setOpenModal(null)}
      />

      <TVSettingsBottomSheet
        visible={openModal === "alignX"}
        title='Horizontal Alignment'
        options={alignXOptions}
        onSelect={(value) =>
          updateSettings({
            mpvSubtitleAlignX: value as "left" | "center" | "right",
          })
        }
        onClose={() => setOpenModal(null)}
      />

      <TVSettingsBottomSheet
        visible={openModal === "alignY"}
        title='Vertical Alignment'
        options={alignYOptions}
        onSelect={(value) =>
          updateSettings({
            mpvSubtitleAlignY: value as "top" | "center" | "bottom",
          })
        }
        onClose={() => setOpenModal(null)}
      />
    </View>
  );
}
