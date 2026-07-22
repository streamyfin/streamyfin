import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  ChapterInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { type FC, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { type SharedValue } from "react-native-reanimated";
import { ChapterList } from "@/components/chapters/ChapterList";
import { ChapterTicks } from "@/components/chapters/ChapterTicks";
import { Text } from "@/components/common/Text";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import {
  chapterMarkers,
  chapterNameAt,
  hasChapterMarkers,
} from "@/utils/chapters";
import { TimeDisplay } from "./TimeDisplay";
import { TrickplayBubble } from "./TrickplayBubble";

// Chapter tick height in dp — matches the slider track height for a clean,
// flush look (no top/bottom overflow).
const TICK_HEIGHT = 10;

interface BottomControlsProps {
  item: BaseItemDto;
  /** Item chapters, used for the tick overlay and chapter list. */
  chapters?: ChapterInfo[] | null;
  /** Total media duration in milliseconds. */
  durationMs: number;
  showControls: boolean;
  isSliding: boolean;
  showRemoteBubble: boolean;
  currentTime: number;
  remainingTime: number;
  handleControlsInteraction: () => void;

  // Slider props
  min: SharedValue<number>;
  max: SharedValue<number>;
  effectiveProgress: SharedValue<number>;
  cacheProgress: SharedValue<number>;
  handleSliderStart: () => void;
  handleSliderComplete: (value: number) => void;
  handleSliderChange: (value: number) => void;
  handleTouchStart: () => void;
  handleTouchEnd: () => void;
  /** Programmatic seek (chapter list, hotkeys) — bypasses slide gesture state. */
  seekTo: (value: number) => void;

  // Trickplay props
  trickPlayUrl: {
    x: number;
    y: number;
    url: string;
  } | null;
  trickplayInfo: {
    aspectRatio?: number;
    data: {
      TileWidth?: number;
      TileHeight?: number;
    };
  } | null;
  time: {
    hours: number;
    minutes: number;
    seconds: number;
  };
}

export const BottomControls: FC<BottomControlsProps> = ({
  item,
  chapters,
  durationMs,
  showControls,
  isSliding,
  showRemoteBubble,
  currentTime,
  remainingTime,
  handleControlsInteraction,
  min,
  max,
  effectiveProgress,
  cacheProgress,
  handleSliderStart,
  handleSliderComplete,
  handleSliderChange,
  handleTouchStart,
  handleTouchEnd,
  seekTo,
  trickPlayUrl,
  trickplayInfo,
  time,
}) => {
  const { t } = useTranslation();
  const insets = useControlsSafeAreaInsets();
  const [chapterListVisible, setChapterListVisible] = useState(false);

  const chapterMarkerList = useMemo(
    () => chapterMarkers(chapters, durationMs),
    [chapters, durationMs],
  );
  const hasChapters = hasChapterMarkers(chapters, durationMs);

  // Current chapter name for the always-visible header label (live playback).
  const currentChapterName = useMemo(
    () => (hasChapters ? chapterNameAt(currentTime, chapters) : null),
    [hasChapters, currentTime, chapters],
  );

  // Chapter name at the scrubbed position for the trickplay bubble. `time` is
  // an {h,m,s} object derived from the slider's dragged value — convert back
  // to ms for the lookup. Only useful while actively scrubbing.
  const scrubChapterName = useMemo(() => {
    if (!hasChapters) return null;
    const scrubMs =
      (time.hours * 3600 + time.minutes * 60 + time.seconds) * 1000;
    return chapterNameAt(scrubMs, chapters);
  }, [hasChapters, time.hours, time.minutes, time.seconds, chapters]);

  return (
    <View
      style={[
        {
          position: "absolute",
          right: insets.right,
          left: insets.left,
          bottom: Math.max(insets.bottom - 17, 0),
        },
      ]}
      className={"flex flex-col px-2"}
      onTouchStart={handleControlsInteraction}
    >
      <View
        className='shrink flex flex-col justify-center'
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <View
          className='flex flex-col items-start shrink'
          pointerEvents={showControls ? "box-none" : "none"}
        >
          {item?.Type === "Episode" && (
            <Text className='opacity-50'>
              {`${item.SeriesName} - ${item.SeasonName} Episode ${item.IndexNumber}`}
            </Text>
          )}
          <Text className='font-bold text-xl'>{item?.Name}</Text>
          {item?.Type === "Movie" && (
            <Text className='text-xs opacity-50'>{item?.ProductionYear}</Text>
          )}
          {item?.Type === "Audio" && (
            <Text className='text-xs opacity-50'>{item?.Album}</Text>
          )}
          {currentChapterName ? (
            <Text className='text-xs opacity-70 mt-1' numberOfLines={1}>
              {currentChapterName}
            </Text>
          ) : null}
        </View>
        <View className='flex flex-row items-end space-x-2 shrink-0 pr-2 pb-1'>
          {hasChapters && (
            <Pressable
              onPress={() => setChapterListVisible(true)}
              hitSlop={10}
              // mb centers the bare 24px icon on the taller skip/next buttons
              className='justify-center ml-4 mb-1'
              accessibilityRole='button'
              accessibilityLabel={t("chapters.open")}
            >
              <Ionicons name='bookmarks' size={24} color='white' />
            </Pressable>
          )}
        </View>
      </View>
      <View
        className={"flex flex-col-reverse rounded-lg items-center my-2"}
        pointerEvents={showControls ? "box-none" : "none"}
      >
        <View className={"flex flex-col w-full shrink"}>
          <View
            style={{
              height: 10,
              justifyContent: "center",
              alignItems: "stretch",
              // Allow chapter ticks taller than the 10px track to bleed out
              // top/bottom (RN defaults to overflow: "hidden" on Android).
              overflow: "visible",
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
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
              cache={cacheProgress}
              onSlidingStart={handleSliderStart}
              onSlidingComplete={handleSliderComplete}
              onValueChange={handleSliderChange}
              containerStyle={{
                borderRadius: 100,
              }}
              renderBubble={() =>
                (isSliding || showRemoteBubble) && (
                  <TrickplayBubble
                    trickPlayUrl={trickPlayUrl}
                    trickplayInfo={trickplayInfo}
                    time={time}
                    chapterName={scrubChapterName}
                  />
                )
              }
              sliderHeight={10}
              thumbWidth={0}
              progress={effectiveProgress}
              minimumValue={min}
              maximumValue={max}
            />
            <ChapterTicks markers={chapterMarkerList} height={TICK_HEIGHT} />
          </View>
          <TimeDisplay
            currentTime={currentTime}
            remainingTime={remainingTime}
          />
        </View>
      </View>
      <ChapterList
        visible={chapterListVisible}
        chapters={chapters}
        currentPositionMs={currentTime}
        onSeek={seekTo}
        onClose={() => setChapterListVisible(false)}
      />
    </View>
  );
};
