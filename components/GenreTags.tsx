// GenreTags.tsx
import React from "react";
import {View, ViewProps} from "react-native";
import { Text } from "./common/Text";

interface TagProps {
  tags?: string[];
  textClass?: ViewProps["className"]
}

export const Tags: React.FC<TagProps & ViewProps> = ({ tags, textClass = "text-xs", ...props }) => {
  if (!tags || tags.length === 0) return null;

  return (
    <View className={`flex flex-row flex-wrap gap-1 ${props.className}`} {...props}>
      {tags.map((genre, idx) => (
        <View key={idx} className="bg-neutral-800 rounded-full px-2 py-1">
          <Text className={textClass}>{genre}</Text>
        </View>
      ))}
    </View>
  );
};

export const GenreTags: React.FC<{ genres?: string[]}> = ({ genres }) => {
  return (
    <View className="mt-2">
      <Tags tags={genres}/>
    </View>
  );
};
