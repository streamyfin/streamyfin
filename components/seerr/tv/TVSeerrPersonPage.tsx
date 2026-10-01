import type React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { TVSeerrPosterCard } from "@/components/tv/TVSeerrPosterCard";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrPerson } from "@/hooks/useSeerrPerson";
import { scaleSize } from "@/utils/scaleSize";
import { formatSeerrDate, seerrLocaleTag } from "@/utils/seerr/dates";

const ITEM_GAP = 20;
// The biography's lines before it is cut, a remote having no "Show more".
const BIOGRAPHY_LINES = 4;

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
  const photo = scaleSize(200);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + 100,
        paddingBottom: insets.bottom + 60,
        paddingHorizontal: sizes.padding.horizontal,
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
          {!!(details?.birthday || details?.placeOfBirth) && (
            <Text style={{ fontSize: typography.callout, color: "#9CA3AF" }}>
              {[
                details?.birthday &&
                  `${t("seerr.born")} ${formatSeerrDate(
                    details.birthday,
                    seerrLocaleTag(locale, region),
                  )}`,
                details?.placeOfBirth,
              ]
                .filter(Boolean)
                .join(" | ")}
            </Text>
          )}
          {!!details?.biography && (
            <Text
              numberOfLines={BIOGRAPHY_LINES}
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
          gap: ITEM_GAP,
        }}
      >
        {roles.map((role, index) => (
          <TVSeerrPosterCard
            key={role.id}
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
