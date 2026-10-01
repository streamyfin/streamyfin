import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
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
import { SeerrStatusColors } from "@/constants/Colors";
import { SEERR_BLOCKED_OPACITY } from "@/constants/Seerr";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrSeasonRequest } from "@/hooks/useSeerrSeasonRequest";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { useTVRequestModal } from "@/hooks/useTVRequestModal";
import { tvSeasonSelectModalAtom } from "@/utils/atoms/tvSeasonSelectModal";
import { quotaPeriod } from "@/utils/seerr/quota";
import { type SeasonRow, seasonRowStatus } from "@/utils/seerr/seasons";
import { seerrStatusBadge } from "@/utils/seerr/statusBadge";
import type { MediaRequestBody } from "@/utils/seerr/types";
import { MediaStatus, MediaType } from "@/utils/seerr/types";
import { store } from "@/utils/store";

// A season already asked for or in the library shows where it stands, in the
// colours of the phone's season list (SeasonPicker).
const STATUS_COLORS: Partial<Record<MediaStatus, string>> = {
  [MediaStatus.PENDING]: SeerrStatusColors.pending,
  [MediaStatus.PROCESSING]: SeerrStatusColors.requested,
  [MediaStatus.PARTIALLY_AVAILABLE]: SeerrStatusColors.available,
  [MediaStatus.AVAILABLE]: SeerrStatusColors.available,
};

/** A season's card: chosen or not, or where it stands when it is settled. */
const TVSeasonToggleCard: React.FC<{
  row: SeasonRow;
  selected: boolean;
  /** Greyed once the quota is spent, except to switch a chosen one off. */
  blocked: boolean;
  onToggle: () => void;
  hasTVPreferredFocus?: boolean;
}> = ({ row, selected, blocked, onToggle, hasTVPreferredFocus }) => {
  const { t } = useTranslation();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.08 });
  const interactive = !row.locked && !blocked;
  const status = seasonRowStatus(row);
  const badge = row.locked ? seerrStatusBadge(status, false) : undefined;

  return (
    <Pressable
      onPress={interactive ? onToggle : undefined}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={!interactive}
      focusable={interactive}
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
            opacity: row.locked || blocked ? SEERR_BLOCKED_OPACITY : 1,
          },
        ]}
      >
        <View style={styles.checkmarkContainer}>
          {selected && (
            <Ionicons
              name='checkmark-circle'
              size={24}
              color={focused ? "#22c55e" : "#FFFFFF"}
            />
          )}
          {badge && (
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: STATUS_COLORS[status] ?? "#6b7280" },
              ]}
            >
              <MaterialCommunityIcons
                name={badge.icon}
                size={14}
                color='#FFFFFF'
              />
            </View>
          )}
        </View>
        <Text
          style={[
            styles.seasonTitle,
            { color: focused ? "#000000" : "#FFFFFF" },
          ]}
          numberOfLines={1}
        >
          {row.seasonNumber === 0
            ? t("seerr.specials")
            : t("seerr.season_number", { season_number: row.seasonNumber })}
        </Text>
        <Text
          style={[
            styles.episodeCount,
            { color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)" },
          ]}
        >
          {t("seerr.number_episodes", { count: row.episodeCount })}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

/**
 * The TV's sheet to request seasons, as the phone's (RequestModal): the same
 * seasons, the same quota and the same button, from the hook both share
 * (useSeerrSeasonRequest), laid out for the remote.
 */
export default function TVSeasonSelectModalPage() {
  const typography = useScaledTVTypography();
  const router = useRouter();
  const modalState = useAtomValue(tvSeasonSelectModalAtom);
  const { t } = useTranslation();
  const { requestMedia, seerrUser } = useSeerr();
  const { showRequestModal } = useTVRequestModal();

  const {
    partial,
    rows,
    unrequested,
    selected,
    toggle,
    toggleAll,
    selecting,
    canToggleAll,
    roomForOneMore,
    tvQuota,
    limited,
    overLimit,
    overQuota,
    remaining,
    approvedAutomatically,
    seasons,
    label,
    blocked,
  } = useSeerrSeasonRequest({
    details: modalState?.series,
    enabled: !!modalState,
    quotaUserId: seerrUser?.id,
  });

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

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

  const close = useCallback(() => {
    store.set(tvSeasonSelectModalAtom, null);
    router.back();
  }, [router]);

  useTVBackPress(() => {
    close();
    return true;
  }, [close]);

  const request = useCallback(() => {
    if (!modalState || blocked) return;
    const body: MediaRequestBody = {
      mediaId: modalState.mediaId,
      mediaType: MediaType.TV,
      tvdbId: modalState.tvdbId,
      seasons,
    };

    if (modalState.hasAdvancedRequestPermission) {
      // The advanced sheet takes this one's place rather than stacking on it.
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

    requestMedia(modalState.title, body, () => {
      modalState.onRequested();
      router.back();
    });
  }, [modalState, blocked, seasons, requestMedia, router, showRequestModal]);

  if (!modalState) return null;

  const firstChoosable = rows.findIndex((row) => !row.locked);
  const period = quotaPeriod(tvQuota?.days);
  const spent = remaining <= 0 || tvQuota?.restricted || overLimit || overQuota;

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
              {t("seerr.request_series")}
            </Text>
            <Text style={[styles.subtitle, { fontSize: typography.callout }]}>
              {modalState.title}
            </Text>

            {approvedAutomatically && (
              <Text style={[styles.note, { fontSize: typography.callout }]}>
                {t("seerr.request_approved_automatically")}
              </Text>
            )}
            {limited && (
              <Text
                style={[
                  styles.note,
                  {
                    fontSize: typography.callout,
                    color: spent ? SeerrStatusColors.pending : "#FFFFFF",
                  },
                ]}
              >
                {overLimit || overQuota
                  ? t("seerr.quota.not_enough_season_requests")
                  : remaining <= 0
                    ? t("seerr.quota.no_season_requests_remaining")
                    : t("seerr.quota.season_requests_remaining", {
                        count: remaining,
                      })}
                {tvQuota?.limit !== undefined &&
                  period &&
                  `  ·  ${
                    period === "total"
                      ? t("seerr.quota.season_limit_total", {
                          count: tvQuota.limit,
                        })
                      : period === "daily"
                        ? t("seerr.quota.season_limit_daily", {
                            count: tvQuota.limit,
                          })
                        : t("seerr.quota.season_limit", {
                            count: tvQuota.limit,
                            days: tvQuota.days,
                          })
                  }`}
              </Text>
            )}
            {!partial && (
              <Text style={[styles.note, { fontSize: typography.callout }]}>
                {t("seerr.whole_series_only")}
              </Text>
            )}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
            >
              {rows.map((row, index) => {
                const chosen = partial
                  ? selected.includes(row.seasonNumber)
                  : unrequested.includes(row.seasonNumber);
                return (
                  <TVSeasonToggleCard
                    // Keyed by number: a server can send one id for every season.
                    key={row.seasonNumber}
                    row={row}
                    selected={chosen}
                    blocked={!partial || (!chosen && !roomForOneMore)}
                    onToggle={() => toggle(row.seasonNumber)}
                    hasTVPreferredFocus={index === firstChoosable}
                  />
                );
              })}
            </ScrollView>

            <View style={styles.buttonContainer}>
              {partial && unrequested.length > 0 && (
                <TVButton
                  onPress={toggleAll}
                  variant='secondary'
                  disabled={!canToggleAll}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { fontSize: typography.callout },
                    ]}
                  >
                    {selecting
                      ? t("seerr.select_all")
                      : t("seerr.clear_selection")}
                  </Text>
                </TVButton>
              )}
              <TVButton
                onPress={request}
                variant='secondary'
                disabled={blocked}
              >
                <Text
                  style={[styles.buttonText, { fontSize: typography.callout }]}
                >
                  {label}
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
    marginBottom: 16,
  },
  note: {
    color: "rgba(255,255,255,0.8)",
    marginBottom: 8,
  },
  scrollView: {
    overflow: "visible",
  },
  scrollContent: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 16,
  },
  // No flex: 1 inside: in a card that sizes itself, it hid the season's name.
  seasonCard: {
    width: 180,
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
    flexDirection: "row",
    justifyContent: "space-between",
  },
  seasonTitle: {
    fontWeight: "600",
    marginBottom: 4,
  },
  episodeCount: {
    fontSize: 14,
  },
  statusBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 16,
    marginTop: 24,
  },
  buttonText: {
    fontWeight: "bold",
    color: "#FFFFFF",
  },
});
