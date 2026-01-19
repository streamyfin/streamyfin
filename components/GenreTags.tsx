// GenreTags.tsx
import { BlurView } from "expo-blur";
import type React from "react";
import {
  Platform,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  View,
  type ViewProps,
} from "react-native";
import { GlassEffectView } from "react-native-glass-effect-view";
import { TVTypography } from "@/constants/TVTypography";
import { Text } from "./common/Text";

interface TagProps {
  tags?: string[];
  textClass?: ViewProps["className"];
}

export const Tag: React.FC<
  {
    text: string;
    textClass?: ViewProps["className"];
    textStyle?: StyleProp<TextStyle>;
  } & ViewProps
> = ({ text, textClass, textStyle, ...props }) => {
  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <View>
        <GlassEffectView style={styles.glass}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text>{text}</Text>
          </View>
        </GlassEffectView>
      </View>
    );
  }

  // TV-specific styling with blur background
  if (Platform.isTV) {
    return (
      <BlurView
        intensity={10}
        tint='light'
        style={{
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: "rgba(0,0,0,0.3)",
          }}
        >
          <Text style={{ fontSize: TVTypography.callout, color: "#E5E7EB" }}>
            {text}
          </Text>
        </View>
      </BlurView>
    );
  }

  return (
    <View className='bg-neutral-800 rounded-full px-2 py-1' {...props}>
      <Text className={textClass} style={textStyle}>
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    borderRadius: 50,
  },
  glass: {
    borderRadius: 50,
  },
});

export const Tags: React.FC<
  TagProps & { tagProps?: ViewProps } & ViewProps
> = ({ tags, textClass = "text-xs", tagProps, ...props }) => {
  if (!tags || tags.length === 0) return null;

  return (
    <View
      className={`flex flex-row flex-wrap ${props.className}`}
      style={{ gap: Platform.isTV ? 12 : 4 }}
      {...props}
    >
      {tags.map((tag, idx) => (
        <View key={idx}>
          <Tag key={idx} textClass={textClass} text={tag} {...tagProps} />
        </View>
      ))}
    </View>
  );
};

export const GenreTags: React.FC<{ genres?: string[] }> = ({ genres }) => {
  return (
    <View className='mt-2'>
      <Tags tags={genres} />
    </View>
  );
};
