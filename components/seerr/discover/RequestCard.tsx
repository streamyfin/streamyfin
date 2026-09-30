import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { TouchableSeerrRouter } from "@/components/common/SeerrItemRouter";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { SeerrBadgeColors, SeerrCardColors } from "@/constants/Colors";
import {
  SEERR_DOWNLOAD_REFRESH_MS,
  SEERR_REQUEST_CARD_POSTER,
  SEERR_REQUEST_CARD_WIDTH,
} from "@/constants/Seerr";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrCanRequest } from "@/hooks/useSeerrCanRequest";
import { hasPermission, Permission } from "@/utils/seerr/permissions";
import {
  type RequestBadge,
  type RequestBadgeLabel,
  requestBadge,
  requestDownloads,
  seerrAvatarUrl,
} from "@/utils/seerr/requestCard";
import { type MediaRequest, MediaType } from "@/utils/seerr/types";

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

/**
 * A request as Seerr's RequestCard draws it in its Discover row: the title
 * over its backdrop, who asked, the seasons asked for and where the request
 * stands, and the poster on the right.
 */
export const RequestCard: React.FC<{ request: MediaRequest }> = ({
  request,
}) => {
  const { t } = useTranslation();
  const { seerrApi, seerrUser, getTitle, getYear } = useSeerr();
  const mediaType = request.media?.mediaType ?? request.type;
  const tmdbId = request.media?.tmdbId;

  const { data: details } = useQuery({
    queryKey: ["seerr", "detail", mediaType, tmdbId],
    queryFn: async () =>
      mediaType === MediaType.MOVIE
        ? seerrApi?.movieDetails(tmdbId!)
        : seerrApi?.tvDetails(tmdbId!),
    enabled: !!seerrApi && tmdbId !== undefined,
  });

  const { data: refreshed } = useQuery({
    queryKey: ["seerr", "requests", mediaType, request.id],
    queryFn: async () => seerrApi?.getRequest(request.id),
    enabled: !!seerrApi,
    refetchInterval: (query) =>
      requestDownloads(query.state.data ?? request).length > 0
        ? SEERR_DOWNLOAD_REFRESH_MS
        : false,
  });

  const current = refreshed ?? request;
  const [canRequest] = useSeerrCanRequest(details);
  const badge: RequestBadge | undefined = requestBadge(current);
  const baseUrl = seerrApi?.axios.defaults.baseURL ?? "";
  const avatar = seerrAvatarUrl(baseUrl, current.requestedBy?.avatar);
  // Seerr names the requester to those who may see others' requests.
  const showRequester = hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW],
    seerrUser?.permissions ?? 0,
    { type: "or" },
  );
  const seasons = mediaType === MediaType.TV ? (current.seasons ?? []) : [];
  const title = getTitle(details);
  const posterSrc =
    seerrApi?.imageProxy(details?.posterPath, "w300_and_h450_face") ?? "";

  // Written out rather than built, so each key reads as used.
  const badgeText: Record<RequestBadgeLabel, string> = {
    available: t("seerr.request_status.available"),
    partially_available: t("seerr.request_status.partially_available"),
    requested: t("seerr.request_status.requested"),
    processing: t("seerr.request_status.processing"),
    pending: t("seerr.request_status.pending"),
    declined: t("seerr.request_status.declined"),
    failed: t("seerr.request_status.failed"),
    blocklisted: t("seerr.request_status.blocklisted"),
    deleted: t("seerr.request_status.deleted"),
  };

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
      releaseYear={getYear(details)}
      canRequest={canRequest}
      posterSrc={posterSrc}
      mediaType={mediaType}
    >
      <View style={card}>
        {!!details.backdropPath && (
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
              source={{
                uri: seerrApi?.imageProxy(
                  details.backdropPath,
                  "w1920_and_h800_multi_faces",
                  640,
                ),
              }}
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
            {seasons.length > 0 && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "bold",
                    color: SeerrCardColors.label,
                  }}
                >
                  {t("seerr.request_card_seasons", { count: seasons.length })}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {seasons.map((season) => (
                    <Pill
                      key={season.id}
                      tone='primary'
                      text={
                        season.seasonNumber === 0
                          ? t("seerr.specials")
                          : `${season.seasonNumber}`
                      }
                    />
                  ))}
                </ScrollView>
              </View>
            )}
            {badge && (
              <View style={{ marginTop: 4 }}>
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
