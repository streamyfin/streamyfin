// GenreTags.tsx
import React from "react";
import { View } from "react-native";
import { Text } from "./common/Text";

interface GenreTagsProps {
  genres?: string[];
}

export const GenreTags: React.FC<GenreTagsProps> = ({ genres }) => {
  if (!genres || genres.length === 0) return null;

  return (
    <View className="flex flex-row flex-wrap mt-2">
      {genres.map((genre, idx) => (
        <View key={idx} className="bg-neutral-800 rounded-full px-2 py-1 mr-1">
          <Text className="text-xs">{genre}</Text>
        </View>
      ))}
    </View>
  );
};
