import type { ImageContentFit } from "expo-image";
import type React from "react";
import { View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { textShadowStyle } from "@/components/seerr/discover/GenericSlideCard";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import { SEERR_TV_SLIDE_CARD_WIDTH } from "@/constants/Seerr";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

/**
 * A genre's or a company's card in a TV Discover row, as the phone's
 * (GenericSlideCard): its picture, and a genre's name over it.
 */
export const TVSeerrSlideCard: React.FC<{
  imageUrl?: string;
  title?: string;
  contentFit: ImageContentFit;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}> = ({ imageUrl, title, contentFit, onPress, hasTVPreferredFocus }) => {
  const typography = useScaledTVTypography();
  const width = scaleSize(SEERR_TV_SLIDE_CARD_WIDTH);

  return (
    <TVFocusablePoster
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <View
        style={{
          width,
          aspectRatio: 4 / 3,
          borderRadius: scaleSize(20),
          overflow: "hidden",
          backgroundColor: "#262626",
          // A logo keeps its margins; a genre's picture fills the card.
          padding: contentFit === "contain" ? scaleSize(28) : 0,
        }}
      >
        <Image
          source={imageUrl ? { uri: imageUrl } : null}
          cachePolicy='memory-disk'
          contentFit={contentFit}
          style={{ width: "100%", height: "100%" }}
        />
        {!!title && (
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={[
                textShadowStyle.shadow,
                {
                  fontSize: typography.heading,
                  fontWeight: "bold",
                  color: "white",
                  textAlign: "center",
                },
              ]}
            >
              {title}
            </Text>
          </View>
        )}
      </View>
    </TVFocusablePoster>
  );
};
