import {
  router,
  useLocalSearchParams,
  useSegments,
} from "expo-router";
import React, { useMemo } from "react";
import { TouchableOpacity } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { Text } from "@/components/common/Text";
import { Image } from "expo-image";
import { OverviewText } from "@/components/OverviewText";
import { orderBy } from "lodash";
import { PersonCreditCast } from "@/utils/jellyseerr/server/models/Person";
import Poster from "@/components/posters/Poster";
import JellyseerrMediaIcon from "@/components/jellyseerr/JellyseerrMediaIcon";
import ParallaxSlideShow from "@/components/jellyseerr/ParallaxSlideShow";

export default function page() {
  const local = useLocalSearchParams();
  const segments = useSegments();
  const { jellyseerrApi, jellyseerrUser } = useJellyseerr();

  const { personId } = local as { personId: string };
  const from = segments[2];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["jellyseerr", "person", personId],
    queryFn: async () => ({
      details: await jellyseerrApi?.personDetails(personId),
      combinedCredits: await jellyseerrApi?.personCombinedCredits(personId),
    }),
    enabled: !!jellyseerrApi && !!personId,
  });

  const locale = useMemo(() => {
    return jellyseerrUser?.settings?.locale || "en";
  }, [jellyseerrUser]);

  const region = useMemo(
    () => jellyseerrUser?.settings?.region || "US",
    [jellyseerrUser]
  );

  const castedRoles: PersonCreditCast[] = useMemo(
    () =>
      orderBy(
        data?.combinedCredits?.cast,
        ["voteCount", "voteAverage"],
        "desc"
      ),
    [data?.combinedCredits]
  );
  const backdrops = useMemo(
    () => jellyseerrApi
      ? castedRoles.map((c) => jellyseerrApi.imageProxy(c.backdropPath, "w1920_and_h800_multi_faces"))
      : [],
    [jellyseerrApi, data?.combinedCredits]
  );

  const viewDetails = (credit: PersonCreditCast) => {
    router.push({
      //@ts-ignore
      pathname: `/(auth)/(tabs)/${from}/jellyseerr/page`,
      //@ts-ignore
      params: {
        ...credit,
        mediaTitle: credit.title,
        releaseYear: new Date(credit.releaseDate).getFullYear(),
        canRequest: "false",
        posterSrc: jellyseerrApi?.imageProxy(
          credit.posterPath,
          "w300_and_h450_face"
        ),
      },
    });
  };

  return (
    <ParallaxSlideShow
      data={castedRoles}
      images={backdrops}
      listHeader="Appearances"
      keyExtractor={(item) => item.id.toString()}
      logo={
        <Image
          key={data?.details?.id}
          id={data?.details?.id.toString()}
          className="rounded-full bottom-1"
          source={{
            uri: jellyseerrApi?.imageProxy(
              data?.details?.profilePath,
              "w600_and_h600_bestv2"
            ),
          }}
          cachePolicy={"memory-disk"}
          contentFit="cover"
          style={{
            width: 125,
            height: 125,
          }}
        />
      }
      HeaderContent={() => (
        <>
          <Text className="font-bold text-2xl mb-1">
            {data?.details?.name}
          </Text>
          <Text className="opacity-50">
            Born{" "}
            {new Date(data?.details?.birthday!!).toLocaleDateString(
              `${locale}-${region}`,
              {
                year: "numeric",
                month: "long",
                day: "numeric",
              }
            )}{" "}
            | {data?.details?.placeOfBirth}
          </Text>
        </>
      )}
      MainContent={() => (
        <OverviewText text={data?.details?.biography} className="mt-4" />
      )}
      renderItem={(item, index) => (
        <TouchableOpacity
          className="w-full flex flex-col pr-2"
          onPress={() => viewDetails(item)}
        >
          <Poster
            id={item.id.toString()}
            url={jellyseerrApi?.imageProxy(item.posterPath)}
          />
          <JellyseerrMediaIcon
            className="absolute top-1 left-1"
            mediaType={item.mediaType as "movie" | "tv"}
          />
          {item.character && (
            <Text
              className="text-xs opacity-50 align-bottom mt-1"
              numberOfLines={1}
            >
              as {item.character}
            </Text>
          )}
        </TouchableOpacity>
      )}
    />
  );
}
