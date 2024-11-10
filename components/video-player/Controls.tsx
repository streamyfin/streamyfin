import { useAdjacentItems } from "@/hooks/useAdjacentEpisodes";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { useTrickplay } from "@/hooks/useTrickplay";
import {
  TrackInfo,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import { apiAtom } from "@/providers/JellyfinProvider";
import { usePlaySettings } from "@/providers/PlaySettingsProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { writeToLog } from "@/utils/log";
import {
  formatTimeString,
  msToTicks,
  secondsToMs,
  ticksToMs,
  ticksToSeconds,
} from "@/utils/time";
import { Ionicons } from "@expo/vector-icons";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  TouchableOpacity,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoRef } from "react-native-video";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "../common/Text";
import { Loader } from "../Loader";

interface Props {
  item: BaseItemDto;
  videoRef: React.MutableRefObject<VlcPlayerViewRef | VideoRef | null>;
  isPlaying: boolean;
  isSeeking: SharedValue<boolean>;
  cacheProgress: SharedValue<number>;
  progress: SharedValue<number>;
  isBuffering: boolean;
  showControls: boolean;
  ignoreSafeAreas?: boolean;
  setIgnoreSafeAreas: React.Dispatch<React.SetStateAction<boolean>>;
  enableTrickplay?: boolean;
  togglePlay: (ticks: number) => void;
  setShowControls: (shown: boolean) => void;
  offline?: boolean;
  isVideoLoaded?: boolean;
  mediaSource?: MediaSourceInfo | null;
  seek: (ticks: number) => void;
  play: (() => Promise<void>) | (() => void);
  pause: () => void;
  getAudioTracks?: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]);
  getSubtitleTracks?: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]);
  setSubtitleURL?: (url: string, customName: string) => void;
  setSubtitleTrack?: (index: number) => void;
  setAudioTrack?: (index: number) => void;
  stop?: (() => Promise<void>) | (() => void);
  isVlc?: boolean;
}

export const Controls: React.FC<Props> = ({
  item,
  videoRef,
  seek,
  play,
  pause,
  togglePlay,
  isPlaying,
  isSeeking,
  progress,
  isBuffering,
  cacheProgress,
  showControls,
  setShowControls,
  ignoreSafeAreas,
  setIgnoreSafeAreas,
  mediaSource,
  isVideoLoaded,
  getAudioTracks,
  getSubtitleTracks,
  setSubtitleURL,
  setSubtitleTrack,
  setAudioTrack,
  stop,
  offline = false,
  enableTrickplay = true,
  isVlc = false,
}) => {
  const [settings] = useSettings();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setPlaySettings, playSettings } = usePlaySettings();
  const api = useAtomValue(apiAtom);
  const windowDimensions = Dimensions.get("window");

  const { previousItem, nextItem } = useAdjacentItems({ item });
  const { trickPlayUrl, calculateTrickplayUrl, trickplayInfo } = useTrickplay(
    item,
    !offline && enableTrickplay
  );

  const [currentTime, setCurrentTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);

  const min = useSharedValue(0);
  const max = useSharedValue(item.RunTimeTicks || 0);

  const wasPlayingRef = useRef(false);
  const lastProgressRef = useRef<number>(0);

  const { showSkipButton, skipIntro } = useIntroSkipper(
    offline ? undefined : item.Id,
    currentTime,
    seek,
    play,
    isVlc
  );

  const { showSkipCreditButton, skipCredit } = useCreditSkipper(
    offline ? undefined : item.Id,
    currentTime,
    seek,
    play,
    isVlc
  );

  const goToPreviousItem = useCallback(() => {
    if (!previousItem || !settings) return;

    const { bitrate, mediaSource, audioIndex, subtitleIndex } =
      getDefaultPlaySettings(previousItem, settings);

    setPlaySettings({
      item: previousItem,
      bitrate,
      mediaSource,
      audioIndex,
      subtitleIndex,
    });

    const queryParams = new URLSearchParams({
      itemId: previousItem.Id ?? "", // Ensure itemId is a string
      audioIndex: audioIndex?.toString() ?? "",
      subtitleIndex: subtitleIndex?.toString() ?? "",
      mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
      bitrateValue: bitrate.toString(),
    }).toString();

    if (Platform.OS === "ios") {
      router.replace(`/vlc-player?${queryParams}`);
    } else {
      router.replace(`/player?${queryParams}`);
    }
  }, [previousItem, settings]);

  const goToNextItem = useCallback(() => {
    if (!nextItem || !settings) return;

    const { bitrate, mediaSource, audioIndex, subtitleIndex } =
      getDefaultPlaySettings(nextItem, settings);

    setPlaySettings({
      item: nextItem,
      bitrate,
      mediaSource,
      audioIndex,
      subtitleIndex,
    });

    const queryParams = new URLSearchParams({
      itemId: nextItem.Id ?? "", // Ensure itemId is a string
      audioIndex: audioIndex?.toString() ?? "",
      subtitleIndex: subtitleIndex?.toString() ?? "",
      mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
      bitrateValue: bitrate.toString(),
    }).toString();

    if (Platform.OS === "ios") {
      router.replace(`/vlc-player?${queryParams}`);
    } else {
      router.replace(`/player?${queryParams}`);
    }
  }, [nextItem, settings]);

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      const current = isVlc ? currentProgress : ticksToSeconds(currentProgress);
      const remaining = isVlc
        ? maxValue - currentProgress
        : ticksToSeconds(maxValue - currentProgress);

      setCurrentTime(current);
      setRemainingTime(remaining);

      // Currently doesm't work in VLC because of some corrupted timestamps, will need to find a workaround.
      if (currentProgress === maxValue) {
        setShowControls(true);
        // Automatically play the next item if it exists
        goToNextItem();
      }
    },
    [goToNextItem, isVlc]
  );

  useAnimatedReaction(
    () => ({
      progress: progress.value,
      max: max.value,
      isSeeking: isSeeking.value,
    }),
    (result) => {
      // console.log("Progress changed", result);
      if (result.isSeeking === false) {
        runOnJS(updateTimes)(result.progress, result.max);
      }
    },
    [updateTimes]
  );

  useEffect(() => {
    if (item) {
      progress.value = isVlc
        ? ticksToMs(item?.UserData?.PlaybackPositionTicks)
        : item?.UserData?.PlaybackPositionTicks || 0;
      max.value = isVlc
        ? ticksToMs(item.RunTimeTicks || 0)
        : item.RunTimeTicks || 0;
    }
  }, [item, isVlc]);

  const toggleControls = () => setShowControls(!showControls);

  const handleSliderComplete = useCallback(
    async (value: number) => {
      isSeeking.value = false;
      progress.value = value;

      await seek(
        Math.max(0, Math.floor(isVlc ? value : ticksToSeconds(value)))
      );
      if (wasPlayingRef.current === true) play();
    },
    [isVlc]
  );

  const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });

  const handleSliderChange = (value: number) => {
    const progressInTicks = isVlc ? msToTicks(value) : value;
    calculateTrickplayUrl(progressInTicks);

    const progressInSeconds = Math.floor(ticksToSeconds(progressInTicks));
    const hours = Math.floor(progressInSeconds / 3600);
    const minutes = Math.floor((progressInSeconds % 3600) / 60);
    const seconds = progressInSeconds % 60;
    setTime({ hours, minutes, seconds });
  };

  const handleSliderStart = useCallback(() => {
    if (showControls === false) return;

    wasPlayingRef.current = isPlaying;
    lastProgressRef.current = progress.value;

    pause();
    isSeeking.value = true;
  }, [showControls, isPlaying]);

  const handleSkipBackward = useCallback(async () => {
    if (!settings?.rewindSkipTime) return;
    wasPlayingRef.current = isPlaying;
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = isVlc
          ? Math.max(0, curr - secondsToMs(settings.rewindSkipTime))
          : Math.max(0, ticksToSeconds(curr) - settings.rewindSkipTime);
        await seek(newTime);
        if (wasPlayingRef.current === true) play();
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video backwards", error);
    }
  }, [settings, isPlaying, isVlc]);

  const handleSkipForward = useCallback(async () => {
    if (!settings?.forwardSkipTime) return;
    wasPlayingRef.current = isPlaying;
    try {
      const curr = progress.value;
      console.log(curr);
      if (curr !== undefined) {
        const newTime = isVlc
          ? curr + secondsToMs(settings.forwardSkipTime)
          : ticksToSeconds(curr) + settings.forwardSkipTime;
        await seek(Math.max(0, newTime));
        if (wasPlayingRef.current === true) play();
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video forwards", error);
    }
  }, [settings, isPlaying, isVlc]);

  const toggleIgnoreSafeAreas = useCallback(() => {
    setIgnoreSafeAreas((prev) => !prev);
  }, []);

  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<
    MediaStream | undefined
  >(undefined);

  const [audioTracks, setAudioTracks] = useState<TrackInfo[] | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackInfo[] | null>(
    null
  );

  useEffect(() => {
    const fetchTracks = async () => {
      if (getSubtitleTracks) {
        const subtitles = await getSubtitleTracks();
        setSubtitleTracks(subtitles);
      }
      if (getAudioTracks) {
        const audio = await getAudioTracks();
        setAudioTracks(audio);
      }
    };

    fetchTracks();
  }, [isVideoLoaded, getAudioTracks, getSubtitleTracks]);

  type EmbeddedSubtitle = {
    name: string;
    index: number;
    isExternal: false;
  };

  type ExternalSubtitle = {
    name: string;
    index: number;
    isExternal: true;
    deliveryUrl: string;
  };

  const allSubtitleTracks = useMemo(() => {
    const embeddedSubs =
      subtitleTracks?.map((s) => ({
        name: s.name,
        index: s.index,
        isExternal: false,
        deliveryUrl: undefined,
      })) || [];

    const externalSubs =
      mediaSource?.MediaStreams?.filter(
        (stream) =>
          stream.Type === "Subtitle" &&
          stream.IsExternal &&
          !!stream.DeliveryUrl
      ).map((s) => ({
        name: s.DisplayTitle!,
        index: s.Index!,
        isExternal: true,
        deliveryUrl: s.DeliveryUrl,
      })) || [];

    // Create a Set of embedded subtitle names for quick lookup
    const embeddedSubNames = new Set(embeddedSubs.map((sub) => sub.name));

    // Filter out external subs that have the same name as embedded subs
    const uniqueExternalSubs = externalSubs.filter(
      (sub) => !embeddedSubNames.has(sub.name)
    );
    // Combine embedded and unique external subs
    return [...embeddedSubs, ...uniqueExternalSubs] as (
      | EmbeddedSubtitle
      | ExternalSubtitle
    )[];
  }, [item, isVideoLoaded, subtitleTracks, mediaSource]);

  return (
    <View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: windowDimensions.width,
          height: windowDimensions.height,
        },
      ]}
    >
      {/* <VideoDebugInfo playerRef={videoRef} /> */}
      <View
        style={{
          position: "absolute",
          top: insets.top,
          left: insets.left,
          zIndex: 1000,
          opacity: showControls ? 1 : 0,
        }}
        className="p-4"
      >
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <TouchableOpacity
              onPress={() => console.log("open settings")}
              className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
            >
              <Ionicons name="ellipsis-horizontal" size={24} color={"white"} />
            </TouchableOpacity>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            loop={true}
            side="bottom"
            align="start"
            alignOffset={0}
            avoidCollisions={true}
            collisionPadding={8}
            sideOffset={8}
          >
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger key="subtitle-trigger">
                Subtitle
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent
                alignOffset={-10}
                avoidCollisions={true}
                collisionPadding={0}
                loop={true}
                sideOffset={10}
              >
                {allSubtitleTracks?.map((sub, idx: number) => (
                  <DropdownMenu.Item
                    key={`subtitle-item-${idx}`}
                    onSelect={() => {
                      console.log("Trying to set subtitle...");
                      if (sub.isExternal) {
                        console.log("Setting external sub:", sub);
                        setSubtitleURL &&
                          setSubtitleURL(
                            api?.basePath + sub.deliveryUrl,
                            sub.name
                          );
                        return;
                      }

                      console.log("Setting sub with index:", sub.index);
                      setSubtitleTrack && setSubtitleTrack(sub.index);
                    }}
                  >
                    <DropdownMenu.ItemIndicator />
                    <DropdownMenu.ItemTitle key={`subtitle-item-title-${idx}`}>
                      {sub.name}
                    </DropdownMenu.ItemTitle>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger key="audio-trigger">
                Audio
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent
                alignOffset={-10}
                avoidCollisions={true}
                collisionPadding={0}
                loop={true}
                sideOffset={10}
              >
                {audioTracks?.map((a, idx: number) => (
                  <DropdownMenu.CheckboxItem
                    key={`audio-item-${idx}`}
                    value="off"
                    onValueChange={() => {
                      setAudioTrack && setAudioTrack(a.index);
                    }}
                  >
                    <DropdownMenu.ItemIndicator />
                    <DropdownMenu.ItemTitle key={`audio-item-title-${idx}`}>
                      {a.name}
                    </DropdownMenu.ItemTitle>
                  </DropdownMenu.CheckboxItem>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </View>

      <View
        style={[
          {
            position: "absolute",
            bottom: insets.bottom + 97,
            right: insets.right,
          },
        ]}
        className={`z-10 p-4
          ${showSkipButton ? "opacity-100" : "opacity-0"}
        `}
      >
        <TouchableOpacity
          onPress={skipIntro}
          className="bg-purple-600 rounded-full px-2.5 py-2 font-semibold"
        >
          <Text className="text-white">Skip Intro</Text>
        </TouchableOpacity>
      </View>

      <View
        style={{
          position: "absolute",
          bottom: insets.bottom + 94,
          right: insets.right,
          height: 70,
        }}
        pointerEvents={showSkipCreditButton ? "auto" : "none"}
        className={`z-10 p-4 ${
          showSkipCreditButton ? "opacity-100" : "opacity-0"
        }`}
      >
        <TouchableOpacity
          onPress={skipCredit}
          className="bg-purple-600 rounded-full px-2.5 py-2 font-semibold"
        >
          <Text className="text-white">Skip Credits</Text>
        </TouchableOpacity>
      </View>

      <Pressable
        onPress={() => {
          toggleControls();
        }}
      >
        <View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              width: windowDimensions.width + 100,
              height: windowDimensions.height + 100,
              opacity: showControls ? 1 : 0,
            },
          ]}
          className={`bg-black/50 z-0`}
        ></View>
      </Pressable>

      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: windowDimensions.width,
          height: windowDimensions.height,
        }}
        pointerEvents="none"
        className={`flex flex-col items-center justify-center
            ${isBuffering ? "opacity-100" : "opacity-0"}
          `}
      >
        <Loader />
      </View>

      <View
        style={[
          {
            position: "absolute",
            top: insets.top,
            right: insets.right,
            opacity: showControls ? 1 : 0,
          },
        ]}
        pointerEvents={showControls ? "auto" : "none"}
        className={`flex flex-row items-center space-x-2 z-10 p-4 `}
      >
        {Platform.OS !== "ios" && (
          <TouchableOpacity
            onPress={toggleIgnoreSafeAreas}
            className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
          >
            <Ionicons
              name={ignoreSafeAreas ? "contract-outline" : "expand"}
              size={24}
              color="white"
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={async () => {
            if (stop) await stop();
            router.back();
          }}
          className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
        >
          <Ionicons name="close" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <View
        style={[
          {
            position: "absolute",
            width: windowDimensions.width - insets.left - insets.right,
            maxHeight: windowDimensions.height,
            left: insets.left,
            bottom: Platform.OS === "ios" ? insets.bottom : insets.bottom,
            opacity: showControls ? 1 : 0,
          },
        ]}
        pointerEvents={showControls ? "auto" : "none"}
        className={`flex flex-col p-4 `}
      >
        <View className="shrink flex flex-col justify-center h-full mb-2">
          <Text className="font-bold">{item?.Name}</Text>
          {item?.Type === "Episode" && (
            <Text className="opacity-50">{item.SeriesName}</Text>
          )}
          {item?.Type === "Movie" && (
            <Text className="text-xs opacity-50">{item?.ProductionYear}</Text>
          )}
          {item?.Type === "Audio" && (
            <Text className="text-xs opacity-50">{item?.Album}</Text>
          )}
        </View>
        <View
          className={`flex flex-col-reverse py-4 px-4 rounded-2xl items-center  bg-neutral-800/90`}
        >
          <View className="flex flex-row items-center space-x-4">
            <TouchableOpacity
              style={{
                opacity: !previousItem ? 0.5 : 1,
              }}
              onPress={goToPreviousItem}
            >
              <Ionicons name="play-skip-back" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSkipBackward}>
              <Ionicons
                name="refresh-outline"
                size={26}
                color="white"
                style={{
                  transform: [{ scaleY: -1 }, { rotate: "180deg" }],
                }}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                togglePlay(progress.value);
              }}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={30}
                color="white"
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSkipForward}>
              <Ionicons name="refresh-outline" size={26} color="white" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                opacity: !nextItem ? 0.5 : 1,
              }}
              onPress={goToNextItem}
            >
              <Ionicons name="play-skip-forward" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <View className={`flex flex-col w-full shrink`}>
            <Slider
              theme={{
                maximumTrackTintColor: "rgba(255,255,255,0.2)",
                minimumTrackTintColor: "#fff",
                cacheTrackTintColor: "rgba(255,255,255,0.3)",
                bubbleBackgroundColor: "#fff",
                bubbleTextColor: "#000",
                heartbeatColor: "#999",
              }}
              cache={cacheProgress}
              onSlidingStart={handleSliderStart}
              onSlidingComplete={handleSliderComplete}
              onValueChange={handleSliderChange}
              containerStyle={{
                borderRadius: 100,
              }}
              renderBubble={() => {
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
                      bottom: 0,
                      left: 0,
                      width: tileWidth,
                      height: tileHeight,
                      marginLeft: -tileWidth / 4,
                      marginTop: -tileHeight / 4 - 60,
                      zIndex: 10,
                    }}
                    className=" bg-neutral-800 overflow-hidden"
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
                      }}
                      source={{ uri: url }}
                      contentFit="cover"
                    />
                    <Text
                      style={{
                        position: "absolute",
                        bottom: 5,
                        left: 5,
                        color: "white",
                        backgroundColor: "rgba(0, 0, 0, 0.5)",
                        padding: 5,
                        borderRadius: 5,
                      }}
                    >
                      {`${time.hours > 0 ? `${time.hours}:` : ""}${
                        time.minutes < 10 ? `0${time.minutes}` : time.minutes
                      }:${
                        time.seconds < 10 ? `0${time.seconds}` : time.seconds
                      }`}
                    </Text>
                  </View>
                );
              }}
              sliderHeight={10}
              thumbWidth={0}
              progress={progress}
              minimumValue={min}
              maximumValue={max}
            />
            <View className="flex flex-row items-center justify-between mt-0.5">
              <Text className="text-[12px] text-neutral-400">
                {formatTimeString(currentTime, isVlc ? "ms" : "s")}
              </Text>
              <Text className="text-[12px] text-neutral-400">
                -{formatTimeString(remainingTime, isVlc ? "ms" : "s")}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};
