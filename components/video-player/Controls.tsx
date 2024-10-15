import { useAdjacentItems } from "@/hooks/useAdjacentEpisodes";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { useTrickplay } from "@/hooks/useTrickplay";
import {
  TrackInfo,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import { usePlaySettings } from "@/providers/PlaySettingsProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { writeToLog } from "@/utils/log";
import { formatTimeString, secondsToMs, ticksToMs } from "@/utils/time";
import { Ionicons } from "@expo/vector-icons";
import {
  BaseItemDto,
  MediaSourceInfo,
  type MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
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
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "../common/Text";
import { Loader } from "../Loader";
import { useAtomValue } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";

interface Props {
  item: BaseItemDto;
  videoRef: React.MutableRefObject<VlcPlayerViewRef | null>;
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
  mediaSource: MediaSourceInfo;
}

export const Controls: React.FC<Props> = ({
  item,
  videoRef,
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
  offline = false,
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
    !offline
  );

  const [currentTime, setCurrentTime] = useState(0); // Seconds
  const [remainingTime, setRemainingTime] = useState(0); // Seconds

  const min = useSharedValue(0);
  const max = useSharedValue(item.RunTimeTicks || 0);

  const wasPlayingRef = useRef(false);
  const lastProgressRef = useRef<number>(0);

  const { showSkipButton, skipIntro } = useIntroSkipper(
    offline ? undefined : item.Id,
    currentTime,
    videoRef
  );

  const { showSkipCreditButton, skipCredit } = useCreditSkipper(
    offline ? undefined : item.Id,
    currentTime,
    videoRef
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

    router.replace("/play-video");
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

    router.replace("/play-video");
  }, [nextItem, settings]);

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      const current = currentProgress;
      const remaining = maxValue - currentProgress;

      setCurrentTime(current);
      setRemainingTime(remaining);

      if (currentProgress === maxValue) {
        setShowControls(true);
        // Automatically play the next item if it exists
        goToNextItem();
      }
    },
    [goToNextItem]
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

  useEffect(() => {
    if (item) {
      progress.value = ticksToMs(item?.UserData?.PlaybackPositionTicks);
      max.value = ticksToMs(item.RunTimeTicks || 0);
    }
  }, [item]);

  const toggleControls = () => setShowControls(!showControls);

  const handleSliderComplete = useCallback(async (value: number) => {
    isSeeking.value = false;
    progress.value = value;

    await videoRef.current?.seekTo(Math.max(0, Math.floor(value)));
    if (wasPlayingRef.current === true) videoRef.current?.play();
  }, []);

  const handleSliderChange = (value: number) => {
    calculateTrickplayUrl(value);
  };

  const handleSliderStart = useCallback(() => {
    if (showControls === false) return;

    wasPlayingRef.current = isPlaying;
    lastProgressRef.current = progress.value;

    videoRef.current?.pause();
    isSeeking.value = true;
  }, [showControls, isPlaying]);

  const handleSkipBackward = useCallback(async () => {
    if (!settings?.rewindSkipTime) return;
    wasPlayingRef.current = isPlaying;
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        await videoRef.current?.seekTo(
          Math.max(0, curr - secondsToMs(settings.rewindSkipTime))
        );
        if (wasPlayingRef.current === true) videoRef.current?.play();
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video backwards", error);
    }
  }, [settings, isPlaying]);

  const handleSkipForward = useCallback(async () => {
    if (!settings?.forwardSkipTime) return;
    wasPlayingRef.current = isPlaying;
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = curr + secondsToMs(settings.forwardSkipTime);
        await videoRef.current?.seekTo(Math.max(0, newTime));
        if (wasPlayingRef.current === true) videoRef.current?.play();
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video forwards", error);
    }
  }, [settings, isPlaying]);

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
      if (videoRef.current) {
        const audio = await videoRef.current.getAudioTracks();
        const subtitles = await videoRef.current.getSubtitleTracks();
        setAudioTracks(audio);
        setSubtitleTracks(subtitles);
      }
    };

    fetchTracks();
  }, [videoRef, isVideoLoaded]);

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
        (stream) => stream.Type === "Subtitle" && stream.IsExternal
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
        }}
        className="p-4"
      >
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <View className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2">
              <Ionicons name="ellipsis-horizontal" size={24} color={"white"} />
            </View>
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
            <DropdownMenu.Label>Subtitle tracks</DropdownMenu.Label>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger key="image-style-trigger">
                Subtitle
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent
                alignOffset={-10}
                avoidCollisions={true}
                collisionPadding={0}
                loop={true}
                sideOffset={10}
              >
                {/* <DropdownMenu.CheckboxItem
                  key="none-item"
                  value="off"
                  onValueChange={() => {
                    videoRef.current?.setSubtitleTrack(-1);
                  }}
                >
                  <DropdownMenu.ItemIndicator />
                  <DropdownMenu.ItemTitle key={`none-item-title`}>
                    None
                  </DropdownMenu.ItemTitle>
                </DropdownMenu.CheckboxItem> */}
                {allSubtitleTracks.length > 0
                  ? allSubtitleTracks?.map((sub, idx: number) => (
                      <DropdownMenu.CheckboxItem
                        key={`subtitle-item-${idx}`}
                        value="off"
                        onValueChange={() => {
                          if (sub.isExternal) {
                            videoRef.current?.setSubtitleURL(
                              api?.basePath + sub.deliveryUrl
                            );
                            return;
                          }

                          videoRef.current?.setSubtitleTrack(sub.index);
                        }}
                      >
                        <DropdownMenu.ItemIndicator />
                        <DropdownMenu.ItemTitle
                          key={`subtitle-item-title-${idx}`}
                        >
                          {sub.name}
                        </DropdownMenu.ItemTitle>
                      </DropdownMenu.CheckboxItem>
                    ))
                  : null}
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
        <TouchableOpacity
          onPress={async () => {
            await videoRef.current?.stop();
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
                {formatTimeString(currentTime)}
              </Text>
              <Text className="text-[12px] text-neutral-400">
                -{formatTimeString(remainingTime)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};
