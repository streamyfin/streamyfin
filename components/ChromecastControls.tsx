import React, { useMemo, useRef, useState } from "react";
import { Alert, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Feather, Ionicons } from "@expo/vector-icons";
import { RoundButton } from "@/components/RoundButton";

import {
  CastButton,
  CastContext,
  MediaInfo,
  MediaStatus,
  RemoteMediaClient,
  useStreamPosition,
} from "react-native-google-cast";
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { Image } from "expo-image";
import { Slider } from "react-native-awesome-slider";
import {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
import { debounce } from "lodash";
import { useSettings } from "@/utils/atoms/settings";
import { useHaptic } from "@/hooks/useHaptic";
import { writeToLog } from "@/utils/log";
import { formatTimeString } from "@/utils/time";
import { BlurView } from "expo-blur";
import SkipButton from "@/components/video-player/controls/SkipButton";
import NextEpisodeCountDownButton from "@/components/video-player/controls/NextEpisodeCountDownButton";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useAdjacentItems } from "@/hooks/useAdjacentEpisodes";
import { useTrickplay } from "@/hooks/useTrickplay";
import { secondsToTicks } from "@/utils/secondsToTicks";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { chromecastLoadMedia } from "@/utils/chromecastLoadMedia";
import { useAtomValue } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getParentBackdropImageUrl } from "@/utils/jellyfin/image/getParentBackdropImageUrl";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { chromecastProfile } from "@/utils/profiles/chromecast";
import { SelectedOptions } from "./ItemContent";
import {
  getDefaultPlaySettings,
  previousIndexes,
} from "@/utils/jellyfin/getDefaultPlaySettings";
import { useQuery } from "@tanstack/react-query";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useTranslation } from "react-i18next";
import { Colors } from "@/constants/Colors";
import { useRouter } from "expo-router";

const ANDROID_EXPERIMENTAL_BLUR: boolean =
  process.env.ANDROID_EXPERIMENTAL_BLUR === "true";

const BLURHASH =
  "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[";

export default function ChromecastControls({
  mediaStatus,
  client,
}: {
  mediaStatus: MediaStatus;
  client: RemoteMediaClient;
}) {
  const lightHapticFeedback = useHaptic("light");

  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const [settings] = useSettings();

  const [currentTime, setCurrentTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(Infinity);
  const max = useSharedValue(mediaStatus.mediaInfo?.streamDuration || 0);

  const streamPosition = useStreamPosition();
  const progress = useSharedValue(streamPosition || 0);

  const wasPlayingRef = useRef(false);

  const isSeeking = useSharedValue(false);
  const isPlaying = useMemo(
    () => mediaStatus.playerState === "playing",
    [mediaStatus.playerState]
  );
  const isBufferingOrLoading = useMemo(
    () =>
      mediaStatus.playerState === null ||
      mediaStatus.playerState === "buffering" ||
      mediaStatus.playerState === "loading",
    [mediaStatus.playerState]
  );

  // request update of media status every player state change
  useEffect(() => {
    client.requestStatus();
  }, [mediaStatus.playerState]);

  // update progess on stream position change
  useEffect(() => {
    if (streamPosition) progress.value = streamPosition;
  }, [streamPosition]);

  // update max progress
  useEffect(() => {
    if (mediaStatus.mediaInfo?.streamDuration)
      max.value = mediaStatus.mediaInfo?.streamDuration;
  }, [mediaStatus.mediaInfo?.streamDuration]);

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      setCurrentTime(currentProgress);
      setRemainingTime(maxValue - currentProgress);
    },
    []
  );

  useAnimatedReaction(
    () => ({
      progress: progress.value,
      max: max.value,
      isSeeking: isSeeking.value,
    }),
    (result) => {
      if (result.isSeeking === false) {
        runOnJS(updateTimes)(result.progress, result.max);
      }
    },
    [updateTimes]
  );

  const { mediaMetadata, itemId } = useMemo(
    () => ({
      mediaMetadata: mediaStatus.mediaInfo?.metadata,
      itemId: mediaStatus.mediaInfo?.contentId,
    }),
    [mediaStatus]
  );

  const type = useMemo(
    () => mediaMetadata?.type || "generic",
    [mediaMetadata?.type]
  );
  const images = useMemo(
    () => mediaMetadata?.images || [],
    [mediaMetadata?.images]
  );

  const { playbackOptions } = useMemo(() => {
    const mediaCustomData = mediaStatus.mediaInfo?.customData as
      | { playbackOptions: SelectedOptions }
      | undefined;

    return (
      mediaCustomData || {
        playbackOptions: undefined,
      }
    );
  }, [mediaStatus.mediaInfo?.customData]);

  const {
    data: item,
    // currently nothing is indicating that item is loading, because most of the time it loads very fast
    isLoading: isLoadingItem,
    isError: isErrorItem,
    error,
    refetch,
  } = useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      if (!itemId) return;
      const res = await getUserLibraryApi(api!).getItem({
        itemId,
        userId: user?.Id,
      });

      return res.data;
    },
    enabled: !!itemId,
    staleTime: 0,
  });

  const { previousItem, nextItem } = useAdjacentItems({
    item: {
      Id: itemId,
      SeriesId: item?.SeriesId,
      Type: item?.Type,
    },
  });

  const goToItem = useCallback(
    async (item: BaseItemDto) => {
      if (!api) {
        console.warn("Failed to go to item: No api!");
        return;
      }

      const previousIndexes: previousIndexes = {
        subtitleIndex: playbackOptions?.subtitleIndex || undefined,
        audioIndex: playbackOptions?.audioIndex || undefined,
      };

      const {
        mediaSource,
        audioIndex: defaultAudioIndex,
        subtitleIndex: defaultSubtitleIndex,
      } = getDefaultPlaySettings(item, settings, previousIndexes, undefined);

      // Get a new URL with the Chromecast device profile:
      const data = await getStreamUrl({
        api,
        item,
        deviceProfile: chromecastProfile,
        startTimeTicks: item?.UserData?.PlaybackPositionTicks!,
        userId: user?.Id,
        audioStreamIndex: defaultAudioIndex,
        // maxStreamingBitrate: playbackOptions.bitrate?.value,   // TODO handle bitrate limit
        subtitleStreamIndex: defaultSubtitleIndex,
        mediaSourceId: mediaSource?.Id,
      });

      if (!data?.url) {
        console.warn("No URL returned from getStreamUrl", data);
        Alert.alert("Client error", "Could not create stream for Chromecast");
        return;
      }

      await chromecastLoadMedia({
        client,
        item,
        contentUrl: data.url,
        playbackOptions,
        images: [
          {
            url: getParentBackdropImageUrl({
              api,
              item,
              quality: 90,
              width: 2000,
            })!,
          },
        ],
      });

      await client.requestStatus();
    },
    [client, api]
  );

  const goToNextItem = useCallback(() => {
    if (!nextItem) {
      console.warn("Failed to skip to next item: No next item!");
      return;
    }
    lightHapticFeedback();
    goToItem(nextItem);
  }, [nextItem, lightHapticFeedback]);

  const goToPreviousItem = useCallback(() => {
    if (!previousItem) {
      console.warn("Failed to skip to next item: No next item!");
      return;
    }
    lightHapticFeedback();
    goToItem(previousItem);
  }, [previousItem, lightHapticFeedback]);

  const pause = useCallback(() => {
    client.pause();
  }, [client]);

  const play = useCallback(() => {
    client.play();
  }, [client]);

  const seek = useCallback(
    (time: number) => {
      // skip to next episode if seeking to end (for credit skipping)
      // with 1 second room to react
      if (nextItem && time >= max.value - 1) {
        goToNextItem();
        return;
      }
      client.seek({
        position: time,
      });
    },
    [client, goToNextItem, nextItem, max]
  );

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const handleSkipBackward = useCallback(async () => {
    if (!settings?.rewindSkipTime) return;
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = Math.max(0, curr - settings.rewindSkipTime);
        seek(newTime);
        if (wasPlayingRef.current === true) play();
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video backwards", error);
    }
  }, [settings, isPlaying]);

  const handleSkipForward = useCallback(async () => {
    if (!settings?.forwardSkipTime) return;
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = curr + settings.forwardSkipTime;
        seek(Math.max(0, newTime));
        if (wasPlayingRef.current === true) play();
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video forwards", error);
    }
  }, [settings, isPlaying]);

  const { showSkipButton, skipIntro } = useIntroSkipper(
    itemId,
    currentTime,
    seek,
    play,
    false
  );

  const { showSkipCreditButton, skipCredit } = useCreditSkipper(
    itemId,
    currentTime,
    seek,
    play,
    false
  );

  const ItemInfo = useMemo(() => {
    switch (type) {
      case "generic":
        return <GenericInfo mediaMetadata={mediaMetadata} />;
      case "movie":
        return <MovieInfo mediaMetadata={mediaMetadata} />;
      case "tvShow":
        return <TvShowInfo mediaMetadata={mediaMetadata} item={item} />;
      default:
        return <Text>{type} not implemented yet!</Text>;
    }
  }, [type, mediaMetadata, item]);

  // Android requires the cast button to be present for startDiscovery to work
  const AndroidCastButton = useCallback(
    () =>
      Platform.OS === "android" ? (
        <CastButton tintColor="transparent" />
      ) : (
        <></>
      ),
    [Platform.OS]
  );

  const title = useMemo(
    () => mediaMetadata?.title || "Title not found!",
    [mediaMetadata?.title]
  );

  const TrickplaySliderMemoized = useMemo(
    () => (
      <TrickplaySlider
        item={item}
        progress={progress}
        wasPlayingRef={wasPlayingRef}
        isPlaying={isPlaying}
        isSeeking={isSeeking}
        range={{ max }}
        play={play}
        pause={pause}
        seek={seek}
      />
    ),
    [
      item,
      progress,
      wasPlayingRef,
      isPlaying,
      isSeeking,
      max,
      play,
      pause,
      seek,
    ]
  );

  const NextEpisodeButtonMemoized = useMemo(
    () => (
      <NextEpisodeCountDownButton
        show={nextItem !== null && max.value > 0 && remainingTime < 10}
        onFinish={goToNextItem}
        onPress={goToNextItem}
      />
    ),
    [nextItem, max, remainingTime, goToNextItem]
  );

  const { t } = useTranslation();
  const router = useRouter();

  if (isErrorItem) {
    return (
      <View className="w-full h-full flex flex-col items-center justify-center bg-black">
        <View className="p-12 flex gap-4">
          <Text className="text-center font-semibold text-red-500 text-lg">
            {t("chromecast.error_loading_item")}
          </Text>
          {error && (
            <Text className="text-center opacity-80">{error.message}</Text>
          )}
        </View>
        <View className="flex gap-2 mt-auto mb-20">
          <TouchableOpacity
            className="flex flex-row items-center justify-center gap-2"
            onPress={() => refetch()}
          >
            <Ionicons name="reload" size={24} color={Colors.primary} />
            <Text className="ml-2 text-purple-600 text-lg">
              {t("chromecast.retry_load_item")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex flex-row items-center justify-center gap-2"
            onPress={() => {
              router.push("/(auth)/(home)/");
            }}
          >
            <Ionicons name="home" size={16} color={Colors.text} />
            <Text className="ml-2 text-white text-sm underline">
              {t("chromecast.go_home")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="w-full h-full flex flex-col items-center justify-center bg-black">
      <View className="w-full h-full flex flex-col justify-between bg-black">
        <BlurView
          intensity={60}
          tint="dark"
          experimentalBlurMethod={
            ANDROID_EXPERIMENTAL_BLUR ? "dimezisBlurView" : "none"
          }
        >
          <View className="pt-6 pb-4 px-4">
            <View className="flex flex-row flex-wrap justify-between w-full pb-1">
              <Text className="text-white font-bold text-3xl">{title}</Text>
              <RoundButton
                size="large"
                className="mr-4"
                background={false}
                onPress={() => {
                  CastContext.showCastDialog();
                }}
              >
                <AndroidCastButton />
                <Feather name="cast" size={30} color={"white"} />
              </RoundButton>
            </View>
            {ItemInfo}
          </View>
        </BlurView>
        <Image
          className="flex h-full w-full bg-[#0553] absolute -z-50"
          source={images[0]?.url}
          placeholder={{ blurhash: BLURHASH }}
          contentFit="cover"
          transition={1000}
        />
        <View className="flex flex-col w-full">
          <View className="flex flex-row w-full justify-end px-6 pb-6">
            <SkipButton
              showButton={showSkipButton}
              onPress={skipIntro}
              buttonText="Skip Intro"
            />
            <SkipButton
              showButton={showSkipCreditButton}
              onPress={skipCredit}
              buttonText="Skip Credits"
            />
            {NextEpisodeButtonMemoized}
          </View>
          <BlurView
            intensity={5}
            tint="dark"
            // blurs buttons too. not wanted
            experimentalBlurMethod={
              ANDROID_EXPERIMENTAL_BLUR ? "dimezisBlurView" : "none"
            }
            className="pt-1"
          >
            <View className={`flex flex-col w-full shrink px-2`}>
              {TrickplaySliderMemoized}
              <View className="flex flex-row items-center justify-between mt-2">
                <Text className="text-[12px] text-neutral-400">
                  {formatTimeString(currentTime, "s")}
                </Text>
                <Text className="text-[12px] text-neutral-400">
                  -{formatTimeString(remainingTime, "s")}
                </Text>
              </View>
              <View className="flex flex-row w-full items-center justify-evenly mt-2 mb-10">
                <TouchableOpacity
                  onPress={goToPreviousItem}
                  disabled={!previousItem}
                >
                  <Ionicons
                    name="play-skip-back-outline"
                    size={30}
                    color={previousItem ? "white" : "gray"}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSkipBackward}>
                  <Ionicons name="play-back-outline" size={30} color="white" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => togglePlay()}
                  className="flex w-14 h-14 items-center justify-center"
                >
                  {!isBufferingOrLoading ? (
                    <Ionicons
                      name={isPlaying ? "pause" : "play"}
                      size={50}
                      color="white"
                    />
                  ) : (
                    <Loader size={"large"} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSkipForward}>
                  <Ionicons
                    name="play-forward-outline"
                    size={30}
                    color="white"
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={goToNextItem} disabled={!nextItem}>
                  <Ionicons
                    name="play-skip-forward-outline"
                    size={30}
                    color={nextItem ? "white" : "gray"}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </BlurView>
        </View>
      </View>
    </View>
  );
}

type MetadataInfoProps = { mediaMetadata: MediaInfo["metadata"] };

function GenericInfo({ mediaMetadata }: MetadataInfoProps) {
  // @ts-expect-error The metadata type doesn't have subtitle, but the object has
  const subtitle = mediaMetadata?.subtitle;

  return <>{subtitle && <Text className="opacity-50">{subtitle}</Text>}</>;
}

function MovieInfo({ mediaMetadata }: MetadataInfoProps) {
  // @ts-expect-error The metadata type doesn't have subtitle, but the object has
  const subtitle = mediaMetadata?.subtitle;

  return <>{subtitle && <Text className="opacity-50">{subtitle}</Text>}</>;
}

function TvShowInfo({
  mediaMetadata,
  item,
}: MetadataInfoProps & { item?: BaseItemDto }) {
  const seriesTitle: string =
    // @ts-expect-error
    mediaMetadata?.seriesTitle || item?.SeriesName || "Title not found!";

  return (
    <>
      <Text className="opacity-50">
        {`${seriesTitle} - ${item?.SeasonName} Episode ${item?.IndexNumber}`}
      </Text>
    </>
  );
}

type TrickplaySliderProps = {
  item?: BaseItemDto;
  progress: SharedValue<number>;
  wasPlayingRef: React.MutableRefObject<boolean>;
  isPlaying: boolean;
  isSeeking: SharedValue<boolean>;
  range: { min?: SharedValue<number>; max: SharedValue<number> };
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
};

function TrickplaySlider({
  item,
  progress,
  wasPlayingRef,
  isPlaying,
  isSeeking,
  range,
  play,
  pause,
  seek,
}: TrickplaySliderProps) {
  const [isSliding, setIsSliding] = useState(false);
  const lastProgressRef = useRef<number>(0);

  const min = useSharedValue(range.min?.value || 0);

  const {
    trickPlayUrl,
    calculateTrickplayUrl,
    trickplayInfo,
    prefetchAllTrickplayImages,
  } = useTrickplay(
    {
      Id: item?.Id,
      RunTimeTicks: secondsToTicks(progress.value),
      Trickplay: item?.Trickplay,
    },
    true
  );

  useEffect(() => {
    prefetchAllTrickplayImages();
  }, []);

  const handleSliderStart = useCallback(() => {
    setIsSliding(true);
    wasPlayingRef.current = isPlaying;
    lastProgressRef.current = progress.value;

    pause();
    isSeeking.value = true;
  }, [isPlaying]);

  const handleSliderComplete = useCallback(async (value: number) => {
    isSeeking.value = false;
    progress.value = value;
    setIsSliding(false);

    seek(Math.max(0, Math.floor(value)));
    if (wasPlayingRef.current === true) play();
  }, []);

  const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const handleSliderChange = useCallback(
    debounce((value: number) => {
      calculateTrickplayUrl(secondsToTicks(value));
      const progressInSeconds = Math.floor(value);
      const hours = Math.floor(progressInSeconds / 3600);
      const minutes = Math.floor((progressInSeconds % 3600) / 60);
      const seconds = progressInSeconds % 60;
      setTime({ hours, minutes, seconds });
    }, 3),
    []
  );

  const memoizedRenderBubble = useCallback(() => {
    if (!trickPlayUrl || !trickplayInfo) {
      return null;
    }
    const { x, y, url } = trickPlayUrl;
    const tileWidth = 150;
    const tileHeight = 150 / trickplayInfo.aspectRatio!;

    return (
      <View
        style={{
          position: "absolute",
          left: -62,
          bottom: 0,
          paddingTop: 30,
          paddingBottom: 5,
          width: tileWidth * 1.5,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: tileWidth,
            height: tileHeight,
            alignSelf: "center",
            transform: [{ scale: 1.4 }],
            borderRadius: 5,
          }}
          className="bg-neutral-800 overflow-hidden"
        >
          <Image
            cachePolicy={"memory-disk"}
            style={{
              width: 150 * trickplayInfo?.data.TileWidth!,
              height:
                (150 / trickplayInfo.aspectRatio!) *
                trickplayInfo?.data.TileHeight!,
              transform: [
                { translateX: -x * tileWidth },
                { translateY: -y * tileHeight },
              ],
              resizeMode: "cover",
            }}
            source={{ uri: url }}
            contentFit="cover"
          />
        </View>
        <Text
          style={{
            marginTop: 30,
            fontSize: 16,
          }}
        >
          {`${time.hours > 0 ? `${time.hours}:` : ""}${
            time.minutes < 10 ? `0${time.minutes}` : time.minutes
          }:${time.seconds < 10 ? `0${time.seconds}` : time.seconds}`}
        </Text>
      </View>
    );
  }, [trickPlayUrl, trickplayInfo, time]);

  return (
    <Slider
      theme={{
        maximumTrackTintColor: "rgba(255,255,255,0.2)",
        minimumTrackTintColor: "#fff",
        cacheTrackTintColor: "rgba(255,255,255,0.3)",
        bubbleBackgroundColor: "#fff",
        bubbleTextColor: "#666",
        heartbeatColor: "#999",
      }}
      renderThumb={() => null}
      onSlidingStart={handleSliderStart}
      onSlidingComplete={handleSliderComplete}
      onValueChange={handleSliderChange}
      containerStyle={{
        borderRadius: 100,
      }}
      renderBubble={() => isSliding && memoizedRenderBubble()}
      sliderHeight={10}
      thumbWidth={0}
      progress={progress}
      minimumValue={min}
      maximumValue={range.max}
    />
  );
}
