import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
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
  onClose: () => void;
  /** Called when a subtitle is downloaded via Jellyfin API (server-side) */
  onServerSubtitleDownloaded: () => void;
  /** Called when a subtitle is downloaded locally (client-side) */
  onLocalSubtitleDownloaded: (path: string) => void;
}

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
      </RNAnimated.View>
    </Pressable>
  );
});

export const TVSubtitleSearch: React.FC<Props> = ({
  visible,
  item,
  mediaSourceId,
  onClose,
  onServerSubtitleDownloaded,
  onLocalSubtitleDownloaded,
}) => {
  const { t } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState("eng");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const firstResultRef = useRef<View>(null);

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

  // Animate in/out
  useEffect(() => {
    if (visible) {
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(300);

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

      // Auto-search with default language
      search({ language: selectedLanguage });
    } else {
      reset();
    }
  }, [visible]);

  // Handle language selection
  const handleLanguageSelect = useCallback(
    (code: string) => {
      setSelectedLanguage(code);
      search({ language: code });
    },
    [search],
  );

  // Handle subtitle download
  const handleDownload = useCallback(
    async (result: SubtitleSearchResult) => {
      setDownloadingId(result.id);

      try {
        const downloadResult = await downloadAsync(result);

        if (downloadResult.type === "server") {
          // Server-side download - track list should be refreshed
          onServerSubtitleDownloaded();
        } else if (downloadResult.type === "local" && downloadResult.path) {
          // Client-side download - load into MPV
          onLocalSubtitleDownloaded(downloadResult.path);
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

  // Subset of common languages for TV (horizontal scroll works best with fewer items)
  const displayLanguages = useMemo(
    () => COMMON_SUBTITLE_LANGUAGES.slice(0, 16),
    [],
  );

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
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>
                {t("player.search_subtitles") || "Search Subtitles"}
              </Text>
              {!hasOpenSubtitlesApiKey && (
                <Text style={styles.sourceHint}>
                  {t("player.using_jellyfin_server") || "Using Jellyfin Server"}
                </Text>
              )}
            </View>

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
                      {t("player.no_subtitles_found") || "No subtitles found"}
                    </Text>
                  </View>
                )}

              {/* Results list */}
              {searchResults && searchResults.length > 0 && !isSearching && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.resultsScroll}
                  contentContainerStyle={styles.resultsScrollContent}
                >
                  {searchResults.map((result, index) => (
                    <SubtitleResultCard
                      key={result.id}
                      ref={index === 0 ? firstResultRef : undefined}
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
  },
  sourceHint: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
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
  checkmark: {
    position: "absolute",
    top: 6,
    right: 6,
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
