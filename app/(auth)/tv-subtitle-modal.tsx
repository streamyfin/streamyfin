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
  Pressable,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVTabButton, useTVFocusAnimation } from "@/components/tv";
import useRouter from "@/hooks/useAppRouter";
import {
  type SubtitleSearchResult,
  useRemoteSubtitles,
} from "@/hooks/useRemoteSubtitles";
import { tvSubtitleModalAtom } from "@/utils/atoms/tvSubtitleModal";
import { COMMON_SUBTITLE_LANGUAGES } from "@/utils/opensubtitles/api";
import { store } from "@/utils/store";

type TabType = "tracks" | "download";

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
            { color: focused ? "#000" : "#fff" },
            (focused || selected) && { fontWeight: "600" },
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {sublabel && (
          <Text
            style={[
              styles.trackCardSublabel,
              { color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" },
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
              size={16}
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
          {/* Format */}
          <Text
            style={[
              styles.resultMetaText,
              { color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" },
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

          {/* Download count if available */}
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

export default function TVSubtitleModal() {
  const router = useRouter();
  const { t } = useTranslation();
  const modalState = useAtomValue(tvSubtitleModalAtom);

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
      (t) => t.Index === currentSubtitleIndex,
    );
    return trackIdx >= 0 ? trackIdx + 1 : 0;
  }, [subtitleTracks, currentSubtitleIndex]);

  // Animate in on mount
  useEffect(() => {
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
    return () => clearTimeout(timer);
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

  const handleLanguageSelect = useCallback(
    (code: string) => {
      setSelectedLanguage(code);
      search({ language: code });
    },
    [search],
  );

  const handleTrackSelect = useCallback(
    (index: number) => {
      modalState?.onSubtitleIndexChange(index);
      handleClose();
    },
    [modalState, handleClose],
  );

  const handleDownload = useCallback(
    async (result: SubtitleSearchResult) => {
      setDownloadingId(result.id);

      try {
        const downloadResult = await downloadAsync(result);

        if (downloadResult.type === "server") {
          modalState?.onServerSubtitleDownloaded?.();
        } else if (downloadResult.type === "local" && downloadResult.path) {
          modalState?.onLocalSubtitleDownloaded?.(downloadResult.path);
        }

        handleClose();
      } catch (error) {
        console.error("Failed to download subtitle:", error);
      } finally {
        setDownloadingId(null);
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
    };
    const options = subtitleTracks.map((track) => ({
      label:
        track.DisplayTitle || `${track.Language || "Unknown"} (${track.Codec})`,
      sublabel: track.Codec?.toUpperCase(),
      value: track.Index!,
      selected: track.Index === currentSubtitleIndex,
    }));
    return [noneOption, ...options];
  }, [subtitleTracks, currentSubtitleIndex, t]);

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
                      <ActivityIndicator size='small' color='#fff' />
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
  trackCardSublabel: {
    fontSize: 12,
    marginTop: 2,
  },
  checkmark: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  languageScroll: {
    overflow: "visible",
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
  resultsScroll: {
    overflow: "visible",
  },
  resultsScrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 8,
    gap: 12,
  },
  resultCard: {
    width: 220,
    height: 130,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    overflow: "hidden",
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
    paddingVertical: 20,
    alignItems: "center",
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
