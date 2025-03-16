import { Text } from "@/components/common/Text";
import { Image, type ImageContentFit } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

export const textShadowStyle = StyleSheet.create({
  shadow: {
    shadowColor: "#000",
    shadowOffset: {
      width: 1,
      height: 1,
    },
    shadowOpacity: 1,
    shadowRadius: 0.5,

    elevation: 6,
  },
});

const GenericSlideCard: React.FC<
  {
    id: string;
    url?: string;
    title?: string;
    colors?: string[];
    contentFit?: ImageContentFit;
  } & ViewProps
> = ({
  id,
  url,
  title,
  colors = ["#9333ea", "transparent"],
  contentFit = "contain",
  ...props
}) => (
  <>
    <LinearGradient
      colors={colors}
      start={{ x: 0.5, y: 1.75 }}
      end={{ x: 0.5, y: 0 }}
      className='rounded-xl'
    >
      <View className='rounded-xl' {...props}>
        <Image
          key={id}
          id={id}
          source={url ? { uri: url } : null}
          cachePolicy={"memory-disk"}
          contentFit={contentFit}
          style={{
            aspectRatio: "4/3",
          }}
        />
        {title && (
          <View className='absolute justify-center top-0 left-0 right-0 bottom-0 items-center'>
            <Text
              className='text-center font-bold'
              style={textShadowStyle.shadow}
            >
              {title}
            </Text>
          </View>
        )}
      </View>
    </LinearGradient>
  </>
);

export default GenericSlideCard;
