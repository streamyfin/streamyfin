import {Text} from "@/components/common/Text";
import React, {useCallback, useMemo, useState} from "react";
import {Alert, TouchableOpacity, View} from "react-native";
import {TvDetails} from "@/utils/jellyseerr/server/models/Tv";
import {FlashList} from "@shopify/flash-list";
import {orderBy} from "lodash";
import {Tags} from "@/components/GenreTags";
import JellyseerrIconStatus from "@/components/icons/JellyseerrIconStatus";
import Season from "@/utils/jellyseerr/server/entity/Season";
import {MediaStatus, MediaType} from "@/utils/jellyseerr/server/constants/media";
import {Ionicons} from "@expo/vector-icons";
import {RoundButton} from "@/components/RoundButton";
import {useJellyseerr} from "@/hooks/useJellyseerr";
import {TvResult} from "@/utils/jellyseerr/server/models/Search";
import {useQuery} from "@tanstack/react-query";
import {HorizontalScroll} from "@/components/common/HorrizontalScroll";
import {Image} from "expo-image";
import MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";

const JellyseerrSeasonEpisodes: React.FC<{details: TvDetails, seasonNumber: number}> = ({
  details,
  seasonNumber
}) => {
  const {jellyseerrApi} = useJellyseerr();

  const {data: seasonWithEpisodes, isLoading} = useQuery({
    queryKey: ["jellyseerr", details.id, "season", seasonNumber],
    queryFn: async () => jellyseerrApi?.tvSeason(details.id, seasonNumber),
    enabled: details.seasons.filter(s => s.seasonNumber !== 0).length > 0
  })

  return (
    <HorizontalScroll
      horizontal
      loading={isLoading}
      showsHorizontalScrollIndicator={false}
      estimatedItemSize={50}
      data={seasonWithEpisodes?.episodes}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View className="w-2"/>}
      renderItem={(item, index) => (
        <View className="flex flex-col mt-2 w-44">
          {item.stillPath && (
            <View
              className="relative aspect-video rounded-lg overflow-hidden border border-neutral-800"
            >
              <Image
                key={item.id}
                id={item.id}
                source={{
                  uri: jellyseerrApi?.tvStillImageProxy(item.stillPath),
                }}
                cachePolicy={"memory-disk"}
                contentFit="cover"
                className="w-full h-full"
              />
            </View>
          )}
            <View className="shrink">
              <Text numberOfLines={2} className="">
                {item?.name}
              </Text>
              <Text numberOfLines={1} className="text-xs text-neutral-500">
                {`S${item?.seasonNumber}:E${item?.episodeNumber}`}
              </Text>
            </View>

          <Text numberOfLines={3} className="text-xs text-neutral-500 shrink">
            {item?.overview}
          </Text>
        </View>
      )}
    />
  )
}

const JellyseerrSeasons: React.FC<{
  isLoading: boolean,
  result?: TvResult,
  details?: TvDetails
}> = ({
  isLoading,
  result,
  details,
}) => {
  if (!details)
    return null;

  const {jellyseerrApi, requestMedia} = useJellyseerr();
  const [seasonStates, setSeasonStates] = useState<{[key: number]: boolean}>();
  const seasons = useMemo(() => {
      const mediaInfoSeasons = details?.mediaInfo?.seasons?.filter((s: Season) => s.seasonNumber !== 0)
      const requestedSeasons = details?.mediaInfo?.requests?.flatMap((r: MediaRequest) => r.seasons)
      return details.seasons?.map((season) => {
        return {
          ...season,
          status:
            // What our library status is
            mediaInfoSeasons
              ?.find((mediaSeason: Season) => mediaSeason.seasonNumber === season.seasonNumber)
              ?.status
            ??
            // What our request status is
            requestedSeasons
              ?.find((s: Season) => s.seasonNumber === season.seasonNumber)
              ?.status
            ??
            // Otherwise set it as unknown
              MediaStatus.UNKNOWN
        }
      })
    },
    [details]
  );

  const allSeasonsAvailable = useMemo(() =>
      seasons?.every(season => season.status === MediaStatus.AVAILABLE),
    [seasons]
  )

  const requestAll = useCallback(() => {
    if (details && jellyseerrApi) {
      requestMedia(result?.name!!, {
        mediaId: details.id,
        mediaType: MediaType.TV,
        tvdbId: details.externalIds?.tvdbId,
        seasons: seasons
            .filter(s => s.status === MediaStatus.UNKNOWN && s.seasonNumber !== 0)
            .map(s => s.seasonNumber)
      })
    }
  }, [jellyseerrApi, seasons, details])

  const promptRequestAll = useCallback(() => (
    Alert.alert('Request all?', 'Are you sure you want to request all seasons?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'YES',
        onPress: requestAll
      },
    ])), [requestAll]);

  return (
    <FlashList
      data={orderBy(details.seasons.filter(s => s.seasonNumber !== 0), 'seasonNumber', 'desc')}
      ListHeaderComponent={() => (
        <View className="flex flex-row justify-between items-end">
          <Text className="text-lg font-bold mb-2">Seasons</Text>
          {!allSeasonsAvailable && (
            <RoundButton
              className="mb-2 pa-2"
              onPress={promptRequestAll}
            >
              <Ionicons name="bag-add" color="white" size={26}/>
            </RoundButton>
          )}
        </View>
      )}
      ItemSeparatorComponent={() => <View className="h-2" />}
      estimatedItemSize={250}
      renderItem={({item: season}) => (
        <>
          <TouchableOpacity
            onPress={() => setSeasonStates((prevState) => (
              {...prevState, [season.seasonNumber]: !prevState?.[season.seasonNumber]}
            ))}
          >
            <View
              className="flex flex-row justify-between items-center bg-gray-100/10 rounded-xl z-20 h-12 w-full px-4"
              key={season.id}
            >
              <Tags
                textClass=""
                tags={[`Season ${season.seasonNumber}`, `${season.episodeCount} Episodes`]}
              />
              {[0].map(() => {
                const canRequest = seasons?.find(s => s.seasonNumber === season.seasonNumber)?.status === MediaStatus.UNKNOWN
                return <JellyseerrIconStatus
                  key={0}
                  onPress={canRequest ? () =>
                    requestMedia(
                      `${result?.name!!}, Season ${season.seasonNumber}`,
                      {
                        mediaId: details.id,
                        mediaType: MediaType.TV,
                        tvdbId: details.externalIds?.tvdbId,
                        seasons: [season.seasonNumber]
                      }
                    ) : undefined
                  }
                  className={canRequest ? 'bg-gray-700/40' : undefined}
                  mediaStatus={seasons?.find(s => s.seasonNumber === season.seasonNumber)?.status}
                  showRequestIcon={canRequest}
                />
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
      )
    }
    />
  )
}

export default JellyseerrSeasons;