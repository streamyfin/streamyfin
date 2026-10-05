import { Ionicons } from "@expo/vector-icons";
import { useAtomValue } from "jotai";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { TVButton } from "@/components/tv/TVButton";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useWatchlistsQuery } from "@/hooks/useWatchlists";
import { userAtom } from "@/providers/JellyfinProvider";
import { scaleSize } from "@/utils/scaleSize";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";

const TOP_PADDING = scaleSize(100);
const HORIZONTAL_PADDING = scaleSize(60);
const CARD_WIDTH = scaleSize(520);
const CARD_HEIGHT = scaleSize(180);
// Wide enough that a card scaled up on focus never touches its neighbour.
const CARD_GAP = scaleSize(32);
const SECTION_GAP = scaleSize(48);
const META_ICON_SIZE = scaleSize(22);

interface TVWatchlistCardProps {
  watchlist: StreamystatsWatchlist;
  isOwner: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

const TVWatchlistCard: React.FC<TVWatchlistCardProps> = ({
  watchlist,
  isOwner,
  onPress,
  hasTVPreferredFocus = false,
}) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation();

  const primary = focused ? "#000" : "#fff";
  const secondary = focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
  const itemCount = watchlist.itemCount ?? 0;

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            borderRadius: scaleSize(16),
            padding: scaleSize(24),
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.08)",
            justifyContent: "space-between",
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.3 : 0,
            shadowRadius: focused ? scaleSize(12) : 0,
          },
        ]}
      >
        <View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: scaleSize(12),
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: typography.callout,
                fontWeight: "600",
                color: primary,
              }}
            >
              {watchlist.name}
            </Text>
            <Ionicons
              name={
                watchlist.isPublic ? "globe-outline" : "lock-closed-outline"
              }
              size={META_ICON_SIZE}
              color={secondary}
            />
          </View>
          {watchlist.description ? (
            <Text
              numberOfLines={2}
              style={{
                fontSize: typography.callout,
                color: secondary,
                marginTop: scaleSize(6),
              }}
            >
              {watchlist.description}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: scaleSize(16),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: scaleSize(6),
            }}
          >
            <Ionicons
              name='film-outline'
              size={META_ICON_SIZE}
              color={secondary}
            />
            <Text style={{ fontSize: typography.callout, color: secondary }}>
              {itemCount}{" "}
              {itemCount === 1 ? t("watchlists.item") : t("watchlists.items")}
            </Text>
          </View>
          {watchlist.allowedItemType ? (
            <Text style={{ fontSize: typography.callout, color: secondary }}>
              {watchlist.allowedItemType}
            </Text>
          ) : null}
          {isOwner ? (
            <View
              style={{
                paddingHorizontal: scaleSize(10),
                paddingVertical: scaleSize(2),
                borderRadius: scaleSize(8),
                backgroundColor: focused
                  ? "rgba(0,0,0,0.1)"
                  : "rgba(255,255,255,0.15)",
              }}
            >
              <Text style={{ fontSize: typography.callout, color: primary }}>
                {t("watchlists.you")}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
};

interface TVStreamystatsWatchlistsProps {
  /**
   * Overrides the default top inset; the watchlists tab passes 0 when its
   * source toggle already sits above this list.
   */
  contentTopPadding?: number;
  /**
   * When true the first card takes initial focus. False when something above
   * (the source toggle) owns it: two preferred-focus targets make TV focus
   * flicker.
   */
  isFirstSection?: boolean;
}

/**
 * TV layout of the Streamystats watchlists: "mine" and "public" sections of
 * focusable cards in a wrapping grid, opening the same detail route as mobile.
 */
export const TVStreamystatsWatchlists: React.FC<
  TVStreamystatsWatchlistsProps
> = ({ contentTopPadding, isFirstSection = true }) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAtomValue(userAtom);
  const {
    data: watchlists,
    isLoading,
    isError,
    refetch,
  } = useWatchlistsQuery();

  const sections = useMemo(() => {
    const mine: StreamystatsWatchlist[] = [];
    const pub: StreamystatsWatchlist[] = [];
    for (const w of watchlists ?? []) {
      if (w.userId === user?.Id) mine.push(w);
      else pub.push(w);
    }
    return [
      { key: "mine", title: t("watchlists.my_watchlists"), items: mine },
      { key: "public", title: t("watchlists.public_watchlists"), items: pub },
    ].filter((section) => section.items.length > 0);
  }, [watchlists, user?.Id, t]);

  const topPadding = contentTopPadding ?? insets.top + TOP_PADDING;

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Loader />
      </View>
    );
  }

  // Checked before the empty state: a failed load is not an empty list.
  if (isError && !watchlists?.length) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingTop: topPadding,
          paddingHorizontal: HORIZONTAL_PADDING,
        }}
      >
        <Ionicons
          name='cloud-offline-outline'
          size={scaleSize(64)}
          color='#4b5563'
        />
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "600",
            color: "#fff",
            marginTop: scaleSize(16),
            textAlign: "center",
          }}
        >
          {t("common.something_went_wrong")}
        </Text>
        <Text
          style={{
            fontSize: typography.callout,
            color: "rgba(255,255,255,0.6)",
            marginTop: scaleSize(8),
            marginBottom: scaleSize(32),
            textAlign: "center",
          }}
        >
          {t("common.load_failed_message")}
        </Text>
        {/* With no cards there is nothing else to focus, unless the source
            toggle above already owns the initial focus. Never disabled while
            retrying: a disabled button drops the focus, and a second press
            only restarts the request. */}
        <TVButton
          onPress={() => refetch()}
          hasTVPreferredFocus={isFirstSection}
        >
          <Text
            style={{
              fontSize: typography.callout,
              fontWeight: "bold",
              color: "#000000",
            }}
          >
            {t("home.retry")}
          </Text>
        </TVButton>
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingTop: topPadding,
          paddingHorizontal: HORIZONTAL_PADDING,
        }}
      >
        <Ionicons name='list-outline' size={scaleSize(64)} color='#4b5563' />
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "600",
            color: "#fff",
            marginTop: scaleSize(16),
            textAlign: "center",
          }}
        >
          {t("watchlists.empty_title")}
        </Text>
        <Text
          style={{
            fontSize: typography.callout,
            color: "rgba(255,255,255,0.6)",
            marginTop: scaleSize(8),
            textAlign: "center",
          }}
        >
          {t("watchlists.empty_description")}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, overflow: "visible" }}
      contentContainerStyle={{
        paddingTop: topPadding,
        paddingBottom: insets.bottom + scaleSize(60),
        paddingHorizontal: insets.left + HORIZONTAL_PADDING,
        gap: SECTION_GAP,
      }}
    >
      {sections.map((section, sectionIndex) => (
        <View key={section.key} style={{ overflow: "visible" }}>
          <Text
            style={{
              fontSize: typography.heading,
              fontWeight: "700",
              color: "#fff",
              marginBottom: scaleSize(20),
            }}
          >
            {section.title}
          </Text>
          {/* Left aligned, not centred: the cards sit under their section
              header and the source toggle, which are both left aligned. */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: CARD_GAP,
              overflow: "visible",
            }}
          >
            {section.items.map((watchlist, index) => (
              <TVWatchlistCard
                key={watchlist.id}
                watchlist={watchlist}
                isOwner={section.key === "mine"}
                hasTVPreferredFocus={
                  isFirstSection && sectionIndex === 0 && index === 0
                }
                onPress={() =>
                  router.push(`/(auth)/(tabs)/(watchlists)/${watchlist.id}`)
                }
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
};
