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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChapterList } from "@/components/chapters/ChapterList";
import { ChapterTicks } from "@/components/chapters/ChapterTicks";
import { Text } from "@/components/common/Text";
import { useSettings } from "@/utils/atoms/settings";
import { chapterMarkers } from "@/utils/chapters";
import NextEpisodeCountDownButton from "./NextEpisodeCountDownButton";
import SkipButton from "./SkipButton";
import { TimeDisplay } from "./TimeDisplay";
import { TrickplayBubble } from "./TrickplayBubble";

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
  showSkipButton,
  skipButtonText,
  showSkipCreditButton,
  skipCreditButtonText,
  hasContentAfterCredits,
  skipIntro,
  skipCredit,
  nextItem,
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
  trickPlayUrl,
  trickplayInfo,
  time,
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
        className='shrink flex flex-col justify-center h-full'
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
        </View>
        <View className='flex flex-row items-center space-x-2 shrink-0'>
          {hasChapters && (
            <Pressable
              onPress={() => setChapterListVisible(true)}
              hitSlop={10}
              className='justify-center'
              accessibilityRole='button'
              accessibilityLabel={t("chapters.open")}
              style={{ marginBottom: 6 }}
            >
              <Ionicons name='list' size={24} color='white' />
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
          {settings.autoPlayNextEpisode !== false &&
            (settings.maxAutoPlayEpisodeCount.value === -1 ||
              settings.autoPlayEpisodeCount <
                settings.maxAutoPlayEpisodeCount.value) && (
              <NextEpisodeCountDownButton
                show={
                  !nextItem
                    ? false
                    : // Show during credits if no content after, OR near end of video
                      (showSkipCreditButton && !hasContentAfterCredits) ||
                      remainingTime < 10000
                }
                onFinish={handleNextEpisodeAutoPlay}
                onPress={handleNextEpisodeManual}
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
                  />
                )
              }
              sliderHeight={10}
              thumbWidth={0}
              progress={effectiveProgress}
              minimumValue={min}
              maximumValue={max}
            />
            <ChapterTicks chapters={chapters} durationMs={durationMs} />
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
        onSeek={(ms) => handleSliderComplete(ms)}
        onClose={() => setChapterListVisible(false)}
      />
    </View>
  );
};
