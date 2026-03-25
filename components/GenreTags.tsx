// GenreTags.tsx
import type React from "react";
import {
  Platform,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  View,
  type ViewProps,
} from "react-native";

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
  if (Platform.OS === "ios") {
    return (
      <View>
        <View style={styles.glass}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text>{text}</Text>
          </View>
        </View>
      </View>
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
      className={`flex flex-row flex-wrap gap-1 ${props.className}`}
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
