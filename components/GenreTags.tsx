// GenreTags.tsx
import React from "react";
import { StyleProp, TextStyle, View, ViewProps } from "react-native";
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
  return (
    <View className="bg-neutral-800 rounded-full px-2 py-1" {...props}>
      <Text className={textClass} style={textStyle}>
        {text}
      </Text>
    </View>
  );
};

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
    <View className="mt-2">
      <Tags tags={genres} />
    </View>
  );
};
