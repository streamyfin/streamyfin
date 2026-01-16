import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { BITRATES, type Bitrate } from "@/components/BitrateSelector";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { GenreTags } from "@/components/GenreTags";
import useRouter from "@/hooks/useAppRouter";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { useImageColorsReturn } from "@/hooks/useImageColorsReturn";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { runtimeTicksToMinutes } from "@/utils/time";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type SelectedOptions = {
  bitrate: Bitrate;
  mediaSource: MediaSourceInfo | undefined;
  audioIndex: number | undefined;
  subtitleIndex: number;
};

interface ItemContentTVProps {
  item: BaseItemDto;
  itemWithSources?: BaseItemDto | null;
}

// Focusable button component for TV with Apple TV-style animations
const TVFocusableButton: React.FC<{
  onPress: () => void;
  children: React.ReactNode;
  hasTVPreferredFocus?: boolean;
  style?: any;
  variant?: "primary" | "secondary";
}> = ({
  onPress,
  children,
  hasTVPreferredFocus,
  style,
  variant = "primary",
}) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const isPrimary = variant === "primary";

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
        style={[
          {
            transform: [{ scale }],
            shadowColor: isPrimary ? "#fff" : "#a855f7",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.6 : 0,
            shadowRadius: focused ? 20 : 0,
          },
          style,
        ]}
      >
        <View
          style={{
            backgroundColor: focused
              ? isPrimary
                ? "#ffffff"
                : "#7c3aed"
              : isPrimary
                ? "rgba(255, 255, 255, 0.9)"
                : "rgba(124, 58, 237, 0.8)",
            borderRadius: 12,
            paddingVertical: 18,
            paddingHorizontal: 32,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 180,
          }}
        >
          {children}
        </View>
      </Animated.View>
    </Pressable>
  );
};

// Info row component for metadata display
const _InfoRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <View style={{ flexDirection: "row", marginBottom: 8 }}>
    <Text style={{ color: "#9CA3AF", fontSize: 16, width: 100 }}>{label}</Text>
    <Text style={{ color: "#FFFFFF", fontSize: 16, flex: 1 }}>{value}</Text>
  </View>
);

// Option item for the TV selector modal
type TVOptionItem<T> = {
  label: string;
  value: T;
  selected: boolean;
};

// TV Option Selector (Modal style - saved as backup)
const _TVOptionSelectorModal = <T,>({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: TVOptionItem<T>[];
  onSelect: (value: T) => void;
  onClose: () => void;
}) => {
  // Find the initially selected index
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
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <View
        style={{
          backgroundColor: "#111",
          borderRadius: 16,
          paddingVertical: 24,
          paddingHorizontal: 32,
          minWidth: 420,
          maxWidth: SCREEN_WIDTH * 0.4,
          maxHeight: SCREEN_HEIGHT * 0.7,
          overflow: "visible",
        }}
      >
        {/* Header */}
        <Text
          style={{
            fontSize: 24,
            fontWeight: "600",
            color: "#FFFFFF",
            marginBottom: 16,
            paddingHorizontal: 8,
          }}
        >
          {title}
        </Text>

        {/* Options list */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: SCREEN_HEIGHT * 0.5, overflow: "visible" }}
          contentContainerStyle={{ paddingVertical: 4, paddingHorizontal: 4 }}
        >
          {options.map((option, index) => (
            <_TVOptionRowModal
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
    </View>
  );
};

// Individual option row in the modal selector (backup)
const _TVOptionRowModal: React.FC<{
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
      duration: 120,
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
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={{ marginBottom: 2 }}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: focused ? "#2a2a2a" : "transparent",
          borderRadius: 10,
          paddingVertical: 14,
          paddingHorizontal: 16,
        }}
      >
        <View style={{ width: 28, marginRight: 12 }}>
          {selected && <Ionicons name='checkmark' size={22} color='#a855f7' />}
        </View>
        <Text
          style={{
            fontSize: 18,
            color: focused || selected ? "#FFFFFF" : "#888",
            fontWeight: selected ? "600" : "400",
            flex: 1,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

// TV Option Selector - Bottom sheet with horizontal scrolling (Apple TV style)
const TVOptionSelector = <T,>({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: TVOptionItem<T>[];
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
              <TVOptionCard
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

// Option card for horizontal selector (Apple TV style)
const TVOptionCard: React.FC<{
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

// Button to open option selector
const TVOptionButton: React.FC<{
  label: string;
  value: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}> = ({ label, value, onPress, hasTVPreferredFocus }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 120,
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
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          shadowColor: "#fff",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: focused ? 0.4 : 0,
          shadowRadius: focused ? 12 : 0,
        }}
      >
        <View
          style={{
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.1)",
            borderRadius: 10,
            paddingVertical: 10,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              color: focused ? "#444" : "#bbb",
            }}
          >
            {label}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: focused ? "#000" : "#FFFFFF",
              fontWeight: "500",
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
};

// Export as both ItemContentTV (for direct requires) and ItemContent (for platform-resolved imports)
export const ItemContentTV: React.FC<ItemContentTVProps> = React.memo(
  ({ item, itemWithSources }) => {
    const [api] = useAtom(apiAtom);
    const [_user] = useAtom(userAtom);
    const isOffline = useOfflineMode();
    const { settings } = useSettings();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { t } = useTranslation();

    const _itemColors = useImageColorsReturn({ item });

    const [selectedOptions, setSelectedOptions] = useState<
      SelectedOptions | undefined
    >(undefined);

    const {
      defaultAudioIndex,
      defaultBitrate,
      defaultMediaSource,
      defaultSubtitleIndex,
    } = useDefaultPlaySettings(itemWithSources ?? item, settings);

    const logoUrl = useMemo(
      () => (item ? getLogoImageUrlById({ api, item }) : null),
      [api, item],
    );

    // Set default play options
    useEffect(() => {
      setSelectedOptions(() => ({
        bitrate: defaultBitrate,
        mediaSource: defaultMediaSource ?? undefined,
        subtitleIndex: defaultSubtitleIndex ?? -1,
        audioIndex: defaultAudioIndex,
      }));
    }, [
      defaultAudioIndex,
      defaultBitrate,
      defaultSubtitleIndex,
      defaultMediaSource,
    ]);

    const handlePlay = () => {
      if (!item || !selectedOptions) return;

      const queryParams = new URLSearchParams({
        itemId: item.Id!,
        audioIndex: selectedOptions.audioIndex?.toString() ?? "",
        subtitleIndex: selectedOptions.subtitleIndex?.toString() ?? "",
        mediaSourceId: selectedOptions.mediaSource?.Id ?? "",
        bitrateValue: selectedOptions.bitrate?.value?.toString() ?? "",
        playbackPosition:
          item.UserData?.PlaybackPositionTicks?.toString() ?? "0",
        offline: isOffline ? "true" : "false",
      });

      router.push(`/player/direct-player?${queryParams.toString()}`);
    };

    // Modal state for option selectors
    type ModalType = "audio" | "subtitle" | "mediaSource" | "quality" | null;
    const [openModal, setOpenModal] = useState<ModalType>(null);

    // Get available audio tracks
    const audioTracks = useMemo(() => {
      const streams = selectedOptions?.mediaSource?.MediaStreams?.filter(
        (s) => s.Type === "Audio",
      );
      return streams ?? [];
    }, [selectedOptions?.mediaSource]);

    // Get available subtitle tracks
    const subtitleTracks = useMemo(() => {
      const streams = selectedOptions?.mediaSource?.MediaStreams?.filter(
        (s) => s.Type === "Subtitle",
      );
      return streams ?? [];
    }, [selectedOptions?.mediaSource]);

    // Get available media sources
    const mediaSources = useMemo(() => {
      return (itemWithSources ?? item)?.MediaSources ?? [];
    }, [item, itemWithSources]);

    // Audio options for selector
    const audioOptions = useMemo(() => {
      return audioTracks.map((track) => ({
        label:
          track.DisplayTitle ||
          `${track.Language || "Unknown"} (${track.Codec})`,
        value: track.Index!,
        selected: track.Index === selectedOptions?.audioIndex,
      }));
    }, [audioTracks, selectedOptions?.audioIndex]);

    // Subtitle options for selector (with "None" option)
    const subtitleOptions = useMemo(() => {
      const noneOption = {
        label: t("item_card.subtitles.none"),
        value: -1,
        selected: selectedOptions?.subtitleIndex === -1,
      };
      const trackOptions = subtitleTracks.map((track) => ({
        label:
          track.DisplayTitle ||
          `${track.Language || "Unknown"} (${track.Codec})`,
        value: track.Index!,
        selected: track.Index === selectedOptions?.subtitleIndex,
      }));
      return [noneOption, ...trackOptions];
    }, [subtitleTracks, selectedOptions?.subtitleIndex, t]);

    // Media source options for selector
    const mediaSourceOptions = useMemo(() => {
      return mediaSources.map((source) => {
        const videoStream = source.MediaStreams?.find(
          (s) => s.Type === "Video",
        );
        const displayName =
          videoStream?.DisplayTitle || source.Name || `Source ${source.Id}`;
        return {
          label: displayName,
          value: source,
          selected: source.Id === selectedOptions?.mediaSource?.Id,
        };
      });
    }, [mediaSources, selectedOptions?.mediaSource?.Id]);

    // Quality/bitrate options for selector
    const qualityOptions = useMemo(() => {
      return BITRATES.map((bitrate) => ({
        label: bitrate.key,
        value: bitrate,
        selected: bitrate.value === selectedOptions?.bitrate?.value,
      }));
    }, [selectedOptions?.bitrate?.value]);

    // Handlers for option changes
    const handleAudioChange = useCallback((audioIndex: number) => {
      setSelectedOptions((prev) =>
        prev ? { ...prev, audioIndex } : undefined,
      );
    }, []);

    const handleSubtitleChange = useCallback((subtitleIndex: number) => {
      setSelectedOptions((prev) =>
        prev ? { ...prev, subtitleIndex } : undefined,
      );
    }, []);

    const handleMediaSourceChange = useCallback(
      (mediaSource: MediaSourceInfo) => {
        // When media source changes, reset audio/subtitle to defaults
        const defaultAudio = mediaSource.MediaStreams?.find(
          (s) => s.Type === "Audio" && s.IsDefault,
        );
        const defaultSubtitle = mediaSource.MediaStreams?.find(
          (s) => s.Type === "Subtitle" && s.IsDefault,
        );
        setSelectedOptions((prev) =>
          prev
            ? {
                ...prev,
                mediaSource,
                audioIndex: defaultAudio?.Index ?? prev.audioIndex,
                subtitleIndex: defaultSubtitle?.Index ?? -1,
              }
            : undefined,
        );
      },
      [],
    );

    const handleQualityChange = useCallback((bitrate: Bitrate) => {
      setSelectedOptions((prev) => (prev ? { ...prev, bitrate } : undefined));
    }, []);

    // Get display values for buttons
    const selectedAudioLabel = useMemo(() => {
      const track = audioTracks.find(
        (t) => t.Index === selectedOptions?.audioIndex,
      );
      return track?.DisplayTitle || track?.Language || t("item_card.audio");
    }, [audioTracks, selectedOptions?.audioIndex, t]);

    const selectedSubtitleLabel = useMemo(() => {
      if (selectedOptions?.subtitleIndex === -1)
        return t("item_card.subtitles.none");
      const track = subtitleTracks.find(
        (t) => t.Index === selectedOptions?.subtitleIndex,
      );
      return track?.DisplayTitle || track?.Language || t("item_card.subtitles");
    }, [subtitleTracks, selectedOptions?.subtitleIndex, t]);

    const selectedMediaSourceLabel = useMemo(() => {
      const source = selectedOptions?.mediaSource;
      if (!source) return t("item_card.video");
      const videoStream = source.MediaStreams?.find((s) => s.Type === "Video");
      return videoStream?.DisplayTitle || source.Name || t("item_card.video");
    }, [selectedOptions?.mediaSource, t]);

    const selectedQualityLabel = useMemo(() => {
      return selectedOptions?.bitrate?.key || t("item_card.quality");
    }, [selectedOptions?.bitrate?.key, t]);

    // Format year and duration
    const year = item.ProductionYear;
    const duration = item.RunTimeTicks
      ? runtimeTicksToMinutes(item.RunTimeTicks)
      : null;
    const hasProgress = (item.UserData?.PlaybackPositionTicks ?? 0) > 0;
    const remainingTime = hasProgress
      ? runtimeTicksToMinutes(
          (item.RunTimeTicks || 0) -
            (item.UserData?.PlaybackPositionTicks || 0),
        )
      : null;

    // Get director
    const director = item.People?.find((p) => p.Type === "Director");

    // Get cast (first 3)
    const cast = item.People?.filter((p) => p.Type === "Actor")?.slice(0, 3);

    if (!item || !selectedOptions) return null;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000",
        }}
      >
        {/* Full-screen backdrop */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          <ItemImage
            variant='Backdrop'
            item={item}
            style={{
              width: "100%",
              height: "100%",
            }}
          />
          {/* Gradient overlays for readability */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.95)"]}
            locations={[0, 0.5, 1]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "70%",
            }}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.8)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 0 }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "60%",
            }}
          />
        </View>

        {/* Main content area */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + 140,
            paddingBottom: insets.bottom + 60,
            paddingHorizontal: insets.left + 80,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Top section - Logo/Title + Metadata */}
          <View
            style={{
              flexDirection: "row",
              minHeight: SCREEN_HEIGHT * 0.45,
            }}
          >
            {/* Left side - Poster */}
            <View
              style={{
                width: SCREEN_WIDTH * 0.22,
                marginRight: 50,
              }}
            >
              <View
                style={{
                  aspectRatio: 2 / 3,
                  borderRadius: 16,
                  overflow: "hidden",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.5,
                  shadowRadius: 20,
                }}
              >
                <ItemImage
                  variant='Primary'
                  item={item}
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                />
              </View>
            </View>

            {/* Right side - Content */}
            <View style={{ flex: 1, justifyContent: "center" }}>
              {/* Logo or Title */}
              {logoUrl ? (
                <Image
                  source={{ uri: logoUrl }}
                  style={{
                    height: 100,
                    width: "80%",
                    marginBottom: 24,
                  }}
                  contentFit='contain'
                  contentPosition='left'
                />
              ) : (
                <Text
                  style={{
                    fontSize: 52,
                    fontWeight: "bold",
                    color: "#FFFFFF",
                    marginBottom: 16,
                  }}
                  numberOfLines={2}
                >
                  {item.Name}
                </Text>
              )}

              {/* Episode info for TV shows */}
              {item.Type === "Episode" && (
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontSize: 24,
                      color: "#FFFFFF",
                      fontWeight: "600",
                    }}
                  >
                    {item.SeriesName}
                  </Text>
                  <Text
                    style={{
                      fontSize: 20,
                      color: "#9CA3AF",
                      marginTop: 4,
                    }}
                  >
                    S{item.ParentIndexNumber} E{item.IndexNumber} · {item.Name}
                  </Text>
                </View>
              )}

              {/* Metadata badges row */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                {year != null && (
                  <Text style={{ color: "#9CA3AF", fontSize: 18 }}>{year}</Text>
                )}
                {duration && (
                  <Text style={{ color: "#9CA3AF", fontSize: 18 }}>
                    {duration}
                  </Text>
                )}
                {item.OfficialRating && (
                  <Badge text={item.OfficialRating} variant='gray' />
                )}
                {item.CommunityRating != null && (
                  <Badge
                    text={item.CommunityRating.toFixed(1)}
                    variant='gray'
                    iconLeft={<Ionicons name='star' size={16} color='gold' />}
                  />
                )}
              </View>

              {/* Genres */}
              {item.Genres && item.Genres.length > 0 && (
                <View style={{ marginBottom: 24 }}>
                  <GenreTags genres={item.Genres} />
                </View>
              )}

              {/* Overview */}
              {item.Overview && (
                <Text
                  style={{
                    fontSize: 18,
                    color: "#D1D5DB",
                    lineHeight: 28,
                    maxWidth: SCREEN_WIDTH * 0.45,
                    marginBottom: 32,
                  }}
                  numberOfLines={4}
                >
                  {item.Overview}
                </Text>
              )}

              {/* Action buttons */}
              <View
                style={{
                  flexDirection: "row",
                  gap: 16,
                  marginBottom: 32,
                }}
              >
                <TVFocusableButton
                  onPress={handlePlay}
                  hasTVPreferredFocus
                  variant='primary'
                >
                  <Ionicons
                    name='play'
                    size={28}
                    color='#000000'
                    style={{ marginRight: 10 }}
                  />
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "bold",
                      color: "#000000",
                    }}
                  >
                    {hasProgress
                      ? `${remainingTime} ${t("item_card.left")}`
                      : t("common.play")}
                  </Text>
                </TVFocusableButton>
              </View>

              {/* Playback options */}
              <View
                style={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 24,
                }}
              >
                {/* Quality selector */}
                <TVOptionButton
                  label={t("item_card.quality")}
                  value={selectedQualityLabel}
                  onPress={() => setOpenModal("quality")}
                />

                {/* Media source selector (only if multiple sources) */}
                {mediaSources.length > 1 && (
                  <TVOptionButton
                    label={t("item_card.video")}
                    value={selectedMediaSourceLabel}
                    onPress={() => setOpenModal("mediaSource")}
                  />
                )}

                {/* Audio selector */}
                {audioTracks.length > 0 && (
                  <TVOptionButton
                    label={t("item_card.audio")}
                    value={selectedAudioLabel}
                    onPress={() => setOpenModal("audio")}
                  />
                )}

                {/* Subtitle selector */}
                {(subtitleTracks.length > 0 ||
                  selectedOptions?.subtitleIndex !== undefined) && (
                  <TVOptionButton
                    label={t("item_card.subtitles")}
                    value={selectedSubtitleLabel}
                    onPress={() => setOpenModal("subtitle")}
                  />
                )}
              </View>

              {/* Progress bar (if partially watched) */}
              {hasProgress && item.RunTimeTicks != null && (
                <View style={{ maxWidth: 400, marginBottom: 24 }}>
                  <View
                    style={{
                      height: 4,
                      backgroundColor: "rgba(255,255,255,0.2)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: `${((item.UserData?.PlaybackPositionTicks || 0) / item.RunTimeTicks) * 100}%`,
                        height: "100%",
                        backgroundColor: "#a855f7",
                        borderRadius: 2,
                      }}
                    />
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Additional info section */}
          <View style={{ marginTop: 40 }}>
            {/* Cast & Crew */}
            {(director || (cast && cast.length > 0)) && (
              <View style={{ marginBottom: 32 }}>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "600",
                    color: "#FFFFFF",
                    marginBottom: 16,
                  }}
                >
                  {t("item_card.cast_and_crew")}
                </Text>
                <View style={{ flexDirection: "row", gap: 40 }}>
                  {director && (
                    <View>
                      <Text
                        style={{
                          fontSize: 14,
                          color: "#6B7280",
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          marginBottom: 4,
                        }}
                      >
                        {t("item_card.director")}
                      </Text>
                      <Text style={{ fontSize: 18, color: "#FFFFFF" }}>
                        {director.Name}
                      </Text>
                    </View>
                  )}
                  {cast && cast.length > 0 && (
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: "#6B7280",
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          marginBottom: 4,
                        }}
                      >
                        {t("item_card.cast")}
                      </Text>
                      <Text style={{ fontSize: 18, color: "#FFFFFF" }}>
                        {cast.map((c) => c.Name).join(", ")}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Technical details */}
            {selectedOptions.mediaSource?.MediaStreams &&
              selectedOptions.mediaSource.MediaStreams.length > 0 && (
                <View style={{ marginBottom: 32 }}>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: "600",
                      color: "#FFFFFF",
                      marginBottom: 16,
                    }}
                  >
                    {t("item_card.technical_details")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 40 }}>
                    {/* Video info */}
                    {(() => {
                      const videoStream =
                        selectedOptions.mediaSource?.MediaStreams?.find(
                          (s) => s.Type === "Video",
                        );
                      if (!videoStream) return null;
                      return (
                        <View>
                          <Text
                            style={{
                              fontSize: 14,
                              color: "#6B7280",
                              textTransform: "uppercase",
                              letterSpacing: 1,
                              marginBottom: 4,
                            }}
                          >
                            Video
                          </Text>
                          <Text style={{ fontSize: 18, color: "#FFFFFF" }}>
                            {videoStream.DisplayTitle ||
                              `${videoStream.Codec?.toUpperCase()} ${videoStream.Width}x${videoStream.Height}`}
                          </Text>
                        </View>
                      );
                    })()}
                    {/* Audio info */}
                    {(() => {
                      const audioStream =
                        selectedOptions.mediaSource?.MediaStreams?.find(
                          (s) => s.Type === "Audio",
                        );
                      if (!audioStream) return null;
                      return (
                        <View>
                          <Text
                            style={{
                              fontSize: 14,
                              color: "#6B7280",
                              textTransform: "uppercase",
                              letterSpacing: 1,
                              marginBottom: 4,
                            }}
                          >
                            Audio
                          </Text>
                          <Text style={{ fontSize: 18, color: "#FFFFFF" }}>
                            {audioStream.DisplayTitle ||
                              `${audioStream.Codec?.toUpperCase()} ${audioStream.Channels}ch`}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>
              )}
          </View>
        </ScrollView>

        {/* Option selector modals */}
        <TVOptionSelector
          visible={openModal === "quality"}
          title={t("item_card.quality")}
          options={qualityOptions}
          onSelect={handleQualityChange}
          onClose={() => setOpenModal(null)}
        />

        <TVOptionSelector
          visible={openModal === "mediaSource"}
          title={t("item_card.video")}
          options={mediaSourceOptions}
          onSelect={handleMediaSourceChange}
          onClose={() => setOpenModal(null)}
        />

        <TVOptionSelector
          visible={openModal === "audio"}
          title={t("item_card.audio")}
          options={audioOptions}
          onSelect={handleAudioChange}
          onClose={() => setOpenModal(null)}
        />

        <TVOptionSelector
          visible={openModal === "subtitle"}
          title={t("item_card.subtitles")}
          options={subtitleOptions}
          onSelect={handleSubtitleChange}
          onClose={() => setOpenModal(null)}
        />
      </View>
    );
  },
);

// Alias for platform-resolved imports (tvOS auto-resolves .tv.tsx files)
export const ItemContent = ItemContentTV;
