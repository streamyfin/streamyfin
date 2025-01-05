import { View, ViewProps } from "react-native";
import { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import React from "react";
import { FlashList } from "@shopify/flash-list";
import { Text } from "@/components/common/Text";
import PersonPoster from "@/components/jellyseerr/PersonPoster";

const CastSlide: React.FC<
  { details?: MovieDetails | TvDetails } & ViewProps
> = ({ details, ...props }) => {
  return (
    details?.credits?.cast?.length &&
    details?.credits?.cast?.length > 0 && (
      <View {...props}>
        <Text className="text-lg font-bold mb-2">Cast</Text>
        <FlashList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={details?.credits.cast}
          ItemSeparatorComponent={() => <View className="w-2" />}
          estimatedItemSize={15}
          keyExtractor={(item) => item?.id?.toString()}
          renderItem={({ item }) => (
            <PersonPoster
              id={item.id.toString()}
              posterPath={item.profilePath}
              name={item.name}
              subName={item.character}
            />
          )}
        />
      </View>
    )
  );
};

export default CastSlide;
