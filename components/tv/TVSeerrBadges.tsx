import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import type React from "react";
import { View } from "react-native";
import {
  SeerrMediaBadgeColors,
  SeerrStatusBadgeColors,
} from "@/constants/Colors";
import { SEERR_TV_BADGE_INSET, SEERR_TV_BADGE_SIZE } from "@/constants/Seerr";
import { scaleSize } from "@/utils/scaleSize";
import { seerrStatusBadge } from "@/utils/seerr/statusBadge";
import { type MediaStatus, MediaType } from "@/utils/seerr/types";

/**
 * Seerr's two badges over a poster, as the phone draws them (SeerrPoster):
 * the type at the top left, where the title stands at the top right.
 */
export const TVSeerrBadges: React.FC<{
  mediaType?: "movie" | "tv";
  status?: MediaStatus;
  canRequest: boolean;
}> = ({ mediaType, status, canRequest }) => {
  const size = scaleSize(SEERR_TV_BADGE_SIZE);
  const inset = scaleSize(SEERR_TV_BADGE_INSET);
  const badge = seerrStatusBadge(status, canRequest);
  const type =
    mediaType === MediaType.MOVIE
      ? SeerrMediaBadgeColors.movie
      : mediaType === MediaType.TV
        ? SeerrMediaBadgeColors.tv
        : undefined;
  const circle = {
    position: "absolute",
    top: inset,
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: "center",
    justifyContent: "center",
  } as const;

  return (
    <>
      {type && (
        <View
          pointerEvents='none'
          style={[
            circle,
            {
              left: inset,
              backgroundColor: type.background,
              borderWidth: 1,
              borderColor: type.border,
            },
          ]}
        >
          {mediaType === MediaType.MOVIE ? (
            <MaterialCommunityIcons
              name='movie-open'
              size={size * 0.55}
              color='white'
            />
          ) : (
            <Feather name='tv' size={size * 0.55} color='white' />
          )}
        </View>
      )}
      {badge && (
        <View
          pointerEvents='none'
          style={[
            circle,
            {
              right: inset,
              backgroundColor: SeerrStatusBadgeColors[badge.tone],
            },
          ]}
        >
          <MaterialCommunityIcons
            name={badge.icon}
            size={size * 0.62}
            color='white'
          />
        </View>
      )}
    </>
  );
};
