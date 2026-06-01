import { Ionicons } from "@expo/vector-icons";
import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  ChapterInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { type FC, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChapterList } from "@/components/chapters/ChapterList";
import { ChapterTicks } from "@/components/chapters/ChapterTicks";
import { Text } from "@/components/common/Text";
import { AutoplayCountdown } from "@/components/player/AutoplayCountdown";
import { useSettings } from "@/utils/atoms/settings";
import { chapterMarkers, chapterNameAt } from "@/utils/chapters";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import SkipButton from "./SkipButton";
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
  showSkipButton: boolean;
  skipButtonText: string;
  showSkipCreditButton: boolean;
  skipCreditButtonText: string;
  hasContentAfterCredits: boolean;
  skipIntro: () => void;
  skipCredit: () => void;
  nextItem?: BaseItemDto | null;
  api?: Api | null;
  handleNextEpisodeAutoPlay: () => void;
  handleNextEpisodeManual: () => void;
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

  // Chapter props
  chapterPositions?: number[];
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
  showSkipButton,
  skipButtonText,
  showSkipCreditButton,
  skipCreditButtonText,
  hasContentAfterCredits,
  skipIntro,
  skipCredit,
  nextItem,
  api,
  handleNextEpisodeAutoPlay,
  handleNextEpisodeManual,
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
  chapterPositions = [],
}) => {
  const { settings } = useSettings();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [chapterListVisible, setChapterListVisible] = useState(false);

  // Only expose chapter UI when there are at least two real markers.
  const chapterMarkerList = useMemo(
    () => chapterMarkers(chapters, durationMs),
    [chapters, durationMs],
  );
  const hasChapters = chapterMarkerList.length > 1;

  // Autoplay overlay: shown under the same condition the old countdown button used.
  const autoplayAllowed =
    settings.autoPlayNextEpisode !== false &&
    (settings.maxAutoPlayEpisodeCount.value === -1 ||
      settings.autoPlayEpisodeCount < settings.maxAutoPlayEpisodeCount.value);

  const showNextEpisodeCountdown =
    autoplayAllowed &&
    (!nextItem
      ? false
      : // Show during credits if no content after, OR near end of video
        (showSkipCreditButton && !hasContentAfterCredits) ||
        remainingTime < 10000);

  const [secondsRemaining, setSecondsRemaining] = useState(
    settings.autoplayCountdownSeconds,
  );
  const [autoplayCancelled, setAutoplayCancelled] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a stable ref to the autoplay handler so the timer effect does not
  // restart when the handler identity changes.
  const autoPlayHandlerRef = useRef(handleNextEpisodeAutoPlay);
  autoPlayHandlerRef.current = handleNextEpisodeAutoPlay;

  useEffect(() => {
    if (!showNextEpisodeCountdown || autoplayCancelled) {
      // Either the show-condition flipped off OR the user cancelled.
      // In both cases, stop the running timer immediately so autoplay
      // can't fire after Cancel was pressed.
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Only reset cancellation + seconds when the show-condition itself
      // flipped off — a fresh credits/end-of-video window then starts a
      // brand-new countdown. If we got here because autoplayCancelled
      // just flipped true, keep it true so the countdown stays stopped.
      if (!showNextEpisodeCountdown) {
        setAutoplayCancelled(false);
        setSecondsRemaining(settings.autoplayCountdownSeconds);
      }
      return;
    }

    setSecondsRemaining(settings.autoplayCountdownSeconds);
    intervalRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          autoPlayHandlerRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    showNextEpisodeCountdown,
    autoplayCancelled,
    settings.autoplayCountdownSeconds,
  ]);

  const nextEpisodePosterUrl = useMemo(
    () =>
      nextItem ? getPrimaryImageUrl({ api, item: nextItem, width: 200 }) : null,
    [api, nextItem],
  );

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
          right:
            (settings?.safeAreaInControlsEnabled ?? true) ? insets.right : 0,
          left: (settings?.safeAreaInControlsEnabled ?? true) ? insets.left : 0,
          bottom:
            (settings?.safeAreaInControlsEnabled ?? true)
              ? Math.max(insets.bottom - 17, 0)
              : 0,
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
        <View className='flex flex-row items-center space-x-2 shrink-0'>
          {hasChapters && (
            <Pressable
              onPress={() => setChapterListVisible(true)}
              hitSlop={10}
              className='justify-center mr-4'
              accessibilityRole='button'
              accessibilityLabel={t("chapters.open")}
            >
              <Ionicons name='bookmarks' size={24} color='white' />
            </Pressable>
          )}
          <SkipButton
            showButton={showSkipButton}
            onPress={skipIntro}
            buttonText={skipButtonText}
          />
          {/* Smart Skip Credits behavior:
              - Show "Skip Credits" if there's content after credits OR no next episode
              - Show "Next Episode" if credits extend to video end AND next episode exists */}
          <SkipButton
            showButton={
              showSkipCreditButton && (hasContentAfterCredits || !nextItem)
            }
            onPress={skipCredit}
            buttonText={skipCreditButtonText}
          />
          {showNextEpisodeCountdown && !autoplayCancelled && nextItem && (
            <AutoplayCountdown
              nextEpisode={nextItem}
              posterUrl={nextEpisodePosterUrl}
              secondsRemaining={secondsRemaining}
              onPlayNow={handleNextEpisodeManual}
              onCancel={() => setAutoplayCancelled(true)}
            />
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
