import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { BlurView } from "expo-blur";
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
  Pressable,
  Animated as RNAnimated,
  Easing as RNEasing,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import {
  type SubtitleSearchResult,
  useRemoteSubtitles,
} from "@/hooks/useRemoteSubtitles";
import { COMMON_SUBTITLE_LANGUAGES } from "@/utils/opensubtitles/api";

interface Props {
  visible: boolean;
  item: BaseItemDto;
  mediaSourceId?: string | null;
  subtitleTracks: MediaStream[];
  currentSubtitleIndex: number;
  onSubtitleChange: (index: number) => void;
  onClose: () => void;
  /** Called when a subtitle is downloaded locally (client-side) - only during playback */
  onLocalSubtitleDownloaded?: (path: string) => void;
  /** Called when a subtitle is downloaded via Jellyfin API (server-side) */
  onServerSubtitleDownloaded?: () => void;
}

type TabType = "tracks" | "search";

// Tab button component
const TVSubtitleTab: React.FC<{
  label: string;
  isActive: boolean;
  onSelect: () => void;
  hasTVPreferredFocus?: boolean;
}> = ({ label, isActive, onSelect, hasTVPreferredFocus }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new RNAnimated.Value(1)).current;

  const animateTo = (v: number) =>
    RNAnimated.timing(scale, {
      toValue: v,
      duration: 120,
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
        onSelect();
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <RNAnimated.View
        style={[
          styles.tabButton,
          {
            transform: [{ scale }],
            backgroundColor: focused
              ? "#fff"
              : isActive
                ? "rgba(255,255,255,0.2)"
                : "transparent",
            borderBottomColor: isActive ? "#fff" : "transparent",
          },
        ]}
      >
        <Text
          style={[
            styles.tabText,
            { color: focused ? "#000" : "#fff" },
            (focused || isActive) && { fontWeight: "600" },
          ]}
        >
          {label}
        </Text>
      </RNAnimated.View>
    </Pressable>
  );
};

// Track option card
const TVTrackCard = React.forwardRef<
  View,
  {
    label: string;
    selected: boolean;
    hasTVPreferredFocus?: boolean;
    onPress: () => void;
  }
>(({ label, selected, hasTVPreferredFocus, onPress }, ref) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new RNAnimated.Value(1)).current;

  const animateTo = (v: number) =>
    RNAnimated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      ref={ref}
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
      <RNAnimated.View
        style={[
          styles.trackCard,
          {
            transform: [{ scale }],
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
            { color: focused ? "#000" : "#fff" },
            (focused || selected) && { fontWeight: "600" },
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {selected && !focused && (
          <View style={styles.checkmark}>
            <Ionicons
              name='checkmark'
              size={16}
              color='rgba(255,255,255,0.8)'
            />
          </View>
        )}
      </RNAnimated.View>
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
  const [focused, setFocused] = useState(false);
  const scale = useRef(new RNAnimated.Value(1)).current;

  const animateTo = (v: number) =>
    RNAnimated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      ref={ref}
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
      <RNAnimated.View
        style={[
          styles.languageCard,
          {
            transform: [{ scale }],
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
            { color: focused ? "#000" : "#fff" },
            (focused || selected) && { fontWeight: "600" },
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={[
            styles.languageCardCode,
            { color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" },
          ]}
        >
          {code.toUpperCase()}
        </Text>
        {selected && !focused && (
          <View style={styles.checkmark}>
            <Ionicons
              name='checkmark'
              size={16}
              color='rgba(255,255,255,0.8)'
            />
          </View>
        )}
      </RNAnimated.View>
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
  const [focused, setFocused] = useState(false);
  const scale = useRef(new RNAnimated.Value(1)).current;

  const animateTo = (v: number) =>
    RNAnimated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.03);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus}
      disabled={isDownloading}
    >
      <RNAnimated.View
        style={[
          styles.resultCard,
          {
            transform: [{ scale }],
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.08)",
            borderColor: focused
              ? "rgba(255,255,255,0.8)"
              : "rgba(255,255,255,0.1)",
          },
        ]}
      >
        {/* Provider badge */}
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
              { color: focused ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)" },
            ]}
          >
            {result.providerName}
          </Text>
        </View>

        {/* Name */}
        <Text
          style={[styles.resultName, { color: focused ? "#000" : "#fff" }]}
          numberOfLines={2}
        >
          {result.name}
        </Text>

        {/* Meta info row */}
        <View style={styles.resultMeta}>
          <Text
            style={[
              styles.resultMetaText,
              { color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" },
            ]}
          >
            {result.format?.toUpperCase()}
          </Text>

          {result.communityRating !== undefined &&
            result.communityRating > 0 && (
              <View style={styles.ratingContainer}>
                <Ionicons
                  name='star'
                  size={12}
                  color={focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)"}
                />
                <Text
                  style={[
                    styles.resultMetaText,
                    {
                      color: focused
                        ? "rgba(0,0,0,0.6)"
                        : "rgba(255,255,255,0.5)",
                    },
                  ]}
                >
                  {result.communityRating.toFixed(1)}
                </Text>
              </View>
            )}

          {result.downloadCount !== undefined && result.downloadCount > 0 && (
            <View style={styles.downloadCountContainer}>
              <Ionicons
                name='download-outline'
                size={12}
                color={focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)"}
              />
              <Text
                style={[
                  styles.resultMetaText,
                  {
                    color: focused
                      ? "rgba(0,0,0,0.6)"
                      : "rgba(255,255,255,0.5)",
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
              <Text style={styles.flagText}>Hash Match</Text>
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
                size={12}
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
              <Text style={styles.flagText}>AI</Text>
            </View>
          )}
        </View>

        {isDownloading && (
          <View style={styles.downloadingOverlay}>
            <ActivityIndicator size='small' color='#fff' />
          </View>
        )}
      </RNAnimated.View>
    </Pressable>
  );
});

export const TVSubtitleSheet: React.FC<Props> = ({
  visible,
  item,
  mediaSourceId,
  subtitleTracks,
  currentSubtitleIndex,
  onSubtitleChange,
  onClose,
  onLocalSubtitleDownloaded,
  onServerSubtitleDownloaded,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("tracks");
  const [isReady, setIsReady] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("eng");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const firstTrackCardRef = useRef<View>(null);

  const {
    hasOpenSubtitlesApiKey,
    isSearching,
    searchError,
    searchResults,
    search,
    downloadAsync,
    reset,
  } = useRemoteSubtitles({
    itemId: item.Id ?? "",
    item,
    mediaSourceId,
  });

  // Animation values
  const overlayOpacity = useRef(new RNAnimated.Value(0)).current;
  const sheetTranslateY = useRef(new RNAnimated.Value(300)).current;

  // Build subtitle options (with "None" option)
  const subtitleOptions = useMemo(() => {
    const noneOption = {
      label: t("item_card.subtitles.none"),
      value: -1,
      selected: currentSubtitleIndex === -1,
    };
    const trackOptions = subtitleTracks.map((track) => ({
      label:
        track.DisplayTitle || `${track.Language || "Unknown"} (${track.Codec})`,
      value: track.Index!,
      selected: track.Index === currentSubtitleIndex,
    }));
    return [noneOption, ...trackOptions];
  }, [subtitleTracks, currentSubtitleIndex, t]);

  // Find initial selected index for focus
  const initialSelectedIndex = useMemo(() => {
    const idx = subtitleOptions.findIndex((o) => o.selected);
    return idx >= 0 ? idx : 0;
  }, [subtitleOptions]);

  // Languages for search
  const displayLanguages = useMemo(
    () => COMMON_SUBTITLE_LANGUAGES.slice(0, 16),
    [],
  );

  // Animate in/out
  useEffect(() => {
    if (visible) {
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(300);
      setActiveTab("tracks");

      RNAnimated.parallel([
        RNAnimated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          easing: RNEasing.out(RNEasing.quad),
          useNativeDriver: true,
        }),
        RNAnimated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 300,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      reset();
    }
  }, [visible, overlayOpacity, sheetTranslateY, reset]);

  // Delay rendering to work around hasTVPreferredFocus timing issue
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timer);
    }
    setIsReady(false);
  }, [visible]);

  // Programmatic focus fallback
  useEffect(() => {
    if (isReady && firstTrackCardRef.current) {
      const timer = setTimeout(() => {
        (firstTrackCardRef.current as any)?.requestTVFocus?.();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  // Auto-search when switching to search tab
  useEffect(() => {
    if (activeTab === "search" && !searchResults && !isSearching) {
      search({ language: selectedLanguage });
    }
  }, [activeTab, searchResults, isSearching, search, selectedLanguage]);

  // Handle language selection
  const handleLanguageSelect = useCallback(
    (code: string) => {
      setSelectedLanguage(code);
      search({ language: code });
    },
    [search],
  );

  // Handle track selection
  const handleTrackSelect = useCallback(
    (index: number) => {
      onSubtitleChange(index);
      onClose();
    },
    [onSubtitleChange, onClose],
  );

  // Handle subtitle download
  const handleDownload = useCallback(
    async (result: SubtitleSearchResult) => {
      setDownloadingId(result.id);

      try {
        const downloadResult = await downloadAsync(result);

        if (downloadResult.type === "server") {
          onServerSubtitleDownloaded?.();
        } else if (downloadResult.type === "local" && downloadResult.path) {
          onLocalSubtitleDownloaded?.(downloadResult.path);
        }

        onClose();
      } catch (error) {
        console.error("Failed to download subtitle:", error);
      } finally {
        setDownloadingId(null);
      }
    },
    [
      downloadAsync,
      onServerSubtitleDownloaded,
      onLocalSubtitleDownloaded,
      onClose,
    ],
  );

  // Whether we're in player context (can use local subtitles)
  const isInPlayer = Boolean(onLocalSubtitleDownloaded);

  if (!visible) return null;

  return (
    <RNAnimated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <RNAnimated.View
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
            {/* Header with title */}
            <Text style={styles.title}>
              {t("item_card.subtitles.label").toUpperCase()}
            </Text>

            {/* Tabs */}
            <View style={styles.tabRow}>
              <TVSubtitleTab
                label={t("player.subtitle_tracks") || "Tracks"}
                isActive={activeTab === "tracks"}
                onSelect={() => setActiveTab("tracks")}
                hasTVPreferredFocus={true}
              />
              <TVSubtitleTab
                label={t("player.subtitle_search") || "Search & Download"}
                isActive={activeTab === "search"}
                onSelect={() => setActiveTab("search")}
              />
            </View>

            {/* Tab Content */}
            {activeTab === "tracks" && isReady && (
              <View style={styles.tabContent}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.scrollView}
                  contentContainerStyle={styles.scrollContent}
                >
                  {subtitleOptions.map((option, index) => (
                    <TVTrackCard
                      key={index}
                      ref={
                        index === initialSelectedIndex
                          ? firstTrackCardRef
                          : undefined
                      }
                      label={option.label}
                      selected={option.selected}
                      hasTVPreferredFocus={index === initialSelectedIndex}
                      onPress={() => handleTrackSelect(option.value)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {activeTab === "search" && (
              <View style={styles.tabContent}>
                {/* Download hint - only show on item details page */}
                {!isInPlayer && (
                  <View style={styles.downloadHint}>
                    <Ionicons
                      name='information-circle-outline'
                      size={16}
                      color='rgba(255,255,255,0.5)'
                    />
                    <Text style={styles.downloadHintText}>
                      {t("player.subtitle_download_hint") ||
                        "Downloaded subtitles will be saved to your library"}
                    </Text>
                  </View>
                )}

                {/* Language Selector */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    {t("player.language") || "Language"}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.scrollView}
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
                  <Text style={styles.sectionTitle}>
                    {t("player.results") || "Results"}
                    {searchResults && ` (${searchResults.length})`}
                  </Text>

                  {/* Loading state */}
                  {isSearching && (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size='large' color='#fff' />
                      <Text style={styles.loadingText}>
                        {t("player.searching") || "Searching..."}
                      </Text>
                    </View>
                  )}

                  {/* Error state */}
                  {searchError && !isSearching && (
                    <View style={styles.errorContainer}>
                      <Ionicons
                        name='alert-circle-outline'
                        size={32}
                        color='rgba(255,100,100,0.8)'
                      />
                      <Text style={styles.errorText}>
                        {t("player.search_failed") || "Search failed"}
                      </Text>
                      <Text style={styles.errorHint}>
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
                          size={32}
                          color='rgba(255,255,255,0.4)'
                        />
                        <Text style={styles.emptyText}>
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
                        style={styles.scrollView}
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

                {/* API Key hint */}
                {!hasOpenSubtitlesApiKey && (
                  <View style={styles.apiKeyHint}>
                    <Ionicons
                      name='information-circle-outline'
                      size={16}
                      color='rgba(255,255,255,0.4)'
                    />
                    <Text style={styles.apiKeyHintText}>
                      {t("player.add_opensubtitles_key_hint") ||
                        "Add OpenSubtitles API key in settings for client-side fallback"}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </TVFocusGuideView>
        </BlurView>
      </RNAnimated.View>
    </RNAnimated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  sheetContainer: {
    maxHeight: "75%",
  },
  blurContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  content: {
    paddingTop: 24,
    paddingBottom: 48,
    overflow: "visible",
  },
  title: {
    fontSize: 18,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 16,
    paddingHorizontal: 48,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 48,
    marginBottom: 16,
    gap: 24,
  },
  tabButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 18,
  },
  tabContent: {
    overflow: "visible",
  },
  scrollView: {
    overflow: "visible",
  },
  scrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 10,
    gap: 12,
  },
  trackCard: {
    width: 180,
    height: 80,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  trackCardText: {
    fontSize: 16,
    textAlign: "center",
  },
  checkmark: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  downloadHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 48,
    marginBottom: 16,
  },
  downloadHintText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
    paddingHorizontal: 48,
  },
  languageScrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 8,
    gap: 10,
  },
  languageCard: {
    width: 120,
    height: 60,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  languageCardText: {
    fontSize: 15,
    fontWeight: "500",
  },
  languageCardCode: {
    fontSize: 11,
    marginTop: 2,
  },
  resultsScrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 8,
    gap: 12,
  },
  resultCard: {
    width: 220,
    minHeight: 120,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  providerBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  providerText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resultName: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
    lineHeight: 18,
  },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  resultMetaText: {
    fontSize: 12,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  downloadCountContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  flagsContainer: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  flag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  flagText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
  },
  downloadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  loadingText: {
    color: "rgba(255,255,255,0.6)",
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    paddingVertical: 40,
    paddingHorizontal: 48,
    alignItems: "center",
  },
  errorText: {
    color: "rgba(255,100,100,0.9)",
    marginTop: 8,
    fontSize: 16,
    fontWeight: "500",
  },
  errorHint: {
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
    fontSize: 13,
    textAlign: "center",
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    marginTop: 8,
    fontSize: 14,
  },
  apiKeyHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 48,
    paddingTop: 8,
  },
  apiKeyHintText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
  },
});
