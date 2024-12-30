import {View, ViewProps} from "react-native";
import {Image} from "expo-image";
import {MaterialCommunityIcons} from "@expo/vector-icons";
import {Text} from "@/components/common/Text";
import {useEffect, useMemo, useState} from "react";
import {MovieResult, Results, TvResult} from "@/utils/jellyseerr/server/models/Search";
import {MediaStatus, MediaType} from "@/utils/jellyseerr/server/constants/media";
import {useJellyseerr} from "@/hooks/useJellyseerr";
import {hasPermission, Permission} from "@/utils/jellyseerr/server/lib/permissions";
import {TouchableJellyseerrRouter} from "@/components/common/JellyseerrItemRouter";
import JellyseerrIconStatus from "@/components/icons/JellyseerrIconStatus";
interface Props extends ViewProps {
  item: MovieResult | TvResult;
}

const JellyseerrPoster: React.FC<Props> = ({
  item,
  ...props
}) => {
  const {jellyseerrUser, jellyseerrApi} = useJellyseerr();
  // const imageSource =

  const imageSrc = useMemo(() =>
      item.posterPath ?
        `https://image.tmdb.org/t/p/w300_and_h450_face${item.posterPath}`
        : jellyseerrApi?.axios?.defaults.baseURL + `/images/overseerr_poster_not_found_logo_top.png`,
    [item, jellyseerrApi]
  )
  const title = useMemo(() => item.mediaType === MediaType.MOVIE ? item.title : item.name, [item])
  const releaseYear = useMemo(() =>
    new Date(item.mediaType === MediaType.MOVIE ? item.releaseDate : item.firstAirDate).getFullYear(),
    [item]
  )

  const showRequestButton = useMemo(() =>
    jellyseerrUser && hasPermission(
      [
        Permission.REQUEST,
        item.mediaType === 'movie'
          ? Permission.REQUEST_MOVIE
          : Permission.REQUEST_TV,
      ],
      jellyseerrUser.permissions,
      {type: 'or'}
    ),
    [item, jellyseerrUser]
  )

  const canRequest = useMemo(() => {
    const status = item?.mediaInfo?.status
    return showRequestButton && !status || status === MediaStatus.UNKNOWN
  }, [item])

  return (
    <TouchableJellyseerrRouter
      result={item}
      mediaTitle={title}
      releaseYear={releaseYear}
      canRequest={canRequest}
      posterSrc={imageSrc}
    >
      <View className="flex flex-col w-28 mr-2">
        <View className="relative rounded-lg overflow-hidden border border-neutral-900 w-28 aspect-[10/15]">
          <Image
            key={item.id}
            id={item.id.toString()}
            source={{uri: imageSrc}}
            cachePolicy={"memory-disk"}
            contentFit="cover"
            style={{
              aspectRatio: "10/15",
              width: "100%",
            }}
          />
          <JellyseerrIconStatus
            className="absolute bottom-1 right-1"
            showRequestIcon={canRequest}
            mediaStatus={item?.mediaInfo?.status}
          />

        </View>
        <View className="mt-2 flex flex-col">
          <Text numberOfLines={2}>{title}</Text>
          <Text className="text-xs opacity-50">{releaseYear}</Text>
        </View>
      </View>
    </TouchableJellyseerrRouter>
  )
}


export default JellyseerrPoster;