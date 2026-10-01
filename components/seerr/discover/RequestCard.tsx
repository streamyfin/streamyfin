import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
} from "react-native-reanimated";
import { TouchableSeerrRouter } from "@/components/common/SeerrItemRouter";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { SeerrBadgeColors, SeerrCardColors } from "@/constants/Colors";
import {
  SEERR_PILL_FADE_WIDTH,
  SEERR_PILL_PAN_SLOP,
  SEERR_REQUEST_CARD_POSTER,
  SEERR_REQUEST_CARD_WIDTH,
} from "@/constants/Seerr";
import { useSeerrRequestCard } from "@/hooks/useSeerrRequestCard";
import { overflowEdges, slideLimit } from "@/utils/seerr/requestCard";
import { type MediaRequest } from "@/utils/seerr/types";

/** The "Seasons" and "Status" labels, one style so they read alike. */
const LABEL_STYLE = {
  fontSize: 14,
  fontWeight: "bold",
  color: SeerrCardColors.label,
} as const;

/** One of Seerr's pill badges, with a download's progress behind its text. */
const Pill: React.FC<{
  tone: keyof typeof SeerrBadgeColors;
  text: string;
  progress?: number;
}> = ({ tone, text, progress }) => {
  const colors = SeerrBadgeColors[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        overflow: "hidden",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor:
          progress === undefined ? colors.background : SeerrCardColors.surface,
        paddingHorizontal: 8,
      }}
    >
      {progress !== undefined && (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress}%`,
            backgroundColor: colors.background,
          }}
        />
      )}
      <Text
        style={{
          fontSize: 12,
          lineHeight: 20,
          fontWeight: "600",
          color: colors.text,
        }}
      >
        {progress === undefined ? text : `${text} ${progress}%`}
      </Text>
    </View>
  );
};

/** The seasons asked for, sliding sideways, a fade where more is hidden. */
const SeasonPills: React.FC<{ labels: string[] }> = ({ labels }) => {
  const width = useSharedValue(0);
  const contentWidth = useSharedValue(0);
  const x = useSharedValue(0);
  const origin = useSharedValue(0);

  // A pan of its own rather than a scroll view: inside a row of cards that
  // scrolls the same way, a nested scroll view lost the swipe to the row, and
  // on Android nothing scrolled at all and the card opened its title. The
  // pan takes over after a few points sideways, before the row would.
  const pan = Gesture.Pan()
    .activeOffsetX([-SEERR_PILL_PAN_SLOP, SEERR_PILL_PAN_SLOP])
    .failOffsetY([-2 * SEERR_PILL_PAN_SLOP, 2 * SEERR_PILL_PAN_SLOP])
    .onBegin(() => {
      cancelAnimation(x);
      origin.value = x.value;
    })
    .onUpdate((event) => {
      const limit = slideLimit({
        width: width.value,
        contentWidth: contentWidth.value,
      });
      x.value = Math.min(0, Math.max(limit, origin.value + event.translationX));
    })
    .onEnd((event) => {
      const limit = slideLimit({
        width: width.value,
        contentWidth: contentWidth.value,
      });
      x.value = withDecay({ velocity: event.velocityX, clamp: [limit, 0] });
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const edges = () => {
    "worklet";
    return overflowEdges({
      offset: -x.value,
      width: width.value,
      contentWidth: contentWidth.value,
    });
  };
  const startFadeStyle = useAnimatedStyle(() => ({
    opacity: edges().start ? 1 : 0,
  }));
  const endFadeStyle = useAnimatedStyle(() => ({
    opacity: edges().end ? 1 : 0,
  }));

  const fade = (side: "start" | "end") => (
    <Animated.View
      pointerEvents='none'
      style={[
        {
          position: "absolute",
          top: 0,
          bottom: 0,
          width: SEERR_PILL_FADE_WIDTH,
          [side === "start" ? "left" : "right"]: 0,
        },
        side === "start" ? startFadeStyle : endFadeStyle,
      ]}
    >
      <LinearGradient
        colors={
          side === "start"
            ? [SeerrCardColors.fadeTo, SeerrCardColors.clear]
            : [SeerrCardColors.clear, SeerrCardColors.fadeTo]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );

  return (
    <GestureDetector gesture={pan}>
      <View
        style={{ flex: 1, flexDirection: "row", overflow: "hidden" }}
        onLayout={(e) => {
          width.value = e.nativeEvent.layout.width;
        }}
      >
        <Animated.View
          style={[{ flexDirection: "row", gap: 8, flexShrink: 0 }, rowStyle]}
          onLayout={(e) => {
            contentWidth.value = e.nativeEvent.layout.width;
          }}
        >
          {labels.map((label) => (
            <Pill key={label} tone='primary' text={label} />
          ))}
        </Animated.View>
        {fade("start")}
        {fade("end")}
      </View>
    </GestureDetector>
  );
};

/**
 * A request as Seerr's RequestCard draws it in its Discover row: the title
 * over its backdrop, who asked, the seasons asked for and where the request
 * stands, and the poster on the right.
 */
export const RequestCard: React.FC<{ request: MediaRequest }> = ({
  request,
}) => {
  const { t } = useTranslation();
  const {
    details,
    current,
    mediaType,
    canRequest,
    badge,
    badgeText,
    avatar,
    showRequester,
    seasonLabels,
    title,
    year,
    posterSrc,
    backdropSrc,
  } = useSeerrRequestCard(request);

  const card = {
    width: SEERR_REQUEST_CARD_WIDTH,
    marginRight: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SeerrCardColors.surface,
    backgroundColor: SeerrCardColors.surface,
    overflow: "hidden" as const,
  };

  // Seerr's placeholder while the title loads: the card, empty.
  if (!details) {
    return (
      <View style={[card, { height: SEERR_REQUEST_CARD_POSTER.height + 34 }]} />
    );
  }

  return (
    <TouchableSeerrRouter
      result={details}
      mediaTitle={title}
      releaseYear={year}
      canRequest={canRequest}
      posterSrc={posterSrc}
      mediaType={mediaType}
    >
      <View style={card}>
        {!!backdropSrc && (
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          >
            <Image
              source={{ uri: backdropSrc }}
              cachePolicy='memory-disk'
              contentFit='cover'
              style={{ width: "100%", height: "100%" }}
            />
            <LinearGradient
              colors={[SeerrCardColors.fadeFrom, SeerrCardColors.fadeTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              }}
            />
          </View>
        )}
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, minWidth: 0, paddingRight: 12, gap: 4 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 18, fontWeight: "bold", color: "white" }}
            >
              {title}
            </Text>
            {showRequester && !!current.requestedBy && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                {avatar && (
                  <Image
                    source={{ uri: avatar }}
                    style={{ width: 20, height: 20, borderRadius: 10 }}
                  />
                )}
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    fontSize: 14,
                    fontWeight: "600",
                    color: SeerrCardColors.requester,
                  }}
                >
                  {current.requestedBy.displayName}
                </Text>
              </View>
            )}
            {seasonLabels.length > 0 && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={LABEL_STYLE}>
                  {t("seerr.request_card_seasons", {
                    count: seasonLabels.length,
                  })}
                </Text>
                <SeasonPills labels={seasonLabels} />
              </View>
            )}
            {badge && (
              // Seerr's mt-2 on phones: a little further from the row above.
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <Text style={LABEL_STYLE}>{t("seerr.status")}</Text>
                <Pill
                  tone={badge.tone}
                  text={badgeText[badge.label]}
                  progress={badge.progress}
                />
              </View>
            )}
          </View>
          <Image
            source={{ uri: posterSrc }}
            cachePolicy='memory-disk'
            contentFit='cover'
            style={{
              ...SEERR_REQUEST_CARD_POSTER,
              borderRadius: 6,
            }}
          />
        </View>
      </View>
    </TouchableSeerrRouter>
  );
};
