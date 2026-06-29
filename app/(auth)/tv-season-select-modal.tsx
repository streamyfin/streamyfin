import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import { orderBy } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVButton } from "@/components/tv";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useTVRequestModal } from "@/hooks/useTVRequestModal";
import { tvSeasonSelectModalAtom } from "@/utils/atoms/tvSeasonSelectModal";
import {
  MediaStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import { scaleSize } from "@/utils/scaleSize";
import { store } from "@/utils/store";

interface TVSeasonToggleCardProps {
  season: {
    id: number;
    seasonNumber: number;
    episodeCount: number;
    status: MediaStatus;
  };
  selected: boolean;
  onToggle: () => void;
  canRequest: boolean;
  hasTVPreferredFocus?: boolean;
}

const TVSeasonToggleCard: React.FC<TVSeasonToggleCardProps> = ({
  season,
  selected,
  onToggle,
  canRequest,
  hasTVPreferredFocus,
}) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.08 });

  // Get status icon and color based on MediaStatus
  const getStatusIcon = (): {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
  } | null => {
    switch (season.status) {
      case MediaStatus.PROCESSING:
        return { icon: "clock", color: "#6366f1" };
      case MediaStatus.AVAILABLE:
        return { icon: "check", color: "#22c55e" };
      case MediaStatus.PENDING:
        return { icon: "bell", color: "#eab308" };
      case MediaStatus.PARTIALLY_AVAILABLE:
        return { icon: "minus", color: "#22c55e" };
      case MediaStatus.BLACKLISTED:
        return { icon: "eye-off", color: "#ef4444" };
      default:
        return canRequest ? { icon: "plus", color: "#22c55e" } : null;
    }
  };

  const statusInfo = getStatusIcon();
  const isDisabled = !canRequest;

  return (
    <Pressable
      onPress={canRequest ? onToggle : undefined}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={isDisabled}
      focusable={!isDisabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          animatedStyle,
          styles.seasonCard,
          {
            backgroundColor: focused
              ? "#FFFFFF"
              : selected
                ? "rgba(255,255,255,0.2)"
                : "rgba(255,255,255,0.08)",
            borderWidth: focused ? 0 : 1,
            borderColor: selected
              ? "rgba(255,255,255,0.4)"
              : "rgba(255,255,255,0.1)",
            opacity: isDisabled ? 0.5 : 1,
          },
        ]}
      >
        {/* Checkmark for selected */}
        <View style={styles.checkmarkContainer}>
          {selected && (
            <Ionicons
              name='checkmark-circle'
              size={24}
              color={focused ? "#22c55e" : "#FFFFFF"}
            />
          )}
        </View>

        {/* Season info */}
        <View style={styles.seasonInfo}>
          <Text
            style={[
              styles.seasonTitle,
              {
                fontSize: typography.body,
                color: focused ? "#000000" : "#FFFFFF",
              },
            ]}
            numberOfLines={1}
          >
            {t("jellyseerr.season_number", {
              season_number: season.seasonNumber,
            })}
          </Text>
          <View style={styles.episodeRow}>
            <Text
              style={[
                styles.episodeCount,
                {
                  fontSize: typography.callout,
                  color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)",
                },
              ]}
            >
              {t("jellyseerr.number_episodes", {
                episode_number: season.episodeCount,
              })}
            </Text>
            {statusInfo && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusInfo.color },
                ]}
              >
                <MaterialCommunityIcons
                  name={statusInfo.icon}
                  size={14}
                  color='#FFFFFF'
                />
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

export default function TVSeasonSelectModalPage() {
  const typography = useScaledTVTypography();
  const router = useRouter();
  const modalState = useAtomValue(tvSeasonSelectModalAtom);
  const { t } = useTranslation();
  const { requestMedia } = useJellyseerr();
  const { showRequestModal } = useTVRequestModal();

  // Selected seasons - initially select all requestable (UNKNOWN status) seasons
  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(
    new Set(),
  );

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

  // Initialize selected seasons when modal state changes
  useEffect(() => {
    if (modalState?.seasons) {
      const requestableSeasons = modalState.seasons
        .filter((s) => s.status === MediaStatus.UNKNOWN && s.seasonNumber !== 0)
        .map((s) => s.seasonNumber);
      setSelectedSeasons(new Set(requestableSeasons));
    }
  }, [modalState?.seasons]);

  // Animate in on mount
  useEffect(() => {
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(200);

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

    return () => {
      store.set(tvSeasonSelectModalAtom, null);
    };
  }, [overlayOpacity, sheetTranslateY]);

  // Sort seasons by season number (ascending)
  const sortedSeasons = useMemo(() => {
    if (!modalState?.seasons) return [];
    return orderBy(
      modalState.seasons.filter((s) => s.seasonNumber !== 0),
      "seasonNumber",
      "asc",
    );
  }, [modalState?.seasons]);

  // Find the index of the first requestable season for initial focus
  const firstRequestableIndex = useMemo(() => {
    return sortedSeasons.findIndex((s) => s.status === MediaStatus.UNKNOWN);
  }, [sortedSeasons]);

  const handleToggleSeason = useCallback((seasonNumber: number) => {
    setSelectedSeasons((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(seasonNumber)) {
        newSet.delete(seasonNumber);
      } else {
        newSet.add(seasonNumber);
      }
      return newSet;
    });
  }, []);

  const handleRequestSelected = useCallback(() => {
    if (!modalState || selectedSeasons.size === 0) return;

    const seasonsArray = Array.from(selectedSeasons);
    const body: MediaRequestBody = {
      mediaId: modalState.mediaId,
      mediaType: MediaType.TV,
      tvdbId: modalState.tvdbId,
      seasons: seasonsArray,
    };

    if (modalState.hasAdvancedRequestPermission) {
      // Close this modal and open the advanced request modal
      router.back();
      showRequestModal({
        requestBody: body,
        title: modalState.title,
        id: modalState.mediaId,
        mediaType: MediaType.TV,
        onRequested: modalState.onRequested,
      });
      return;
    }

    // Build the title based on selected seasons
    const seasonTitle =
      seasonsArray.length === 1
        ? t("jellyseerr.season_number", { season_number: seasonsArray[0] })
        : seasonsArray.length === sortedSeasons.length
          ? t("jellyseerr.season_all")
          : t("jellyseerr.n_selected", { count: seasonsArray.length });

    requestMedia(`${modalState.title}, ${seasonTitle}`, body, () => {
      modalState.onRequested();
      router.back();
    });
  }, [
    modalState,
    selectedSeasons,
    sortedSeasons.length,
    requestMedia,
    router,
    t,
    showRequestModal,
  ]);

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
        <BlurView intensity={80} tint='dark' style={styles.blurContainer}>
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.content}
          >
            <Text style={[styles.heading, { fontSize: typography.heading }]}>
              {t("jellyseerr.select_seasons")}
            </Text>
            <Text style={[styles.subtitle, { fontSize: typography.callout }]}>
              {modalState.title}
            </Text>

            {/* Season cards horizontal scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
            >
              {sortedSeasons.map((season, index) => {
                const canRequestSeason = season.status === MediaStatus.UNKNOWN;
                return (
                  <TVSeasonToggleCard
                    key={season.id}
                    season={season}
                    selected={selectedSeasons.has(season.seasonNumber)}
                    onToggle={() => handleToggleSeason(season.seasonNumber)}
                    canRequest={canRequestSeason}
                    hasTVPreferredFocus={index === firstRequestableIndex}
                  />
                );
              })}
            </ScrollView>

            {/* Request button */}
            <View style={styles.buttonContainer}>
              <TVButton
                onPress={handleRequestSelected}
                variant='secondary'
                disabled={selectedSeasons.size === 0}
              >
                <Ionicons
                  name='add'
                  size={22}
                  color='#FFFFFF'
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={[styles.buttonText, { fontSize: typography.callout }]}
                >
                  {t("jellyseerr.request_selected")}
                  {selectedSeasons.size > 0 && ` (${selectedSeasons.size})`}
                </Text>
              </TVButton>
            </View>
          </TVFocusGuideView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    width: "100%",
  },
  blurContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  content: {
    paddingTop: 24,
    paddingBottom: 50,
    paddingHorizontal: 44,
    overflow: "visible",
  },
  heading: {
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subtitle: {
    color: "rgba(255,255,255,0.6)",
    marginBottom: 24,
  },
  scrollView: {
    overflow: "visible",
  },
  scrollContent: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 16,
  },
  seasonCard: {
    width: scaleSize(220),
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  checkmarkContainer: {
    height: 24,
    marginBottom: 8,
  },
  seasonInfo: {
    flex: 1,
  },
  seasonTitle: {
    fontWeight: "600",
    marginBottom: 4,
  },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  episodeCount: {},
  statusBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonContainer: {
    marginTop: 24,
  },
  buttonText: {
    fontWeight: "bold",
    color: "#FFFFFF",
  },
});
