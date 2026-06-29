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
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import {
  TVCancelButton,
  TVLanguageCard,
  TVSubtitleResultCard,
  TVTabButton,
  TVTrackCard,
} from "@/components/tv";
import {
  type SubtitleSearchResult,
  useRemoteSubtitles,
} from "@/hooks/useRemoteSubtitles";
import { compareTracksForMenu } from "@/utils/jellyfin/subtitleUtils";
import { COMMON_SUBTITLE_LANGUAGES } from "@/utils/opensubtitles/api";

interface TVSubtitleSheetProps {
  visible: boolean;
  item: BaseItemDto;
  mediaSourceId?: string | null;
  subtitleTracks: MediaStream[];
  currentSubtitleIndex: number;
  onSubtitleIndexChange: (index: number) => void;
  onClose: () => void;
  onServerSubtitleDownloaded?: () => void;
  onLocalSubtitleDownloaded?: (path: string) => void;
}

type TabType = "tracks" | "download";

export const TVSubtitleSheet: React.FC<TVSubtitleSheetProps> = ({
  visible,
  item,
  mediaSourceId,
  subtitleTracks,
  currentSubtitleIndex,
  onSubtitleIndexChange,
  onClose,
  onServerSubtitleDownloaded,
  onLocalSubtitleDownloaded,
}) => {
  const { t } = useTranslation();

  console.log(
    "[TVSubtitleSheet] visible:",
    visible,
    "tracks:",
    subtitleTracks.length,
  );
  const [activeTab, setActiveTab] = useState<TabType>("tracks");
  const [selectedLanguage, setSelectedLanguage] = useState("eng");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [hasSearchedThisSession, setHasSearchedThisSession] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isTabContentReady, setIsTabContentReady] = useState(false);
  const firstTrackRef = useRef<View>(null);

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

  const resetRef = useRef(reset);
  resetRef.current = reset;

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(300)).current;

  // Order like jellyfin-web (embedded first, externals last, forced/default up).
  const sortedTracks = useMemo(
    () => [...subtitleTracks].sort(compareTracksForMenu),
    [subtitleTracks],
  );

  const initialSelectedTrackIndex = useMemo(() => {
    if (currentSubtitleIndex === -1) return 0;
    const trackIdx = sortedTracks.findIndex(
      (t) => t.Index === currentSubtitleIndex,
    );
    return trackIdx >= 0 ? trackIdx + 1 : 0;
  }, [sortedTracks, currentSubtitleIndex]);

  useEffect(() => {
    if (visible) {
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
    }
  }, [visible, overlayOpacity, sheetTranslateY]);

  useEffect(() => {
    if (!visible) {
      setHasSearchedThisSession(false);
      setActiveTab("tracks");
      resetRef.current();
      setIsReady(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timer);
    }
    setIsReady(false);
  }, [visible]);

  useEffect(() => {
    if (visible && activeTab === "download" && !hasSearchedThisSession) {
      search({ language: selectedLanguage });
      setHasSearchedThisSession(true);
    }
  }, [visible, activeTab, hasSearchedThisSession, search, selectedLanguage]);

  useEffect(() => {
    if (isReady) {
      setIsTabContentReady(false);
      const timer = setTimeout(() => setIsTabContentReady(true), 50);
      return () => clearTimeout(timer);
    }
    setIsTabContentReady(false);
  }, [activeTab, isReady]);

  const handleLanguageSelect = useCallback(
    (code: string) => {
      setSelectedLanguage(code);
      search({ language: code });
    },
    [search],
  );

  const handleTrackSelect = useCallback(
    (index: number) => {
      onSubtitleIndexChange(index);
      onClose();
    },
    [onSubtitleIndexChange, onClose],
  );

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
    };
    const options = sortedTracks.map((track) => ({
      label:
        track.DisplayTitle || `${track.Language || "Unknown"} (${track.Codec})`,
      sublabel: track.Codec?.toUpperCase(),
      value: track.Index!,
      selected: track.Index === currentSubtitleIndex,
    }));
    return [noneOption, ...options];
  }, [sortedTracks, currentSubtitleIndex, t]);

  if (!visible) return null;

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
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.content}
          >
            {/* Header with tabs */}
            <View style={styles.header}>
              <Text style={styles.title}>
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
                      onPress={() => handleTrackSelect(option.value)}
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
                  <Text style={styles.sectionTitle}>
                    {t("player.language") || "Language"}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.languageScroll}
                    contentContainerStyle={styles.languageScrollContent}
                  >
                    {displayLanguages.map((lang, index) => (
                      <TVLanguageCard
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
                        style={styles.resultsScroll}
                        contentContainerStyle={styles.resultsScrollContent}
                      >
                        {searchResults.map((result, index) => (
                          <TVSubtitleResultCard
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
                      size={16}
                      color='rgba(255,255,255,0.4)'
                    />
                    <Text style={styles.apiKeyHintText}>
                      {t("player.add_opensubtitles_key_hint") ||
                        "Add OpenSubtitles API key in settings for client-side fallback"}
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Cancel button */}
            {isReady && (
              <View style={styles.cancelButtonContainer}>
                <TVCancelButton
                  onPress={onClose}
                  label={t("common.cancel") || "Cancel"}
                />
              </View>
            )}
          </TVFocusGuideView>
        </BlurView>
      </Animated.View>
    </Animated.View>
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
    maxHeight: "70%",
  },
  blurContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  content: {
    paddingTop: 24,
    paddingBottom: 48,
  },
  header: {
    paddingHorizontal: 48,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 16,
  },
  tabRow: {
    flexDirection: "row",
    gap: 24,
  },
  section: {
    marginBottom: 20,
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
  tracksScroll: {
    overflow: "visible",
  },
  tracksScrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 8,
    gap: 12,
  },
  languageScroll: {
    overflow: "visible",
  },
  languageScrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 8,
    gap: 10,
  },
  resultsScroll: {
    overflow: "visible",
  },
  resultsScrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 8,
    gap: 12,
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
  cancelButtonContainer: {
    paddingHorizontal: 48,
    paddingTop: 20,
    alignItems: "flex-start",
  },
});
