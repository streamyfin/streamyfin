import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import { SeerrBadgeColors, SeerrCardColors } from "@/constants/Colors";
import {
  SEERR_TV_REQUEST_CARD_POSTER,
  SEERR_TV_REQUEST_CARD_SEASONS,
  SEERR_TV_REQUEST_CARD_WIDTH,
} from "@/constants/Seerr";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useSeerrRequestCard } from "@/hooks/useSeerrRequestCard";
import { scaleSize } from "@/utils/scaleSize";
import type { MediaRequest } from "@/utils/seerr/types";

/** One of Seerr's pill badges at the TV's size, a download's progress behind. */
const TVPill: React.FC<{
  tone: keyof typeof SeerrBadgeColors;
  text: string;
  progress?: number;
}> = ({ tone, text, progress }) => {
  const typography = useScaledTVTypography();
  const colors = SeerrBadgeColors[tone];
  return (
    <View
      style={{
        overflow: "hidden",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor:
          progress === undefined ? colors.background : SeerrCardColors.surface,
        paddingHorizontal: scaleSize(12),
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
          fontSize: typography.callout * 0.85,
          fontWeight: "600",
          color: colors.text,
        }}
      >
        {progress === undefined ? text : `${text} ${progress}%`}
      </Text>
    </View>
  );
};

/**
 * Seerr's request card (RequestCard) on the TV, as the phone draws it in its
 * Discover row: the title over its backdrop, who asked, the seasons asked for
 * and where the request stands, the poster on the right. Past a few seasons it
 * lists the rest as "+N", a remote having no swipe to show them.
 */
export const TVRequestCard: React.FC<{
  request: MediaRequest;
  hasTVPreferredFocus?: boolean;
}> = ({ request, hasTVPreferredFocus = false }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const typography = useScaledTVTypography();
  const {
    details,
    current,
    mediaType,
    badge,
    badgeText,
    avatar,
    showRequester,
    seasonLabels,
    title,
    posterSrc,
    backdropSrc,
  } = useSeerrRequestCard(request);

  const width = scaleSize(SEERR_TV_REQUEST_CARD_WIDTH);
  const poster = {
    width: scaleSize(SEERR_TV_REQUEST_CARD_POSTER.width),
    height: scaleSize(SEERR_TV_REQUEST_CARD_POSTER.height),
  };
  const padding = scaleSize(24);
  const label = {
    fontSize: typography.callout,
    fontWeight: "bold",
    color: SeerrCardColors.label,
  } as const;
  const shown = seasonLabels.slice(0, SEERR_TV_REQUEST_CARD_SEASONS);
  const hidden = seasonLabels.length - shown.length;

  const card = {
    width,
    height: poster.height + 2 * padding,
    padding,
    borderRadius: scaleSize(20),
    backgroundColor: SeerrCardColors.surface,
    overflow: "hidden" as const,
  };

  // Seerr's placeholder while the title loads: the card, empty.
  if (!details) return <View style={card} />;

  return (
    <TVFocusablePoster
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={() =>
        router.push({
          pathname: "/(auth)/(tabs)/(search)/seerr/page",
          params: { id: String(details.id), mediaType },
        })
      }
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
        <View style={{ flexDirection: "row", flex: 1 }}>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              paddingRight: scaleSize(16),
              justifyContent: "center",
              gap: scaleSize(10),
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: typography.heading,
                fontWeight: "bold",
                color: "white",
              }}
            >
              {title}
            </Text>
            {showRequester && !!current.requestedBy && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: scaleSize(10),
                }}
              >
                {avatar && (
                  <Image
                    source={{ uri: avatar }}
                    style={{
                      width: scaleSize(32),
                      height: scaleSize(32),
                      borderRadius: scaleSize(16),
                    }}
                  />
                )}
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    fontSize: typography.callout,
                    fontWeight: "600",
                    color: SeerrCardColors.requester,
                  }}
                >
                  {current.requestedBy.displayName}
                </Text>
              </View>
            )}
            {shown.length > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: scaleSize(10),
                }}
              >
                <Text style={label}>
                  {t("seerr.request_card_seasons", {
                    count: seasonLabels.length,
                  })}
                </Text>
                {shown.map((season) => (
                  <TVPill key={season} tone='primary' text={season} />
                ))}
                {hidden > 0 && <TVPill tone='primary' text={`+${hidden}`} />}
              </View>
            )}
            {badge && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: scaleSize(10),
                }}
              >
                <Text style={label}>{t("seerr.status")}</Text>
                <TVPill
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
            style={{ ...poster, borderRadius: scaleSize(10) }}
          />
        </View>
      </View>
    </TVFocusablePoster>
  );
};
