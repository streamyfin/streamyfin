import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { OverviewText } from "@/components/OverviewText";
import SeerrPoster from "@/components/posters/SeerrPoster";
import ParallaxSlideShow from "@/components/seerr/ParallaxSlideShow";
import { TVSeerrPersonPage } from "@/components/seerr/tv/TVSeerrPersonPage";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrPerson } from "@/hooks/useSeerrPerson";
import { formatSeerrDate, seerrLocaleTag } from "@/utils/seerr/dates";

export default function SeerrPersonPage() {
  const { personId } = useLocalSearchParams() as { personId: string };
  // The phone's page scrolls posters no remote can reach.
  if (Platform.isTV) return <TVSeerrPersonPage personId={personId} />;
  return <MobilePersonPage personId={personId} />;
}

function MobilePersonPage({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const { seerrApi, seerrRegion: region, seerrLocale: locale } = useSeerr();
  const { details, roles: castedRoles } = useSeerrPerson(personId);

  const backdrops = useMemo(
    () =>
      seerrApi
        ? castedRoles.map((c) =>
            seerrApi.imageProxy(c.backdropPath, "w1920_and_h800_multi_faces"),
          )
        : [],
    [seerrApi, castedRoles],
  );

  return (
    <ParallaxSlideShow
      data={castedRoles}
      images={backdrops}
      listHeader={t("seerr.appearances")}
      keyExtractor={(item) => item.id.toString()}
      logo={
        <Image
          key={details?.id}
          id={details?.id.toString()}
          className='rounded-full bottom-1'
          source={{
            uri: seerrApi?.imageProxy(
              details?.profilePath,
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
          <Text className='font-bold text-2xl mb-1'>{details?.name}</Text>
          <Text className='opacity-50'>
            {t("seerr.born")}{" "}
            {formatSeerrDate(details?.birthday, seerrLocaleTag(locale, region))}{" "}
            | {details?.placeOfBirth}
          </Text>
        </>
      )}
      MainContent={() => (
        <OverviewText text={details?.biography} className='mt-4' />
      )}
      renderItem={(item, _index) => <SeerrPoster item={item} />}
    />
  );
}
