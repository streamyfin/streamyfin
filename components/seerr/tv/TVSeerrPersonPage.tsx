import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { TVSeerrPosterCard } from "@/components/tv/TVSeerrPosterCard";
import {
  SEERR_TV_BIOGRAPHY_LINES,
  SEERR_TV_PERSON_PHOTO,
  SEERR_TV_PERSON_ROLES_STEP,
  SEERR_TV_ROW_CARD_GAP,
} from "@/constants/Seerr";
import {
  TV_GRID_LOAD_MORE_DISTANCE,
  useScaledTVSizes,
} from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrPerson } from "@/hooks/useSeerrPerson";
import { scaleSize } from "@/utils/scaleSize";
import { seerrLocaleTag } from "@/utils/seerr/dates";
import { birthLine, roleKey } from "@/utils/seerr/person";

/**
 * A person on the TV, as the phone's page has them: their photo, name, birth
 * and biography, then the titles they played in, as posters the remote can
 * reach.
 */
export const TVSeerrPersonPage: React.FC<{ personId: string }> = ({
  personId,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sizes = useScaledTVSizes();
  const typography = useScaledTVTypography();
  const router = useRouter();
  const { seerrApi, seerrRegion: region, seerrLocale: locale } = useSeerr();
  const { details, roles } = useSeerrPerson(personId);
  const born = birthLine(t, details, seerrLocaleTag(locale, region));
  const photo = scaleSize(SEERR_TV_PERSON_PHOTO);
  // Every poster of a TV grid is mounted: a prolific actor's few hundred
  // roles come a step at a time as the grid scrolls down.
  const [shown, setShown] = useState(SEERR_TV_PERSON_ROLES_STEP);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + 100,
        paddingBottom: insets.bottom + 60,
        paddingHorizontal: sizes.padding.horizontal,
      }}
      scrollEventThrottle={64}
      onScroll={({
        nativeEvent: { layoutMeasurement, contentOffset, contentSize },
      }) => {
        if (
          shown < roles.length &&
          layoutMeasurement.height + contentOffset.y >=
            contentSize.height - scaleSize(TV_GRID_LOAD_MORE_DISTANCE)
        )
          setShown((count) => count + SEERR_TV_PERSON_ROLES_STEP);
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: scaleSize(40),
          marginBottom: scaleSize(48),
        }}
      >
        <Image
          source={{
            uri: seerrApi?.imageProxy(
              details?.profilePath,
              "w600_and_h600_bestv2",
            ),
          }}
          cachePolicy='memory-disk'
          contentFit='cover'
          style={{ width: photo, height: photo, borderRadius: photo / 2 }}
        />
        <View style={{ flex: 1, gap: scaleSize(12) }}>
          <Text
            style={{
              fontSize: typography.title,
              fontWeight: "bold",
              color: "white",
            }}
          >
            {details?.name}
          </Text>
          {!!born && (
            <Text style={{ fontSize: typography.callout, color: "#9CA3AF" }}>
              {born}
            </Text>
          )}
          {!!details?.biography && (
            <Text
              numberOfLines={SEERR_TV_BIOGRAPHY_LINES}
              style={{
                fontSize: typography.callout,
                color: "rgba(255,255,255,0.8)",
              }}
            >
              {details.biography}
            </Text>
          )}
        </View>
      </View>
      {roles.length > 0 && (
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "bold",
            color: "white",
            marginBottom: scaleSize(24),
          }}
        >
          {t("seerr.appearances")}
        </Text>
      )}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: scaleSize(SEERR_TV_ROW_CARD_GAP),
        }}
      >
        {roles.slice(0, shown).map((role, index) => (
          <TVSeerrPosterCard
            key={roleKey(role)}
            item={role}
            hasTVPreferredFocus={index === 0}
            onPress={() =>
              router.push({
                pathname: "/(auth)/(tabs)/(search)/seerr/page",
                params: { id: String(role.id), mediaType: role.mediaType },
              })
            }
          />
        ))}
      </View>
    </ScrollView>
  );
};
