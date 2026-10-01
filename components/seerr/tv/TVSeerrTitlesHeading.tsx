import type React from "react";
import { View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useSeerr } from "@/hooks/useSeerr";
import { scaleSize } from "@/utils/scaleSize";
import { COMPANY_LOGO_IMAGE_FILTER } from "@/utils/seerr/data";

/** A TV titles page's heading: a company's logo, or a genre's name. */
export const TVSeerrTitlesHeading: React.FC<{
  text: string;
  logo?: string;
}> = ({ text, logo }) => {
  const typography = useScaledTVTypography();
  const { seerrApi } = useSeerr();

  if (logo)
    return (
      <View style={{ alignItems: "center" }}>
        <Image
          source={{
            uri: seerrApi?.imageProxy(logo, COMPANY_LOGO_IMAGE_FILTER),
          }}
          accessibilityLabel={text}
          cachePolicy='memory-disk'
          contentFit='contain'
          style={{ width: scaleSize(360), height: scaleSize(140) }}
        />
      </View>
    );
  return (
    <Text
      style={{
        fontSize: typography.title,
        fontWeight: "bold",
        color: "white",
        textAlign: "center",
      }}
    >
      {text}
    </Text>
  );
};
