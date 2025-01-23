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

export default function ChromecastControls({
  mediaStatus,
  client,
}: {
  mediaStatus: MediaStatus;
  client: RemoteMediaClient | null;
}) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const lightHapticFeedback = useHaptic("light");

  const streamPosition = useStreamPosition();

  const [settings] = useSettings();

  const [isSliding, setIsSliding] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(Infinity);

  const min = useSharedValue(0);
  const max = useSharedValue(mediaStatus.mediaInfo?.streamDuration || 0);
  const progress = useSharedValue(streamPosition || 0);
  const isSeeking = useSharedValue(false);

  const wasPlayingRef = useRef(false);
  const lastProgressRef = useRef<number>(0);

  const isPlaying = mediaStatus.playerState === "playing";
  const isBufferingOrLoading =
    mediaStatus.playerState === "buffering" ||
    mediaStatus.playerState === "loading";

  // request update of media status every player state change
  useEffect(() => {
    client?.requestStatus();
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

  function pause() {
    client?.pause();
  }

  function play() {
    client?.play();
  }

  function seek(time: number) {
    client?.seek({
      position: time,
    });
  }

  function togglePlay() {
    if (isPlaying) pause();
    else play();
  }

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
      // TODO check if something must be done here
      calculateTrickplayUrl(secondsToTicks(value));
      const progressInSeconds = Math.floor(value);
      const hours = Math.floor(progressInSeconds / 3600);
      const minutes = Math.floor((progressInSeconds % 3600) / 60);
      const seconds = progressInSeconds % 60;
      setTime({ hours, minutes, seconds });
    }, 3),
    []
  );

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

  const { mediaMetadata, itemId } = useMemo(
    () => ({
      mediaMetadata: mediaStatus.mediaInfo?.metadata,
      itemId: mediaStatus.mediaInfo?.contentId,
    }),
    [mediaStatus]
  );

  const type = mediaMetadata?.type || "generic";
  const images = mediaMetadata?.images || [];

  const mediaCustomData = mediaStatus.mediaInfo?.customData as
    | { item: BaseItemDto; playbackOptions: SelectedOptions }
    | undefined;
  const { item, playbackOptions } = mediaCustomData || {
    item: undefined,
    playbackOptions: undefined,
  };

  const { previousItem, nextItem } = useAdjacentItems({
    item: {
      Id: itemId,
      SeriesId: item?.SeriesId,
      Type: item?.Type,
    },
  });

  const {
    trickPlayUrl,
    calculateTrickplayUrl,
    trickplayInfo,
    prefetchAllTrickplayImages,
  } = useTrickplay(
    {
      Id: itemId,
      RunTimeTicks: secondsToTicks(progress.value),
      Trickplay: item?.Trickplay,
    },
    true
  );

  useEffect(() => {
    prefetchAllTrickplayImages();
  }, []);

  const goToItem = useCallback(
    async (item: BaseItemDto) => {
      if (!client) {
        console.warn("Failed to go to item: No remote client!");
        return;
      }
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
      // TODO this function does not finish somehow. don't know what is wrong as there are no errors :/
      const data = await getStreamUrl({
        api,
        item,
        deviceProfile: chromecastProfile,
        startTimeTicks: item?.UserData?.PlaybackPositionTicks!,
        userId: user?.Id,
        audioStreamIndex: defaultAudioIndex,
        // maxStreamingBitrate: playbackOptions.bitrate?.value,
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

  const blurhash =
    "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[";

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
  }, [type]);

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

  const title = mediaMetadata?.title || "Title not found!";

  return (
    <View className="w-full h-full flex flex-col items-center justify-center bg-black">
      <View className="w-full h-full flex flex-col justify-between bg-black">
        <BlurView
          intensity={60}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
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
          source={images[0].url}
          placeholder={{ blurhash }}
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
            <NextEpisodeCountDownButton
              show={!nextItem && max.value === 0 ? false : remainingTime < 10}
              onFinish={goToNextItem}
              onPress={goToNextItem}
            />
          </View>
          <BlurView
            intensity={5}
            tint="dark"
            // blurs buttons too. not wanted
            experimentalBlurMethod="dimezisBlurView"
            className="pt-1"
          >
            <View className={`flex flex-col w-full shrink px-2`}>
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
                maximumValue={max}
              />
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
