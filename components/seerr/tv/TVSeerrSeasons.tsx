import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { orderBy } from "lodash";
import type React from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, ScrollView, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { SeerrRequestIcon } from "@/components/seerr/SeerrRequestIcon";
import { TVButton } from "@/components/tv";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { SeerrStatusBadgeColors } from "@/constants/Colors";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrPublicSettings } from "@/hooks/useSeerrPublicSettings";
import { scaleSize } from "@/utils/scaleSize";
import { episodeStillUrl } from "@/utils/seerr/images";
import { seasonsWithStatus, unrequestedSeasons } from "@/utils/seerr/seasons";
import { seerrStatusBadge } from "@/utils/seerr/statusBadge";
import type { TvDetails } from "@/utils/seerr/types";

const CARD_WIDTH = 240;

/** A season's episodes, as landscape cards the remote can browse. */
const TVSeasonEpisodes: React.FC<{
  details: TvDetails;
  seasonNumber: number;
}> = ({ details, seasonNumber }) => {
  const { seerrApi } = useSeerr();
  const { data, isLoading } = useQuery({
    queryKey: ["seerr", details.id, "season", seasonNumber],
    queryFn: async () => seerrApi?.tvSeason(details.id, seasonNumber),
    enabled: !!seerrApi,
  });
  const baseUrl = seerrApi?.axios.defaults.baseURL ?? "";

  if (isLoading) return <Loader />;

  return (
    <FlatList
      horizontal
      data={data?.episodes ?? []}
      keyExtractor={(episode) => String(episode.id)}
      showsHorizontalScrollIndicator={false}
      style={{ overflow: "visible" }}
      contentContainerStyle={{ paddingVertical: 16, gap: 20 }}
      renderItem={({ item: episode }) => {
        const still = episodeStillUrl(baseUrl, episode.stillPath);
        const card: BaseItemDto = {
          Id: String(episode.id),
          Name: episode.name,
          Type: "Episode",
          IndexNumber: episode.episodeNumber,
          ParentIndexNumber: seasonNumber,
        };
        // Nothing to open, as on the phone: focusable only to be browsed.
        return (
          <TVPosterCard
            item={card}
            orientation='horizontal'
            disabled
            focusableWhenDisabled
            showProgress={false}
            showWatchedIndicator={false}
            imageUrlGetter={() => still}
            onPress={() => {}}
          />
        );
      }}
    />
  );
};

/**
 * A series' seasons on the TV, as the phone lists them (SeerrSeasons): each
 * season with its episodes and where it stands, and the episodes of the one
 * chosen below. A season still to ask for can be requested from there, as the
 * phone's "+" beside it does.
 */
export const TVSeerrSeasons: React.FC<{
  details: TvDetails;
  /** Whether the page offers a request at all: a season's own follows it. */
  offersRequest: boolean;
  onRequestSeason: (seasonNumber: number) => void;
  /** The first season's card, for the focus coming back up from the cast. */
  firstCardRef?: (ref: View | null) => void;
}> = ({ details, offersRequest, onRequestSeason, firstCardRef }) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const publicSettings = useSeerrPublicSettings();
  const specials = publicSettings?.enableSpecialEpisodes === true;
  const partial = publicSettings?.partialRequestsEnabled !== false;

  const seasons = useMemo(
    () =>
      orderBy(
        // The specials only when the server shows them, and only with episodes.
        seasonsWithStatus(details).filter(
          (s) => s.seasonNumber !== 0 || (specials && s.episodeCount !== 0),
        ),
        "seasonNumber",
        "asc",
      ),
    [details, specials],
  );
  const unrequested = useMemo(
    () => unrequestedSeasons(details, { specials }),
    [details, specials],
  );
  const [chosen, setChosen] = useState<number>();
  const current =
    chosen ??
    seasons.find((s) => s.seasonNumber > 0)?.seasonNumber ??
    seasons[0]?.seasonNumber;

  if (seasons.length === 0) return null;

  const name = (seasonNumber: number) =>
    seasonNumber === 0
      ? t("seerr.specials")
      : t("seerr.season_number", { season_number: seasonNumber });
  const requestable = (seasonNumber: number) =>
    offersRequest && partial && unrequested.includes(seasonNumber);

  return (
    <View style={{ marginTop: 24 }}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "bold",
          color: "#FFFFFF",
          marginBottom: 8,
        }}
      >
        {t("item_card.seasons")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ overflow: "visible" }}
        contentContainerStyle={{ paddingVertical: 16, gap: 20 }}
      >
        {seasons.map((season, index) => {
          const badge = seerrStatusBadge(
            season.status,
            requestable(season.seasonNumber),
          );
          const selected = season.seasonNumber === current;
          return (
            <TVFocusablePoster
              key={season.seasonNumber}
              onPress={() => setChosen(season.seasonNumber)}
              refSetter={index === 0 ? firstCardRef : undefined}
            >
              <View
                style={{
                  width: scaleSize(CARD_WIDTH),
                  padding: scaleSize(18),
                  borderRadius: scaleSize(16),
                  backgroundColor: selected
                    ? "rgba(255,255,255,0.22)"
                    : "rgba(255,255,255,0.08)",
                  borderWidth: 1,
                  borderColor: selected
                    ? "rgba(255,255,255,0.5)"
                    : "rgba(255,255,255,0.1)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: scaleSize(12),
                }}
              >
                <View style={{ flexShrink: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: typography.callout,
                      fontWeight: "600",
                      color: "#FFFFFF",
                    }}
                  >
                    {name(season.seasonNumber)}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.callout * 0.8,
                      color: "rgba(255,255,255,0.6)",
                    }}
                  >
                    {t("seerr.number_episodes", { count: season.episodeCount })}
                  </Text>
                </View>
                {badge && (
                  <View
                    style={{
                      width: scaleSize(32),
                      height: scaleSize(32),
                      borderRadius: scaleSize(16),
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: SeerrStatusBadgeColors[badge.tone],
                    }}
                  >
                    <MaterialCommunityIcons
                      name={badge.icon}
                      size={scaleSize(20)}
                      color='white'
                    />
                  </View>
                )}
              </View>
            </TVFocusablePoster>
          );
        })}
      </ScrollView>
      {current !== undefined && (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: scaleSize(20),
              marginTop: 8,
            }}
          >
            <Text
              style={{
                fontSize: typography.callout,
                fontWeight: "bold",
                color: "#FFFFFF",
              }}
            >
              {name(current)}
            </Text>
            {requestable(current) && (
              <TVButton
                variant='secondary'
                onPress={() => onRequestSeason(current)}
              >
                <View style={{ marginRight: 8 }}>
                  <SeerrRequestIcon size={22} color='#FFFFFF' />
                </View>
                <Text
                  style={{
                    fontSize: typography.callout,
                    fontWeight: "bold",
                    color: "#FFFFFF",
                  }}
                >
                  {t("seerr.request_button")}
                </Text>
              </TVButton>
            )}
          </View>
          <TVSeasonEpisodes details={details} seasonNumber={current} />
        </>
      )}
    </View>
  );
};
