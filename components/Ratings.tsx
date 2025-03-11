import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { View, ViewProps } from "react-native";
import { Badge } from "./Badge";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { MovieResult, TvResult } from "@/utils/jellyseerr/server/models/Search";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useQuery } from "@tanstack/react-query";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import { useMemo } from "react";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
}

export const Ratings: React.FC<Props> = ({ item, ...props }) => {
  if (!item) return null;
  return (
    <View className="flex flex-row items-center mt-2 space-x-2" {...props}>
      {item.OfficialRating && (
        <Badge text={item.OfficialRating} variant="gray" />
      )}
      {item.CommunityRating && (
        <Badge
          text={item.CommunityRating.toFixed(1)}
          variant="gray"
          iconLeft={<Ionicons name="star" size={14} color="gold" />}
        />
      )}
      {item.CriticRating && (
        <Badge
          text={item.CriticRating}
          variant="gray"
          iconLeft={
            <Image
              source={
                item.CriticRating < 60
                  ? require("@/assets/images/rotten-tomatoes.png")
                  : require("@/assets/images/not-rotten-tomatoes.svg")
              }
              style={{
                width: 14,
                height: 14,
              }}
            />
          }
        />
      )}
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
      <View className="flex flex-row flex-wrap space-x-1">
        {data?.criticsRating && !!data?.criticsScore && (
          <Badge
            text={`${data.criticsScore}%`}
            variant="gray"
            iconLeft={
              <Image
                className="mr-1"
                source={
                  data?.criticsRating === "Rotten"
                    ? require("@/utils/jellyseerr/src/assets/rt_rotten.svg")
                    : require("@/utils/jellyseerr/src/assets/rt_fresh.svg")
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
            variant="gray"
            iconLeft={
              <Image
                className="mr-1"
                source={
                  data?.audienceRating === "Spilled"
                    ? require("@/utils/jellyseerr/src/assets/rt_aud_rotten.svg")
                    : require("@/utils/jellyseerr/src/assets/rt_aud_fresh.svg")
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
            variant="gray"
            iconLeft={
              <Image
                className="mr-1"
                source={require("@/utils/jellyseerr/src/assets/tmdb_logo.svg")}
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
