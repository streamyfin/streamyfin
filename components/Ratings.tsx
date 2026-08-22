import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useMemo } from "react";
import { View, type ViewProps } from "react-native";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import type {
  MovieResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import { AwardsBadge } from "./AwardsBadge";
import { Badge } from "./Badge";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
}

export const Ratings: React.FC<Props> = ({ item, className, ...props }) => {
  if (!item) return null;
  return (
    // The caller's className is appended, not spread over the top: spreading
    // props last replaces this one outright, which cost the row its layout and
    // let the badges ride up over whatever sat above them.
    <View
      {...props}
      className={`flex flex-row flex-wrap items-center mt-2 gap-2 ${className ?? ""}`}
    >
      {item.OfficialRating && (
        <Badge text={item.OfficialRating} variant='gray' />
      )}
      {item.CommunityRating && (
        <Badge
          text={item.CommunityRating.toFixed(1)}
          variant='gray'
          iconLeft={<Ionicons name='star' size={14} color='gold' />}
        />
      )}
      {item.CriticRating && (
        <Badge
          text={item.CriticRating}
          variant='gray'
          iconLeft={
            <Image
              source={
                item.CriticRating < 60
                  ? require("@/assets/images/rt_rotten.svg")
                  : require("@/assets/images/rt_fresh.svg")
              }
              style={{
                width: 14,
                height: 14,
              }}
            />
          }
        />
      )}
      <AwardsBadge item={item} />
    </View>
  );
};

export const JellyserrRatings: React.FC<{
  result: MovieResult | TvResult | TvDetails | MovieDetails;
}> = ({ result }) => {
  const { jellyseerrApi, getMediaType } = useJellyseerr();

  const mediaType = useMemo(() => getMediaType(result), [result]);

  const { data, isLoading } = useQuery({
    queryKey: ["jellyseerr", result.id, mediaType, "ratings"],
    queryFn: async () => {
      return mediaType === MediaType.MOVIE
        ? jellyseerrApi?.movieRatings(result.id)
        : jellyseerrApi?.tvRatings(result.id);
    },
    staleTime: (5).minutesToMilliseconds(),
    retry: false,
    enabled: !!jellyseerrApi,
  });

  return (
    (isLoading ||
      !!result.voteCount ||
      (data?.criticsRating && !!data?.criticsScore) ||
      (data?.audienceRating && !!data?.audienceScore)) && (
      <View className='flex flex-row flex-wrap space-x-1'>
        {data?.criticsRating && !!data?.criticsScore && (
          <Badge
            text={`${data.criticsScore}%`}
            variant='gray'
            iconLeft={
              <Image
                className='mr-1'
                source={
                  data?.criticsRating === "Rotten"
                    ? require("@/assets/images/rt_rotten.svg")
                    : require("@/assets/images/rt_fresh.svg")
                }
                style={{
                  width: 14,
                  height: 14,
                }}
              />
            }
          />
        )}
        {data?.audienceRating && !!data?.audienceScore && (
          <Badge
            text={`${data.audienceScore}%`}
            variant='gray'
            iconLeft={
              <Image
                className='mr-1'
                source={
                  data?.audienceRating === "Spilled"
                    ? require("@/assets/images/rt_aud_rotten.svg")
                    : require("@/assets/images/rt_aud_fresh.svg")
                }
                style={{
                  width: 14,
                  height: 14,
                }}
              />
            }
          />
        )}
        {!!result.voteCount && (
          <Badge
            text={`${Math.round(result.voteAverage * 10)}%`}
            variant='gray'
            iconLeft={
              <Image
                className='mr-1'
                source={require("@/assets/images/tmdb_logo.svg")}
                style={{
                  width: 14,
                  height: 14,
                }}
              />
            }
          />
        )}
      </View>
    )
  );
};
