import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { View, type ViewProps } from "react-native";
import { GenreTags } from "./GenreTags";
import { Ratings } from "./Ratings";
import { MoviesTitleHeader } from "./movies/MoviesTitleHeader";
import { EpisodeTitleHeader } from "./series/EpisodeTitleHeader";
import { ItemActions } from "./series/SeriesActions";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
}

export const ItemHeader: React.FC<Props> = ({ item, ...props }) => {
  if (!item)
    return (
      <View
        className='flex flex-col space-y-1.5 w-full items-start h-32'
        {...props}
      >
        <View className='w-1/3 h-6 bg-neutral-900 rounded' />
        <View className='w-2/3 h-8 bg-neutral-900 rounded' />
        <View className='w-2/3 h-4 bg-neutral-900 rounded' />
        <View className='w-1/4 h-4 bg-neutral-900 rounded' />
      </View>
    );

  return (
    <View className='flex flex-col' {...props}>
      <View className='flex flex-col' {...props}>
        <View className='flex flex-row items-center justify-between'>
          <Ratings item={item} className='mb-2' />
          <ItemActions item={item} />
        </View>
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
