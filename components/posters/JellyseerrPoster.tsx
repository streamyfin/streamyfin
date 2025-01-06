import { View, ViewProps } from "react-native";
import { Image } from "expo-image";
import { Text } from "@/components/common/Text";
import { useMemo } from "react";
import { MovieResult, TvResult } from "@/utils/jellyseerr/server/models/Search";
import {
  MediaStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import {
  hasPermission,
  Permission,
} from "@/utils/jellyseerr/server/lib/permissions";
import { TouchableJellyseerrRouter } from "@/components/common/JellyseerrItemRouter";
import JellyseerrStatusIcon from "@/components/jellyseerr/JellyseerrStatusIcon";
import JellyseerrMediaIcon from "@/components/jellyseerr/JellyseerrMediaIcon";
import { useJellyseerrCanRequest } from "@/utils/_jellyseerr/useJellyseerrCanRequest";
interface Props extends ViewProps {
  item: MovieResult | TvResult;
}

const JellyseerrPoster: React.FC<Props> = ({ item, ...props }) => {
  const { jellyseerrApi } = useJellyseerr();

  const imageSrc = useMemo(
    () => jellyseerrApi?.imageProxy(item.posterPath, "w300_and_h450_face"),
    [item, jellyseerrApi]
  );
  const title = useMemo(
    () => (item.mediaType === MediaType.MOVIE ? item.title : item.name),
    [item]
  );
  const releaseYear = useMemo(
    () =>
      new Date(
        item.mediaType === MediaType.MOVIE
          ? item.releaseDate
          : item.firstAirDate
      ).getFullYear(),
    [item]
  );

  const canRequest = useJellyseerrCanRequest(item);

  return (
    <TouchableJellyseerrRouter
      result={item}
      mediaTitle={title}
      releaseYear={releaseYear}
      canRequest={canRequest}
      posterSrc={imageSrc!!}
    >
      <View className="flex flex-col w-28 mr-2">
        <View className="relative rounded-lg overflow-hidden border border-neutral-900 w-28 aspect-[10/15]">
          <Image
            key={item.id}
            id={item.id.toString()}
            source={{ uri: imageSrc }}
            cachePolicy={"memory-disk"}
            contentFit="cover"
            style={{
              aspectRatio: "10/15",
              width: "100%",
            }}
          />
          <JellyseerrStatusIcon
            className="absolute bottom-1 right-1"
            showRequestIcon={canRequest}
            mediaStatus={item?.mediaInfo?.status}
          />

          <JellyseerrMediaIcon
            className="absolute top-1 left-1"
            mediaType={item?.mediaType}
          />
        </View>
        <View className="mt-2 flex flex-col">
          <Text numberOfLines={2}>{title}</Text>
          <Text className="text-xs opacity-50 align-bottom">{releaseYear}</Text>
        </View>
      </View>
    </TouchableJellyseerrRouter>
  );
};

export default JellyseerrPoster;
