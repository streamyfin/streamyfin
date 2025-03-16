import { Tags } from "@/components/GenreTags";
import { RoundButton } from "@/components/RoundButton";
import { HorizontalScroll } from "@/components/common/HorrizontalScroll";
import { Text } from "@/components/common/Text";
import { dateOpts } from "@/components/jellyseerr/DetailFacts";
import JellyseerrStatusIcon from "@/components/jellyseerr/JellyseerrStatusIcon";
import { textShadowStyle } from "@/components/jellyseerr/discover/GenericSlideCard";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import {
  MediaStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type Season from "@/utils/jellyseerr/server/entity/Season";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import { TvResult } from "@/utils/jellyseerr/server/models/Search";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import {
  type QueryObserverResult,
  type RefetchOptions,
  useQuery,
} from "@tanstack/react-query";
import { Image } from "expo-image";
import { t } from "i18next";
import { orderBy } from "lodash";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { Alert, TouchableOpacity, View } from "react-native";
import { Loader } from "../Loader";

const JellyseerrSeasonEpisodes: React.FC<{
  details: TvDetails;
  seasonNumber: number;
}> = ({ details, seasonNumber }) => {
  const { jellyseerrApi } = useJellyseerr();

  const { data: seasonWithEpisodes, isLoading } = useQuery({
    queryKey: ["jellyseerr", details.id, "season", seasonNumber],
    queryFn: async () => jellyseerrApi?.tvSeason(details.id, seasonNumber),
    enabled: details.seasons.filter((s) => s.seasonNumber !== 0).length > 0,
  });

  return (
    <HorizontalScroll
      horizontal
      loading={isLoading}
      showsHorizontalScrollIndicator={false}
      estimatedItemSize={50}
      data={seasonWithEpisodes?.episodes}
      keyExtractor={(item) => item.id}
      renderItem={(item, index) => (
        <RenderItem key={index} item={item} index={index} />
      )}
    />
  );
};

const RenderItem = ({ item, index }: any) => {
  const {
    jellyseerrApi,
    jellyseerrRegion: region,
    jellyseerrLocale: locale,
  } = useJellyseerr();
  const [imageError, setImageError] = useState(false);

  const upcomingAirDate = useMemo(() => {
    const airDate = item.airDate;
    if (airDate) {
      const airDateObj = new Date(airDate);

      if (new Date() < airDateObj) {
        return airDateObj.toLocaleDateString(`${locale}-${region}`, dateOpts);
      }
    }
  }, [item]);

  return (
    <View className='flex flex-col w-44 mt-2'>
      <View className='relative aspect-video rounded-lg overflow-hidden border border-neutral-800'>
        {!imageError ? (
          <>
            <Image
              key={item.id}
              id={item.id}
              source={{
                uri: jellyseerrApi?.imageProxy(item.stillPath),
              }}
              cachePolicy={"memory-disk"}
              contentFit='cover'
              className='w-full h-full'
              onError={(e) => {
                setImageError(true);
              }}
            />
            {upcomingAirDate && (
              <View className='absolute justify-center bottom-0 right-0.5 items-center'>
                <View className='rounded-full bg-purple-600/30 p-1'>
                  <Text
                    className='text-center text-xs'
                    style={textShadowStyle.shadow}
                  >
                    {upcomingAirDate}
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <View className='flex flex-col w-full h-full items-center justify-center border border-neutral-800 bg-neutral-900'>
            <Ionicons
              name='image-outline'
              size={24}
              color='white'
              style={{ opacity: 0.4 }}
            />
          </View>
        )}
      </View>
      <View className='shrink mt-1'>
        <Text numberOfLines={2} className=''>
          {item.name}
        </Text>
        <Text numberOfLines={1} className='text-xs text-neutral-500'>
          {`S${item.seasonNumber}:E${item.episodeNumber}`}
        </Text>
      </View>

      <Text numberOfLines={3} className='text-xs text-neutral-500 shrink'>
        {item.overview}
      </Text>
    </View>
  );
};

const JellyseerrSeasons: React.FC<{
  isLoading: boolean;
  details?: TvDetails;
  hasAdvancedRequest?: boolean;
  onAdvancedRequest?: (data: MediaRequestBody) => void;
  refetch: (
    options?: RefetchOptions | undefined,
  ) => Promise<
    QueryObserverResult<TvDetails | MovieDetails | undefined, Error>
  >;
}> = ({
  isLoading,
  details,
  refetch,
  hasAdvancedRequest,
  onAdvancedRequest,
}) => {
  if (!details) return null;

  const { jellyseerrApi, requestMedia } = useJellyseerr();
  const [seasonStates, setSeasonStates] = useState<{
    [key: number]: boolean;
  }>();
  const seasons = useMemo(() => {
    const mediaInfoSeasons = details?.mediaInfo?.seasons?.filter(
      (s: Season) => s.seasonNumber !== 0,
    );
    const requestedSeasons = details?.mediaInfo?.requests?.flatMap(
      (r: MediaRequest) => r.seasons,
    );
    return details.seasons?.map((season) => {
      return {
        ...season,
        status:
          // What our library status is
          mediaInfoSeasons?.find(
            (mediaSeason: Season) =>
              mediaSeason.seasonNumber === season.seasonNumber,
          )?.status ??
          // What our request status is
          requestedSeasons?.find(
            (s: Season) => s.seasonNumber === season.seasonNumber,
          )?.status ??
          // Otherwise set it as unknown
          MediaStatus.UNKNOWN,
      };
    });
  }, [details]);

  const allSeasonsAvailable = useMemo(
    () => seasons?.every((season) => season.status === MediaStatus.AVAILABLE),
    [seasons],
  );

  const requestAll = useCallback(() => {
    if (details && jellyseerrApi) {
      const body: MediaRequestBody = {
        mediaId: details.id,
        mediaType: MediaType.TV,
        tvdbId: details.externalIds?.tvdbId,
        seasons: seasons
          .filter(
            (s) => s.status === MediaStatus.UNKNOWN && s.seasonNumber !== 0,
          )
          .map((s) => s.seasonNumber),
      };

      if (hasAdvancedRequest) {
        return onAdvancedRequest?.(body);
      }

      requestMedia(details.name, body, refetch);
    }
  }, [jellyseerrApi, seasons, details, hasAdvancedRequest, onAdvancedRequest]);

  const promptRequestAll = useCallback(
    () =>
      Alert.alert(
        t("jellyseerr.confirm"),
        t("jellyseerr.are_you_sure_you_want_to_request_all_seasons"),
        [
          {
            text: t("jellyseerr.cancel"),
            style: "cancel",
          },
          {
            text: t("jellyseerr.yes"),
            onPress: requestAll,
          },
        ],
      ),
    [requestAll],
  );

  const requestSeason = useCallback(
    async (canRequest: boolean, seasonNumber: number) => {
      if (canRequest) {
        const body: MediaRequestBody = {
          mediaId: details.id,
          mediaType: MediaType.TV,
          tvdbId: details.externalIds?.tvdbId,
          seasons: [seasonNumber],
        };

        if (hasAdvancedRequest) {
          return onAdvancedRequest?.(body);
        }

        requestMedia(`${details.name}, Season ${seasonNumber}`, body, refetch);
      }
    },
    [requestMedia, hasAdvancedRequest, onAdvancedRequest],
  );

  if (isLoading)
    return (
      <View>
        <View className='flex flex-row justify-between items-end px-4'>
          <Text className='text-lg font-bold mb-2'>
            {t("item_card.seasons")}
          </Text>
          {!allSeasonsAvailable && (
            <RoundButton className='mb-2 pa-2' onPress={promptRequestAll}>
              <Ionicons name='bag-add' color='white' size={26} />
            </RoundButton>
          )}
        </View>
        <Loader />
      </View>
    );

  return (
    <FlashList
      data={orderBy(
        details.seasons.filter((s) => s.seasonNumber !== 0),
        "seasonNumber",
        "desc",
      )}
      ListHeaderComponent={() => (
        <View className='flex flex-row justify-between items-end px-4'>
          <Text className='text-lg font-bold mb-2'>
            {t("item_card.seasons")}
          </Text>
          {!allSeasonsAvailable && (
            <RoundButton className='mb-2 pa-2' onPress={promptRequestAll}>
              <Ionicons name='bag-add' color='white' size={26} />
            </RoundButton>
          )}
        </View>
      )}
      ItemSeparatorComponent={() => <View className='h-2' />}
      estimatedItemSize={250}
      renderItem={({ item: season }) => (
        <>
          <TouchableOpacity
            onPress={() =>
              setSeasonStates((prevState) => ({
                ...prevState,
                [season.seasonNumber]: !prevState?.[season.seasonNumber],
              }))
            }
            className='px-4'
          >
            <View
              className='flex flex-row justify-between items-center bg-gray-100/10 rounded-xl z-20 h-12 w-full px-4'
              key={season.id}
            >
              <Tags
                textClass=''
                tags={[
                  t("jellyseerr.season_number", {
                    season_number: season.seasonNumber,
                  }),
                  t("jellyseerr.number_episodes", {
                    episode_number: season.episodeCount,
                  }),
                ]}
              />
              {[0].map(() => {
                const canRequest =
                  seasons?.find((s) => s.seasonNumber === season.seasonNumber)
                    ?.status === MediaStatus.UNKNOWN;
                return (
                  <JellyseerrStatusIcon
                    key={0}
                    onPress={() =>
                      requestSeason(canRequest, season.seasonNumber)
                    }
                    className={canRequest ? "bg-gray-700/40" : undefined}
                    mediaStatus={
                      seasons?.find(
                        (s) => s.seasonNumber === season.seasonNumber,
                      )?.status
                    }
                    showRequestIcon={canRequest}
                  />
                );
              })}
            </View>
          </TouchableOpacity>
          {seasonStates?.[season.seasonNumber] && (
            <JellyseerrSeasonEpisodes
              key={season.seasonNumber}
              details={details}
              seasonNumber={season.seasonNumber}
            />
          )}
        </>
      )}
    />
  );
};

export default JellyseerrSeasons;
