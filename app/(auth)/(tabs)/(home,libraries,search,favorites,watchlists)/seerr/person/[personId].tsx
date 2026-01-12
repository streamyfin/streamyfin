import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { orderBy, uniqBy } from "lodash";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/common/Text";
import { OverviewText } from "@/components/OverviewText";
import SeerrPoster from "@/components/posters/SeerrPoster";
import ParallaxSlideShow from "@/components/seerr/ParallaxSlideShow";
import { useSeerr } from "@/hooks/useSeerr";
import type { PersonCreditCast } from "@/utils/jellyseerr/server/models/Person";

export default function PersonPage() {
  const local = useLocalSearchParams();
  const { t } = useTranslation();

  const { seerrApi, seerrLocale: locale } = useSeerr();

  const { personId } = local as { personId: string };

  const { data } = useQuery({
    queryKey: ["seerr", "person", personId],
    queryFn: async () => ({
      details: await seerrApi?.personDetails(personId),
      combinedCredits: await seerrApi?.personCombinedCredits(personId),
    }),
    enabled: !!seerrApi && !!personId,
  });

  const castedRoles: PersonCreditCast[] = useMemo(
    () =>
      uniqBy(
        orderBy(
          data?.combinedCredits?.cast,
          ["voteCount", "voteAverage"],
          "desc",
        ),
        "id",
      ),
    [data?.combinedCredits],
  );
  const backdrops = useMemo(
    () =>
      seerrApi
        ? castedRoles.map((c) =>
            seerrApi.imageProxy(c.backdropPath, "w1920_and_h800_multi_faces"),
          )
        : [],
    [seerrApi, data?.combinedCredits],
  );

  return (
    <ParallaxSlideShow
      data={castedRoles}
      images={backdrops}
      listHeader={t("seerr.appearances")}
      keyExtractor={(item) => item.id.toString()}
      logo={
        <Image
          key={data?.details?.id}
          id={data?.details?.id.toString()}
          className='rounded-full bottom-1'
          source={{
            uri: seerrApi?.imageProxy(
              data?.details?.profilePath,
              "w600_and_h600_bestv2",
            ),
          }}
          cachePolicy={"memory-disk"}
          contentFit='cover'
          style={{
            width: 125,
            height: 125,
          }}
        />
      }
      HeaderContent={() => (
        <>
          <Text className='font-bold text-2xl mb-1'>{data?.details?.name}</Text>
          <Text className='opacity-50'>
            {t("seerr.born")}{" "}
            {data?.details?.birthday &&
              new Date(data.details.birthday).toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}{" "}
            | {data?.details?.placeOfBirth}
          </Text>
        </>
      )}
      MainContent={() => (
        <OverviewText text={data?.details?.biography} className='mt-4' />
      )}
      renderItem={(item, _index) => <SeerrPoster item={item} />}
    />
  );
}
