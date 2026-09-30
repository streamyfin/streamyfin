import { useMemo } from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { TouchableSeerrRouter } from "@/components/common/SeerrItemRouter";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import SeerrMediaIcon from "@/components/seerr/SeerrMediaIcon";
import SeerrStatusIcon from "@/components/seerr/SeerrStatusIcon";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrCanRequest } from "@/hooks/useSeerrCanRequest";
import type {
  MovieDetails,
  MovieResult,
  PersonCreditCast,
  TvDetails,
  TvResult,
} from "@/utils/seerr/types";

interface Props extends ViewProps {
  item?: MovieResult | TvResult | MovieDetails | TvDetails | PersonCreditCast;
  horizontal?: boolean;
}

const SeerrPoster: React.FC<Props> = ({ item, horizontal }) => {
  const { seerrApi, getTitle, getYear, getMediaType } = useSeerr();
  const loadingOpacity = useSharedValue(1);
  const imageOpacity = useSharedValue(0);

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
  }));

  const handleImageLoad = () => {
    loadingOpacity.value = withTiming(0, { duration: 200 });
    imageOpacity.value = withTiming(1, { duration: 300 });
  };

  const backdropSrc = useMemo(
    () =>
      seerrApi?.imageProxy(item?.backdropPath, "w1920_and_h800_multi_faces"),
    [item, seerrApi, horizontal],
  );

  const posterSrc = useMemo(
    () => seerrApi?.imageProxy(item?.posterPath, "w300_and_h450_face"),
    [item, seerrApi, horizontal],
  );

  const title = useMemo(() => getTitle(item), [item]);
  const releaseYear = useMemo(() => getYear(item), [item]);
  const mediaType = useMemo(() => getMediaType(item), [item]);

  const size = useMemo(() => (horizontal ? "h-28" : "w-28"), [horizontal]);
  const ratio = useMemo(() => (horizontal ? "15/10" : "10/15"), [horizontal]);

  const [canRequest] = useSeerrCanRequest(item);

  return (
    <TouchableSeerrRouter
      result={item}
      mediaTitle={title}
      releaseYear={releaseYear}
      canRequest={canRequest}
      posterSrc={posterSrc!}
      mediaType={mediaType}
    >
      <View className={"flex flex-col mr-2 h-auto"}>
        <View
          className={`relative rounded-lg overflow-hidden border border-neutral-900 ${size} aspect-[${ratio}]`}
        >
          <Animated.View style={imageAnimatedStyle}>
            <Image
              className='w-full'
              key={item?.id}
              id={item?.id.toString()}
              source={{ uri: horizontal ? backdropSrc : posterSrc }}
              cachePolicy={"memory-disk"}
              contentFit='cover'
              style={{
                aspectRatio: ratio,
                [horizontal ? "height" : "width"]: "100%",
              }}
              onLoad={handleImageLoad}
            />
          </Animated.View>
          {/* Placed by a wrapper: the icon hands its className to the view
              inside its button, which left the button below the image, where
              the card cut the icon off. Both badges sit on top, as on Seerr's
              title cards. */}
          <View className='absolute top-1 right-1'>
            <SeerrStatusIcon
              small
              showRequestIcon={canRequest}
              mediaStatus={item?.mediaInfo?.status}
            />
          </View>
          <SeerrMediaIcon
            small
            className='absolute top-1 left-1'
            mediaType={mediaType}
          />
        </View>
      </View>
      <View className={`mt-2 flex flex-col ${horizontal ? "w-44" : "w-28"}`}>
        <Text numberOfLines={2}>{title || ""}</Text>
        <Text className='text-xs opacity-50 align-bottom'>
          {releaseYear || ""}
        </Text>
      </View>
    </TouchableSeerrRouter>
  );
};

export default SeerrPoster;
