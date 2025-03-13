import { TouchableJellyseerrRouter } from "@/components/common/JellyseerrItemRouter";
import { Text } from "@/components/common/Text";
import JellyseerrMediaIcon from "@/components/jellyseerr/JellyseerrMediaIcon";
import JellyseerrStatusIcon from "@/components/jellyseerr/JellyseerrStatusIcon";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useJellyseerrCanRequest } from "@/utils/_jellyseerr/useJellyseerrCanRequest";
import { MovieResult, TvResult } from "@/utils/jellyseerr/server/models/Search";
import { Image } from "expo-image";
import { useMemo } from "react";
import { View, ViewProps, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import type { DownloadingItem } from "@/utils/jellyseerr/server/lib/downloadtracker";
import MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import { useTranslation } from "react-i18next";
import { MediaStatus } from "@/utils/jellyseerr/server/constants/media";
import { textShadowStyle } from "@/components/jellyseerr/discover/GenericSlideCard";
import { Colors } from "@/constants/Colors";
import { Tag, Tags } from "@/components/GenreTags";

interface Props extends ViewProps {
  item?: MovieResult | TvResult | MovieDetails | TvDetails;
  horizontal?: boolean;
  showDownloadInfo?: boolean;
  mediaRequest?: MediaRequest;
}

const JellyseerrPoster: React.FC<Props> = ({
  item,
  horizontal,
  showDownloadInfo,
  mediaRequest,
  ...props
}) => {
  const { jellyseerrApi, getTitle, getYear, getMediaType } = useJellyseerr();
  const loadingOpacity = useSharedValue(1);
  const imageOpacity = useSharedValue(0);
  const { t } = useTranslation();

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
  }));

  const handleImageLoad = () => {
    loadingOpacity.value = withTiming(0, { duration: 200 });
    imageOpacity.value = withTiming(1, { duration: 300 });
  };

  const backdropSrc = useMemo(
    () =>
      jellyseerrApi?.imageProxy(
        item?.backdropPath,
        "w1920_and_h800_multi_faces",
      ),
    [item, jellyseerrApi, horizontal],
  );

  const posterSrc = useMemo(
    () => jellyseerrApi?.imageProxy(item?.posterPath, "w300_and_h450_face"),
    [item, jellyseerrApi, horizontal],
  );

  const title = useMemo(() => getTitle(item), [item]);
  const releaseYear = useMemo(() => getYear(item), [item]);
  const mediaType = useMemo(() => getMediaType(item), [item]);

  const size = useMemo(() => (horizontal ? "h-28" : "w-28"), [horizontal]);
  const ratio = useMemo(() => (horizontal ? "15/10" : "10/15"), [horizontal]);

  const [canRequest] = useJellyseerrCanRequest(item);

  const is4k = useMemo(() => mediaRequest?.is4k === true, [mediaRequest]);

  const downloadItems = useMemo(
    () =>
      (is4k
        ? mediaRequest?.media.downloadStatus4k
        : mediaRequest?.media.downloadStatus) || [],
    [mediaRequest, is4k],
  );

  const progress = useMemo(() => {
    const [totalSize, sizeLeft] = downloadItems.reduce(
      (sum: number[], next: DownloadingItem) => [
        sum[0] + next.size,
        sum[1] + next.sizeLeft,
      ],
      [0, 0],
    );

    return ((totalSize - sizeLeft) / totalSize) * 100;
  }, [downloadItems]);

  const requestedSeasons: string[] | undefined = useMemo(() => {
    const seasons =
      mediaRequest?.seasons?.flatMap((s) => s.seasonNumber.toString()) || [];
    if (seasons.length > 4) {
      const [first, second, third, fourth, ...rest] = seasons;
      return [
        first,
        second,
        third,
        fourth,
        t("home.settings.plugins.jellyseerr.plus_n_more", { n: rest.length }),
      ];
    }
    return seasons;
  }, [mediaRequest]);

  const available = useMemo(() => {
    const status = mediaRequest?.media?.[is4k ? "status4k" : "status"];
    return status === MediaStatus.AVAILABLE;
  }, [mediaRequest, is4k]);

  // Add extra margin for TV platforms to improve focus visibility
  const containerStyle = Platform.isTV ? { margin: 8 } : {};

  return (
    <TouchableJellyseerrRouter
      result={item}
      mediaTitle={title}
      releaseYear={releaseYear}
      canRequest={canRequest}
      posterSrc={posterSrc!!}
      mediaType={mediaType}
      style={containerStyle}
    >
      <View className={`flex flex-col mr-2 h-auto`}>
        <View
          className={`relative rounded-lg overflow-hidden border border-neutral-900 ${size} aspect-[${ratio}]`}
        >
          <Animated.View style={imageAnimatedStyle}>
            <Image
              className="w-full"
              key={item?.id}
              id={item?.id.toString()}
              source={{ uri: horizontal ? backdropSrc : posterSrc }}
              cachePolicy={"memory-disk"}
              contentFit="cover"
              style={{
                aspectRatio: ratio,
                [horizontal ? "height" : "width"]: "100%",
              }}
              onLoad={handleImageLoad}
            />
          </Animated.View>
          {mediaRequest && showDownloadInfo && (
            <>
              <View
                className={`absolute w-full h-full bg-black ${!available ? "opacity-70" : "opacity-0"}`}
              />
              {!available && !Number.isNaN(progress) && (
                <>
                  <View
                    className="absolute left-0 h-full opacity-40"
                    style={{
                      width: `${progress || 0}%`,
                      backgroundColor: Colors.primaryRGB,
                    }}
                  />
                  <View className="absolute w-full h-full justify-center items-center">
                    <Text className="font-bold" style={textShadowStyle.shadow}>
                      {progress?.toFixed(0)}%
                    </Text>
                  </View>
                </>
              )}
              <Tag
                className="absolute right-1 top-1 text-right bg-black border border-neutral-800/50"
                text={mediaRequest?.requestedBy.displayName}
              />
              {requestedSeasons.length > 0 && (
                <Tags
                  className="absolute bottom-1 left-0.5 w-32"
                  tagProps={{
                    className: "bg-black rounded-full px-1",
                  }}
                  tags={requestedSeasons}
                />
              )}
            </>
          )}
          <JellyseerrStatusIcon
            className="absolute bottom-1 right-1"
            showRequestIcon={canRequest}
            mediaStatus={mediaRequest?.media?.status || item?.mediaInfo?.status}
          />
          <JellyseerrMediaIcon
            className="absolute top-1 left-1"
            mediaType={mediaType}
          />
        </View>
      </View>
      <View className={`mt-2 flex flex-col ${horizontal ? "w-44" : "w-28"}`}>
        <Text numberOfLines={2}>{title || ""}</Text>
        <Text className="text-xs opacity-50 align-bottom">
          {releaseYear || ""}
        </Text>
      </View>
    </TouchableJellyseerrRouter>
  );
};

export default JellyseerrPoster;
