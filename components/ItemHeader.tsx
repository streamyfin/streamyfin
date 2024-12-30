import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { View, ViewProps } from "react-native";
import { MoviesTitleHeader } from "./movies/MoviesTitleHeader";
import { Ratings } from "./Ratings";
import { EpisodeTitleHeader } from "./series/EpisodeTitleHeader";
import { GenreTags } from "./GenreTags";
import React from "react";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
}

export const ItemHeader: React.FC<Props> = ({ item, ...props }) => {
  if (!item)
    return (
      <View
        className="flex flex-col space-y-1.5 w-full items-start h-32"
        {...props}
      >
        <View className="w-1/3 h-6 bg-neutral-900 rounded" />
        <View className="w-2/3 h-8 bg-neutral-900 rounded" />
        <View className="w-2/3 h-4 bg-neutral-900 rounded" />
        <View className="w-1/4 h-4 bg-neutral-900 rounded" />
      </View>
    );

  return (
    <View className="flex flex-col" {...props}>
      <View className="flex flex-col" {...props}>
        <Ratings item={item} className="mb-2" />
        {item.Type === "Episode" && (
          <>
            <EpisodeTitleHeader item={item} />
            <GenreTags genres={item.Genres!} />
          </>
        )}
        {item.Type === "Movie" && (
          <>
            <MoviesTitleHeader item={item} />
            <GenreTags genres={item.Genres!} />
          </>
        )}
      </View>
    </View>
  );
};
