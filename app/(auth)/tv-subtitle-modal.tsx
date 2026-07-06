import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Animated,
  Easing,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVTabButton, useTVFocusAnimation } from "@/components/tv";
import type { Track } from "@/components/video-player/controls/types";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import {
  type SubtitleSearchResult,
  useRemoteSubtitles,
} from "@/hooks/useRemoteSubtitles";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { useSettings } from "@/utils/atoms/settings";
import { tvSubtitleModalAtom } from "@/utils/atoms/tvSubtitleModal";
import { COMMON_SUBTITLE_LANGUAGES } from "@/utils/opensubtitles/api";
import { scaleSize } from "@/utils/scaleSize";
import { store } from "@/utils/store";

type TabType = "tracks" | "download" | "settings";

// Track card for subtitle track selection
const TVTrackCard = React.forwardRef<
  View,
  {
    label: string;
    sublabel?: string;
    selected: boolean;
    hasTVPreferredFocus?: boolean;
    onPress: () => void;
  }
>(({ label, sublabel, selected, hasTVPreferredFocus, onPress }, ref) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05 });

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          styles.trackCard,
          animatedStyle,
          {
            backgroundColor: focused
              ? "#fff"
              : selected
                ? "rgba(255,255,255,0.2)"
                : "rgba(255,255,255,0.08)",
          },
        ]}
      >
        <Text
          style={[
            styles.trackCardText,
            { color: focused ? "#000" : "#fff", fontSize: scaleSize(16) },
            (focused || selected) && { fontWeight: "600" },
          ]}
          numberOfLines={3}
        >
          {label}
        </Text>
        {sublabel && (
          <Text
            style={[
              styles.trackCardSublabel,
              {
                color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)",
                fontSize: scaleSize(12),
              },
            ]}
            numberOfLines={1}
          >
            {sublabel}
          </Text>
        )}
        {selected && !focused && (
          <View style={styles.checkmark}>
            <Ionicons
              name='checkmark'
              size={scaleSize(16)}
              color='rgba(255,255,255,0.8)'
            />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

// Language selector card
const LanguageCard = React.forwardRef<
  View,
  {
    code: string;
    name: string;
    selected: boolean;
    hasTVPreferredFocus?: boolean;
    onPress: () => void;
  }
>(({ code, name, selected, hasTVPreferredFocus, onPress }, ref) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05 });

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          styles.languageCard,
          animatedStyle,
          {
            backgroundColor: focused
              ? "#fff"
              : selected
                ? "rgba(255,255,255,0.2)"
                : "rgba(255,255,255,0.08)",
          },
        ]}
      >
        <Text
          style={[
            styles.languageCardText,
            { color: focused ? "#000" : "#fff", fontSize: scaleSize(15) },
            (focused || selected) && { fontWeight: "600" },
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={[
            styles.languageCardCode,
            {
              color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)",
              fontSize: scaleSize(11),
            },
          ]}
        >
          {code.toUpperCase()}
        </Text>
        {selected && !focused && (
          <View style={styles.checkmark}>
            <Ionicons
              name='checkmark'
              size={scaleSize(16)}
              color='rgba(255,255,255,0.8)'
            />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

// Subtitle result card
const SubtitleResultCard = React.forwardRef<
  View,
  {
    result: SubtitleSearchResult;
    hasTVPreferredFocus?: boolean;
    isDownloading?: boolean;
    onPress: () => void;
  }
>(({ result, hasTVPreferredFocus, isDownloading, onPress }, ref) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.03 });

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
      disabled={isDownloading}
    >
      <Animated.View
        style={[
          styles.resultCard,
          animatedStyle,
          {
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.08)",
            borderColor: focused
              ? "rgba(255,255,255,0.8)"
              : "rgba(255,255,255,0.1)",
          },
        ]}
      >
        {/* Provider/Source badge */}
        <View
          style={[
            styles.providerBadge,
            {
              backgroundColor: focused
                ? "rgba(0,0,0,0.1)"
                : "rgba(255,255,255,0.1)",
            },
          ]}
        >
          <Text
            style={[
              styles.providerText,
              {
                color: focused ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)",
                fontSize: scaleSize(11),
              },
            ]}
          >
            {result.providerName}
          </Text>
        </View>

        {/* Name */}
        <Text
          style={[
            styles.resultName,
            { color: focused ? "#000" : "#fff", fontSize: scaleSize(14) },
          ]}
          numberOfLines={2}
        >
          {result.name}
        </Text>

        {/* Meta info row */}
        <View style={styles.resultMeta}>
          {/* Format */}
          <Text
            style={[
              styles.resultMetaText,
              {
                color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)",
                fontSize: scaleSize(12),
              },
            ]}
          >
            {result.format?.toUpperCase()}
          </Text>

          {/* Rating if available */}
          {result.communityRating !== undefined &&
            result.communityRating > 0 && (
              <View style={styles.ratingContainer}>
                <Ionicons
                  name='star'
                  size={scaleSize(12)}
                  color={focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)"}
                />
                <Text
                  style={[
                    styles.resultMetaText,
                    {
                      color: focused
                        ? "rgba(0,0,0,0.6)"
                        : "rgba(255,255,255,0.5)",
                      fontSize: scaleSize(12),
                    },
                  ]}
                >
                  {result.communityRating.toFixed(1)}
                </Text>
              </View>
            )}

          {/* Download count if available */}
          {result.downloadCount !== undefined && result.downloadCount > 0 && (
            <View style={styles.downloadCountContainer}>
              <Ionicons
                name='download-outline'
                size={scaleSize(12)}
                color={focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)"}
              />
              <Text
                style={[
                  styles.resultMetaText,
                  {
                    color: focused
                      ? "rgba(0,0,0,0.6)"
                      : "rgba(255,255,255,0.5)",
                    fontSize: scaleSize(12),
                  },
                ]}
              >
                {result.downloadCount.toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        {/* Flags */}
        <View style={styles.flagsContainer}>
          {result.isHashMatch && (
            <View
              style={[
                styles.flag,
                {
                  backgroundColor: focused
                    ? "rgba(0,150,0,0.2)"
                    : "rgba(0,200,0,0.2)",
                },
              ]}
            >
              <Text style={[styles.flagText, { fontSize: scaleSize(10) }]}>
                Hash Match
              </Text>
            </View>
          )}
          {result.hearingImpaired && (
            <View
              style={[
                styles.flag,
                {
                  backgroundColor: focused
                    ? "rgba(0,0,0,0.1)"
                    : "rgba(255,255,255,0.1)",
                },
              ]}
            >
              <Ionicons
                name='ear-outline'
                size={scaleSize(12)}
                color={focused ? "#000" : "#fff"}
              />
            </View>
          )}
          {result.aiTranslated && (
            <View
              style={[
                styles.flag,
                {
                  backgroundColor: focused
                    ? "rgba(0,0,150,0.2)"
                    : "rgba(100,100,255,0.2)",
                },
              ]}
            >
              <Text style={[styles.flagText, { fontSize: scaleSize(10) }]}>
                AI
              </Text>
            </View>
          )}
        </View>

        {/* Loading indicator when downloading */}
        {isDownloading && (
          <View style={styles.downloadingOverlay}>
            <ActivityIndicator size='small' color='#fff' />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

// Stepper button for subtitle size control
const TVStepperButton: React.FC<{
  icon: "remove" | "add";
  onPress: () => void;
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
}> = ({ icon, onPress, disabled, hasTVPreferredFocus }) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.1 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          styles.stepperButton,
          animatedStyle,
          {
            backgroundColor: focused
              ? "#fff"
              : disabled
                ? "rgba(255,255,255,0.05)"
                : "rgba(255,255,255,0.12)",
            opacity: disabled ? 0.4 : 1,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={scaleSize(28)}
          color={focused ? "#000" : disabled ? "rgba(255,255,255,0.4)" : "#fff"}
        />
      </Animated.View>
    </Pressable>
  );
};

// Generic stepper control component
const TVStepperControl: React.FC<{
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (value: number) => string;
  onChange: (newValue: number) => void;
  hasTVPreferredFocus?: boolean;
}> = ({
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
  hasTVPreferredFocus,
}) => {
  const canDecrease = value > min;
  const canIncrease = value < max;

  const handleDecrease = () => {
    if (canDecrease) {
      const newValue = Math.max(min, Math.round((value - step) * 10) / 10);
      onChange(newValue);
    }
  };

  const handleIncrease = () => {
    if (canIncrease) {
      const newValue = Math.min(max, Math.round((value + step) * 10) / 10);
      onChange(newValue);
    }
  };

  return (
    <View style={styles.sizeControlContainer}>
      <TVStepperButton
        icon='remove'
        onPress={handleDecrease}
        disabled={!canDecrease}
        hasTVPreferredFocus={hasTVPreferredFocus}
      />
      <View style={styles.sizeValueContainer}>
        <Text style={styles.sizeValueText}>{formatValue(value)}</Text>
      </View>
      <TVStepperButton
        icon='add'
        onPress={handleIncrease}
        disabled={!canIncrease}
      />
    </View>
  );
};

// Alignment option card
const TVAlignmentCard: React.FC<{
  label: string;
  selected: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}> = ({ label, selected, onPress, hasTVPreferredFocus }) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          styles.alignmentCard,
          animatedStyle,
          {
            backgroundColor: focused
              ? "#fff"
              : selected
                ? "rgba(255,255,255,0.2)"
                : "rgba(255,255,255,0.08)",
          },
        ]}
      >
        <Text
          style={[
            styles.alignmentCardText,
            { color: focused ? "#000" : "#fff", fontSize: scaleSize(15) },
            (focused || selected) && { fontWeight: "600" },
          ]}
        >
          {label}
        </Text>
        {selected && !focused && (
          <View style={styles.alignmentCheckmark}>
            <Ionicons
              name='checkmark'
              size={scaleSize(14)}
              color='rgba(255,255,255,0.8)'
            />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
};

export default function TVSubtitleModal() {
  const router = useRouter();
  const { t } = useTranslation();
  const modalState = useAtomValue(tvSubtitleModalAtom);
  const { settings, updateSettings } = useSettings();
  const typography = useScaledTVTypography();

  const [activeTab, setActiveTab] = useState<TabType>("tracks");
  const [selectedLanguage, setSelectedLanguage] = useState("eng");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [hasSearchedThisSession, setHasSearchedThisSession] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isTabContentReady, setIsTabContentReady] = useState(false);
  const firstTrackRef = useRef<View>(null);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(300)).current;

  const {
    hasOpenSubtitlesApiKey,
    isSearching,
    searchError,
    searchResults,
    search,
    downloadAsync,
    reset,
  } = useRemoteSubtitles({
    itemId: modalState?.item?.Id ?? "",
    item: modalState?.item ?? ({} as any),
    mediaSourceId: modalState?.mediaSourceId,
  });

  const resetRef = useRef(reset);
  resetRef.current = reset;

  const subtitleTracks = modalState?.subtitleTracks ?? [];
  const currentSubtitleIndex = modalState?.currentSubtitleIndex ?? -1;

  const initialSelectedTrackIndex = useMemo(() => {
    if (currentSubtitleIndex === -1) return 0;
    const trackIdx = subtitleTracks.findIndex(
      (t) => t.index === currentSubtitleIndex,
    );
    return trackIdx >= 0 ? trackIdx + 1 : 0;
  }, [subtitleTracks, currentSubtitleIndex]);

  // Track if component is mounted for async operations
  const isMountedRef = useRef(true);

  // Animate in on mount and cleanup atom on unmount
  useEffect(() => {
    isMountedRef.current = true;
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(300);

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => setIsReady(true), 100);
    return () => {
      clearTimeout(timer);
      isMountedRef.current = false;
      // Clear the atom on unmount to prevent stale callbacks from being retained
      store.set(tvSubtitleModalAtom, null);
    };
  }, [overlayOpacity, sheetTranslateY]);

  useEffect(() => {
    if (activeTab === "download" && !hasSearchedThisSession && modalState) {
      search({ language: selectedLanguage });
      setHasSearchedThisSession(true);
    }
  }, [activeTab, hasSearchedThisSession, search, selectedLanguage, modalState]);

  useEffect(() => {
    if (isReady) {
      setIsTabContentReady(false);
      const timer = setTimeout(() => setIsTabContentReady(true), 50);
      return () => clearTimeout(timer);
    }
    setIsTabContentReady(false);
  }, [activeTab, isReady]);

  const handleClose = useCallback(() => {
    store.set(tvSubtitleModalAtom, null);
    router.back();
  }, [router]);

  // Intercept back/menu press to close the modal instead of the player
  useTVBackPress(() => {
    handleClose();
    return true;
  }, [handleClose]);

  const handleLanguageSelect = useCallback(
    (code: string) => {
      setSelectedLanguage(code);
      search({ language: code });
    },
    [search],
  );

  const handleTrackSelect = useCallback(
    (option: { setTrack?: () => void }) => {
      // Close FIRST, apply after the modal route is dismissed: setTrack can
      // trigger replacePlayer (burn-in switches while transcoding), and a
      // router.replace fired while this modal is the active route targets the
      // MODAL instead of the player screen — the navigation is swallowed and
      // the selection silently no-ops (same trap as the setParams note in
      // Controls.tv's handleOpenSubtitleSheet).
      handleClose();
      InteractionManager.runAfterInteractions(() => option.setTrack?.());
    },
    [handleClose],
  );

  const handleDownload = useCallback(
    async (result: SubtitleSearchResult) => {
      setDownloadingId(result.id);

      try {
        const downloadResult = await downloadAsync(result);

        // Check if component is still mounted after async operation
        if (!isMountedRef.current) return;

        if (downloadResult.type === "server") {
          // Give Jellyfin time to process the downloaded subtitle
          await new Promise((resolve) => setTimeout(resolve, 5000));

          // Check if component is still mounted after the wait
          if (!isMountedRef.current) return;

          // Refresh tracks and stay open for server-side downloads
          if (modalState?.refreshSubtitleTracks) {
            const newTracks = await modalState.refreshSubtitleTracks();

            // Check if component is still mounted after fetching tracks
            if (!isMountedRef.current) return;

            // Update atom with new tracks
            store.set(tvSubtitleModalAtom, {
              ...modalState,
              subtitleTracks: newTracks,
            });
            // Switch to tracks tab to show the new subtitle
            setActiveTab("tracks");
          }

          // Also call onServerSubtitleDownloaded to invalidate React Query cache
          // (used when opening modal from item detail page)
          modalState?.onServerSubtitleDownloaded?.();

          // Do NOT close modal - user can see and select the new track
        } else if (downloadResult.type === "local" && downloadResult.path) {
          // Notify parent that a local subtitle was downloaded
          modalState?.onLocalSubtitleDownloaded?.(downloadResult.path);

          // Check if component is still mounted after callback
          if (!isMountedRef.current) return;

          // Refresh tracks to include the newly downloaded subtitle
          if (modalState?.refreshSubtitleTracks) {
            const newTracks = await modalState.refreshSubtitleTracks();

            // Check if component is still mounted after fetching tracks
            if (!isMountedRef.current) return;

            // Update atom with new tracks
            store.set(tvSubtitleModalAtom, {
              ...modalState,
              subtitleTracks: newTracks,
            });
            // Switch to tracks tab to show the new subtitle
            setActiveTab("tracks");
          } else {
            // No refreshSubtitleTracks available (e.g., from player), just close
            handleClose();
          }
        }
      } catch (error) {
        console.error("Failed to download subtitle:", error);
      } finally {
        if (isMountedRef.current) {
          setDownloadingId(null);
        }
      }
    },
    [downloadAsync, modalState, handleClose],
  );

  const displayLanguages = useMemo(
    () => COMMON_SUBTITLE_LANGUAGES.slice(0, 16),
    [],
  );

  const trackOptions = useMemo(() => {
    const noneOption = {
      label: t("item_card.subtitles.none"),
      sublabel: undefined as string | undefined,
      value: -1,
      selected: currentSubtitleIndex === -1,
      setTrack: () => modalState?.onDisableSubtitles?.(),
      isLocal: false,
    };
    const options = subtitleTracks.map((track: Track) => ({
      label: track.name,
      sublabel: track.isLocal
        ? t("player.downloaded") || "Downloaded"
        : (undefined as string | undefined),
      value: track.index,
      selected: track.index === currentSubtitleIndex,
      setTrack: track.setTrack,
      isLocal: track.isLocal ?? false,
    }));
    return [noneOption, ...options];
  }, [subtitleTracks, currentSubtitleIndex, t, modalState]);

  if (!modalState) {
    return null;
  }

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Animated.View
        style={[
          styles.sheetContainer,
          { transform: [{ translateY: sheetTranslateY }] },
        ]}
      >
        <BlurView intensity={90} tint='dark' style={styles.blurContainer}>
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.content}
          >
            {/* Header with tabs */}
            <View style={styles.header}>
              <Text style={[styles.title, { fontSize: typography.heading }]}>
                {t("item_card.subtitles.label") || "Subtitles"}
              </Text>

              {/* Tab bar */}
              <View style={styles.tabRow}>
                <TVTabButton
                  label={t("item_card.subtitles.tracks") || "Tracks"}
                  active={activeTab === "tracks"}
                  onSelect={() => setActiveTab("tracks")}
                />
                <TVTabButton
                  label={t("player.download") || "Download"}
                  active={activeTab === "download"}
                  onSelect={() => setActiveTab("download")}
                />
                <TVTabButton
                  label={t("player.settings") || "Settings"}
                  active={activeTab === "settings"}
                  onSelect={() => setActiveTab("settings")}
                />
              </View>
            </View>

            {/* Tracks Tab Content */}
            {activeTab === "tracks" && isTabContentReady && (
              <View style={styles.section}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.tracksScroll}
                  contentContainerStyle={styles.tracksScrollContent}
                >
                  {trackOptions.map((option, index) => (
                    <TVTrackCard
                      key={option.value}
                      ref={
                        index === initialSelectedTrackIndex
                          ? firstTrackRef
                          : undefined
                      }
                      label={option.label}
                      sublabel={option.sublabel}
                      selected={option.selected}
                      hasTVPreferredFocus={index === initialSelectedTrackIndex}
                      onPress={() => handleTrackSelect(option)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Download Tab Content */}
            {activeTab === "download" && isTabContentReady && (
              <>
                {/* Language Selector */}
                <View style={styles.section}>
                  <Text
                    style={[styles.sectionTitle, { fontSize: scaleSize(14) }]}
                  >
                    {t("player.language") || "Language"}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.languageScroll}
                    contentContainerStyle={styles.languageScrollContent}
                  >
                    {displayLanguages.map((lang, index) => (
                      <LanguageCard
                        key={lang.code}
                        code={lang.code}
                        name={lang.name}
                        selected={selectedLanguage === lang.code}
                        hasTVPreferredFocus={
                          index === 0 &&
                          (!searchResults || searchResults.length === 0)
                        }
                        onPress={() => handleLanguageSelect(lang.code)}
                      />
                    ))}
                  </ScrollView>
                </View>

                {/* Results Section */}
                <View style={styles.section}>
                  <Text
                    style={[styles.sectionTitle, { fontSize: scaleSize(14) }]}
                  >
                    {t("player.results") || "Results"}
                    {searchResults && ` (${searchResults.length})`}
                  </Text>

                  {/* Loading state */}
                  {isSearching && (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size='small' color='#fff' />
                    </View>
                  )}

                  {/* Error state */}
                  {searchError && !isSearching && (
                    <View style={styles.errorContainer}>
                      <Ionicons
                        name='alert-circle-outline'
                        size={scaleSize(32)}
                        color='rgba(255,100,100,0.8)'
                      />
                      <Text
                        style={[styles.errorText, { fontSize: scaleSize(16) }]}
                      >
                        {t("player.search_failed") || "Search failed"}
                      </Text>
                      <Text
                        style={[styles.errorHint, { fontSize: scaleSize(13) }]}
                      >
                        {!hasOpenSubtitlesApiKey
                          ? t("player.no_subtitle_provider") ||
                            "No subtitle provider configured on server"
                          : String(searchError)}
                      </Text>
                    </View>
                  )}

                  {/* No results */}
                  {searchResults &&
                    searchResults.length === 0 &&
                    !isSearching &&
                    !searchError && (
                      <View style={styles.emptyContainer}>
                        <Ionicons
                          name='document-text-outline'
                          size={scaleSize(32)}
                          color='rgba(255,255,255,0.4)'
                        />
                        <Text
                          style={[
                            styles.emptyText,
                            { fontSize: scaleSize(14) },
                          ]}
                        >
                          {t("player.no_subtitles_found") ||
                            "No subtitles found"}
                        </Text>
                      </View>
                    )}

                  {/* Results list */}
                  {searchResults &&
                    searchResults.length > 0 &&
                    !isSearching && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.resultsScroll}
                        contentContainerStyle={styles.resultsScrollContent}
                      >
                        {searchResults.map((result, index) => (
                          <SubtitleResultCard
                            key={result.id}
                            result={result}
                            hasTVPreferredFocus={index === 0}
                            isDownloading={downloadingId === result.id}
                            onPress={() => handleDownload(result)}
                          />
                        ))}
                      </ScrollView>
                    )}
                </View>

                {/* API Key hint if no fallback available */}
                {!hasOpenSubtitlesApiKey && (
                  <View style={styles.apiKeyHint}>
                    <Ionicons
                      name='information-circle-outline'
                      size={scaleSize(16)}
                      color='rgba(255,255,255,0.4)'
                    />
                    <Text
                      style={[
                        styles.apiKeyHintText,
                        { fontSize: scaleSize(12) },
                      ]}
                    >
                      {t("player.add_opensubtitles_key_hint") ||
                        "Add OpenSubtitles API key in settings for client-side fallback"}
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Settings Tab Content */}
            {activeTab === "settings" && isTabContentReady && (
              <View style={styles.section}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={styles.settingsScroll}
                  contentContainerStyle={styles.settingsScrollContent}
                >
                  {/* Subtitle Scale */}
                  <View style={styles.settingRow}>
                    <TVStepperControl
                      value={settings.mpvSubtitleScale ?? 1.0}
                      min={0.1}
                      max={3.0}
                      step={0.1}
                      formatValue={(v) => `${v.toFixed(1)}x`}
                      onChange={(newValue) => {
                        updateSettings({
                          mpvSubtitleScale: Math.round(newValue * 10) / 10,
                        });
                      }}
                      hasTVPreferredFocus={true}
                    />
                    <Text
                      style={[
                        styles.settingLabel,
                        { fontSize: typography.callout },
                      ]}
                    >
                      {t("home.settings.subtitles.mpv_subtitle_scale") ||
                        "Subtitle Scale"}
                    </Text>
                  </View>

                  {/* Vertical Margin */}
                  <View style={styles.settingRow}>
                    <TVStepperControl
                      value={settings.mpvSubtitleMarginY ?? 0}
                      min={-100}
                      max={100}
                      step={5}
                      formatValue={(v) => `${v}`}
                      onChange={(newValue) => {
                        updateSettings({ mpvSubtitleMarginY: newValue });
                      }}
                    />
                    <Text
                      style={[
                        styles.settingLabel,
                        { fontSize: typography.callout },
                      ]}
                    >
                      {t("home.settings.subtitles.mpv_subtitle_margin_y") ||
                        "Vertical Margin"}
                    </Text>
                  </View>

                  {/* Horizontal Alignment */}
                  <View style={styles.settingRow}>
                    <View style={styles.alignmentRow}>
                      {(["left", "center", "right"] as const).map((align) => (
                        <TVAlignmentCard
                          key={align}
                          label={
                            t(`home.settings.subtitles.align.${align}`) || align
                          }
                          selected={
                            (settings.mpvSubtitleAlignX ?? "center") === align
                          }
                          onPress={() =>
                            updateSettings({ mpvSubtitleAlignX: align })
                          }
                        />
                      ))}
                    </View>
                    <Text
                      style={[
                        styles.settingLabel,
                        { fontSize: typography.callout },
                      ]}
                    >
                      {t("home.settings.subtitles.mpv_subtitle_align_x") ||
                        "Horizontal Align"}
                    </Text>
                  </View>

                  {/* Vertical Alignment */}
                  <View style={styles.settingRow}>
                    <View style={styles.alignmentRow}>
                      {(["top", "center", "bottom"] as const).map((align) => (
                        <TVAlignmentCard
                          key={align}
                          label={
                            t(`home.settings.subtitles.align.${align}`) || align
                          }
                          selected={
                            (settings.mpvSubtitleAlignY ?? "bottom") === align
                          }
                          onPress={() =>
                            updateSettings({ mpvSubtitleAlignY: align })
                          }
                        />
                      ))}
                    </View>
                    <Text
                      style={[
                        styles.settingLabel,
                        { fontSize: typography.callout },
                      ]}
                    >
                      {t("home.settings.subtitles.mpv_subtitle_align_y") ||
                        "Vertical Align"}
                    </Text>
                  </View>
                </ScrollView>
              </View>
            )}
          </TVFocusGuideView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    maxHeight: "70%",
  },
  blurContainer: {
    borderTopLeftRadius: scaleSize(24),
    borderTopRightRadius: scaleSize(24),
    overflow: "hidden",
  },
  content: {
    paddingTop: scaleSize(24),
    paddingBottom: scaleSize(48),
  },
  header: {
    paddingHorizontal: scaleSize(48),
    marginBottom: scaleSize(20),
  },
  title: {
    fontWeight: "600",
    color: "#fff",
    marginBottom: scaleSize(16),
  },
  tabRow: {
    flexDirection: "row",
    gap: scaleSize(24),
  },
  section: {
    marginBottom: scaleSize(20),
  },
  sectionTitle: {
    fontWeight: "500",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: scaleSize(12),
    paddingHorizontal: scaleSize(48),
  },
  tracksScroll: {
    overflow: "visible",
  },
  tracksScrollContent: {
    paddingHorizontal: scaleSize(48),
    paddingVertical: scaleSize(8),
    gap: scaleSize(12),
  },
  trackCard: {
    width: scaleSize(180),
    height: scaleSize(80),
    borderRadius: scaleSize(14),
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: scaleSize(12),
  },
  trackCardText: {
    textAlign: "center",
  },
  trackCardSublabel: {
    marginTop: scaleSize(2),
  },
  checkmark: {
    position: "absolute",
    top: scaleSize(8),
    right: scaleSize(8),
  },
  languageScroll: {
    overflow: "visible",
  },
  languageScrollContent: {
    paddingHorizontal: scaleSize(48),
    paddingVertical: scaleSize(8),
    gap: scaleSize(10),
  },
  languageCard: {
    width: scaleSize(120),
    height: scaleSize(60),
    borderRadius: scaleSize(12),
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: scaleSize(12),
  },
  languageCardText: {
    fontWeight: "500",
  },
  languageCardCode: {
    marginTop: scaleSize(2),
  },
  resultsScroll: {
    overflow: "visible",
  },
  resultsScrollContent: {
    paddingHorizontal: scaleSize(48),
    paddingVertical: scaleSize(8),
    gap: scaleSize(12),
  },
  resultCard: {
    width: scaleSize(220),
    height: scaleSize(130),
    borderRadius: scaleSize(14),
    padding: scaleSize(14),
    borderWidth: 1,
    overflow: "hidden",
  },
  providerBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: scaleSize(8),
    paddingVertical: scaleSize(3),
    borderRadius: scaleSize(6),
    marginBottom: scaleSize(8),
  },
  providerText: {
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resultName: {
    fontWeight: "500",
    marginBottom: scaleSize(8),
    lineHeight: scaleSize(18),
  },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: scaleSize(12),
    marginBottom: scaleSize(8),
  },
  resultMetaText: {},
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: scaleSize(3),
  },
  downloadCountContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: scaleSize(3),
  },
  flagsContainer: {
    flexDirection: "row",
    gap: scaleSize(6),
    flexWrap: "wrap",
  },
  flag: {
    paddingHorizontal: scaleSize(6),
    paddingVertical: scaleSize(2),
    borderRadius: scaleSize(4),
  },
  flagText: {
    fontWeight: "600",
    color: "#fff",
  },
  downloadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: scaleSize(14),
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    paddingVertical: scaleSize(20),
    alignItems: "center",
  },
  errorContainer: {
    paddingVertical: scaleSize(40),
    paddingHorizontal: scaleSize(48),
    alignItems: "center",
  },
  errorText: {
    color: "rgba(255,100,100,0.9)",
    marginTop: scaleSize(8),
    fontWeight: "500",
  },
  errorHint: {
    color: "rgba(255,255,255,0.5)",
    marginTop: scaleSize(4),
    textAlign: "center",
  },
  emptyContainer: {
    paddingVertical: scaleSize(40),
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    marginTop: scaleSize(8),
  },
  apiKeyHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: scaleSize(8),
    paddingHorizontal: scaleSize(48),
    paddingTop: scaleSize(8),
  },
  apiKeyHintText: {},
  // Settings tab styles
  settingsScroll: {
    maxHeight: scaleSize(300),
  },
  settingsScrollContent: {
    paddingHorizontal: scaleSize(48),
    paddingVertical: scaleSize(8),
    gap: scaleSize(24),
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingLabel: {
    fontWeight: "500",
    color: "#fff",
  },
  sizeControlContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: scaleSize(16),
  },
  stepperButton: {
    width: scaleSize(56),
    height: scaleSize(56),
    borderRadius: scaleSize(14),
    justifyContent: "center",
    alignItems: "center",
  },
  sizeValueContainer: {
    width: scaleSize(80),
    alignItems: "center",
  },
  sizeValueText: {
    fontWeight: "600",
    color: "#fff",
    fontSize: scaleSize(24),
  },
  alignmentRow: {
    flexDirection: "row",
    gap: scaleSize(10),
  },
  alignmentCard: {
    paddingHorizontal: scaleSize(20),
    paddingVertical: scaleSize(14),
    borderRadius: scaleSize(12),
    minWidth: scaleSize(90),
    alignItems: "center",
  },
  alignmentCardText: {
    textTransform: "capitalize",
  },
  alignmentCheckmark: {
    position: "absolute",
    top: scaleSize(6),
    right: scaleSize(6),
  },
});
