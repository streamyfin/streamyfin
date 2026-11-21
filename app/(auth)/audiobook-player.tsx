import { ExpoAvRoutePickerView } from "@douglowder/expo-av-route-picker-view";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { AudiobookCover } from "@/components/audiobooks/AudiobookCover";
import { SkipButton } from "@/components/audiobooks/SkipButton";
import {
  DraggableQueueList,
  type QueueRow,
} from "@/components/common/DraggableQueueList";
import { Text } from "@/components/common/Text";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import {
  AUDIOBOOK_PLAYBACK_RATES,
  AUDIOBOOK_SLEEP_TIMER_MINUTES,
  DEFAULT_AUDIOBOOK_SKIP_BACK_SECONDS,
  DEFAULT_AUDIOBOOK_SKIP_FORWARD_SECONDS,
} from "@/constants/Audiobooks";
import useRouter from "@/hooks/useAppRouter";
import {
  useAudiobookPlayer,
  useAudiobookProgress,
} from "@/providers/AudiobookPlayerProvider";
import { squareArtworkSide } from "@/utils/artworkSize";
import { apiAtom } from "@/utils/atoms/api";
import { useSettings } from "@/utils/atoms/settings";
import {
  type AudiobookChapter,
  authorLine,
  chapterDisplayTitle,
} from "@/utils/audiobooks/books";
import {
  formatBookLength,
  formatClock,
  formatRate,
  formatTimeLeft,
} from "@/utils/audiobooks/format";
import { audiobookCoverUrl } from "@/utils/audiobooks/images";
import {
  SLEEP_TIMER_OFF,
  sleepTimerForMinutes,
} from "@/utils/audiobooks/sleepTimer";

type ViewMode = "player" | "chapters" | "bookmarks" | "queue";

const ACCENT = "#a78bfa";

/**
 * The audiobook player, opened from the mini player. Laid out for a book
 * rather than a song: the slider scrubs the chapter, the book's time left is
 * under it, and the controls skip by seconds and by chapter.
 */
export default function AudiobookPlayerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const player = useAudiobookPlayer();
  const [viewMode, setViewMode] = useState<ViewMode>("player");

  const chapterName = useCallback(
    (chapter: AudiobookChapter | undefined, index: number) =>
      chapter
        ? chapterDisplayTitle(chapter, index, (number) =>
            t("chapters.chapter_number", { number }),
          )
        : "",
    [t],
  );

  if (!player.book) {
    return (
      <View
        className='flex-1 bg-[#121212] items-center justify-center'
        style={{ paddingTop: Platform.OS === "android" ? insets.top : 0 }}
      >
        <Text className='text-neutral-500'>
          {t("audiobooks.nothing_playing")}
        </Text>
      </View>
    );
  }

  const tabs: {
    mode: ViewMode;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
  }[] = [
    { mode: "player", icon: "book", label: t("audiobooks.now_playing") },
    { mode: "chapters", icon: "list", label: t("chapters.title") },
    { mode: "bookmarks", icon: "bookmarks", label: t("audiobooks.bookmarks") },
    { mode: "queue", icon: "albums", label: t("audiobooks.up_next") },
  ];

  return (
    <View
      className='flex-1 bg-[#121212]'
      style={{
        paddingTop: Platform.OS === "android" ? insets.top : 0,
        paddingBottom: Platform.OS === "android" ? insets.bottom : 0,
      }}
    >
      <View className='flex-row items-center justify-between px-4 pt-3 pb-2'>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          className='p-2'
          accessibilityRole='button'
          accessibilityLabel={t("common.close")}
        >
          <Ionicons name='chevron-down' size={28} color='white' />
        </TouchableOpacity>
        <View className='flex-row bg-neutral-900 rounded-full p-1'>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.mode}
              onPress={() => setViewMode(tab.mode)}
              className='px-4 py-1.5 rounded-full'
              style={{
                backgroundColor:
                  viewMode === tab.mode ? "rgba(147,52,233,0.35)" : undefined,
              }}
              accessibilityRole='tab'
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: viewMode === tab.mode }}
            >
              <Ionicons
                name={tab.icon}
                size={18}
                color={viewMode === tab.mode ? "white" : "#737373"}
              />
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ width: 44 }} />
      </View>

      {viewMode === "player" && (
        <PlayerView
          chapterName={chapterName}
          onOpenChapters={() => setViewMode("chapters")}
        />
      )}
      {viewMode === "chapters" && <ChaptersView chapterName={chapterName} />}
      {viewMode === "bookmarks" && <BookmarksView />}
      {viewMode === "queue" && <QueueView />}
    </View>
  );
}

interface ChapterNameProps {
  chapterName: (chapter: AudiobookChapter | undefined, index: number) => string;
}

const PlayerView: React.FC<
  ChapterNameProps & { onOpenChapters: () => void }
> = ({ chapterName, onOpenChapters }) => {
  const { t } = useTranslation();
  const windowSize = useWindowDimensions();
  const { settings } = useSettings();
  const player = useAudiobookPlayer();
  const { position, duration, chapterIndex } = useAudiobookProgress();
  const book = player.book!;
  const chapter = player.chapters[chapterIndex];
  const coverSize = squareArtworkSide(windowSize, { inset: 72 });

  const skipBack =
    settings?.audiobookSkipBackSeconds ?? DEFAULT_AUDIOBOOK_SKIP_BACK_SECONDS;
  const skipForward =
    settings?.audiobookSkipForwardSeconds ??
    DEFAULT_AUDIOBOOK_SKIP_FORWARD_SECONDS;

  // The slider scrubs the chapter; a book without chapters is one chapter.
  const rangeStart = chapter?.start ?? 0;
  const rangeEnd = chapter?.end ?? duration;
  const sliderProgress = useSharedValue(position);
  const sliderMin = useSharedValue(rangeStart);
  const sliderMax = useSharedValue(Math.max(rangeEnd, rangeStart + 1));
  useEffect(() => {
    sliderProgress.value = position;
  }, [position, sliderProgress]);
  useEffect(() => {
    sliderMin.value = rangeStart;
    sliderMax.value = Math.max(rangeEnd, rangeStart + 1);
  }, [rangeStart, rangeEnd, sliderMin, sliderMax]);

  const rate = player.rate;
  const inChapter = Math.max(position - rangeStart, 0);
  const chapterLeft = Math.max(rangeEnd - position, 0) / rate;
  const bookLeft = Math.max(duration - position, 0) / rate;
  const percent = duration > 0 ? Math.round((position / duration) * 100) : 0;

  const speedGroups = useMemo(
    () => [
      {
        options: AUDIOBOOK_PLAYBACK_RATES.map((value) => ({
          type: "radio" as const,
          label: formatRate(value),
          value: String(value),
          selected: value === rate,
          onPress: () => player.setRate(value),
        })),
      },
    ],
    [rate, player.setRate],
  );

  const sleep = player.sleepTimer;
  const sleepGroups = useMemo(
    () => [
      {
        options: [
          {
            type: "radio" as const,
            label: t("audiobooks.sleep.off"),
            value: "off",
            selected: sleep.mode === "off",
            onPress: () => player.setSleepTimer(SLEEP_TIMER_OFF),
          },
          ...AUDIOBOOK_SLEEP_TIMER_MINUTES.map((minutes) => ({
            type: "radio" as const,
            label: t("audiobooks.sleep.minutes", { count: minutes }),
            value: String(minutes),
            selected:
              sleep.mode === "duration" && sleep.totalMs === minutes * 60_000,
            onPress: () => player.setSleepTimer(sleepTimerForMinutes(minutes)),
          })),
          {
            type: "radio" as const,
            label: t("audiobooks.sleep.end_of_chapter"),
            value: "chapter",
            selected: sleep.mode === "chapter",
            onPress: () => player.setSleepTimer({ mode: "chapter" }),
          },
        ],
      },
    ],
    [sleep, player.setSleepTimer, t],
  );

  const sleepLabel =
    sleep.mode === "duration"
      ? formatClock(sleep.remainingMs / 1000)
      : sleep.mode === "chapter"
        ? t("audiobooks.sleep.chapter_short")
        : t("audiobooks.sleep.title");

  const onBookmark = useCallback(() => {
    const bookmark = player.addBookmark();
    if (bookmark) {
      toast.success(
        t("audiobooks.bookmark_added", {
          time: formatClock(bookmark.position),
        }),
      );
    }
  }, [player, t]);

  const busy = player.isLoading;

  return (
    <ScrollView className='flex-1 px-6' showsVerticalScrollIndicator={false}>
      <View
        className='self-center mt-4 mb-7'
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.5,
          shadowRadius: 18,
          elevation: 12,
        }}
      >
        <AudiobookCover book={book} size={coverSize} />
      </View>

      <Text numberOfLines={2} className='text-white text-2xl font-bold'>
        {book.title}
      </Text>
      {authorLine(book) && (
        <Text numberOfLines={1} className='text-neutral-400 text-base mt-0.5'>
          {authorLine(book)}
        </Text>
      )}

      {player.chapters.length > 1 && (
        <TouchableOpacity
          onPress={onOpenChapters}
          className='flex-row items-center mt-4'
          accessibilityRole='button'
        >
          <Ionicons name='list' size={16} color={ACCENT} />
          <Text numberOfLines={1} className='text-purple-300 ml-2 flex-1'>
            {chapterName(chapter, chapterIndex)}
          </Text>
          <Text className='text-neutral-500 text-xs ml-2'>
            {t("audiobooks.chapter_of", {
              current: chapterIndex + 1,
              total: player.chapters.length,
            })}
          </Text>
        </TouchableOpacity>
      )}

      <View className='mt-4'>
        <Slider
          theme={{
            maximumTrackTintColor: "rgba(255,255,255,0.2)",
            minimumTrackTintColor: "#fff",
            bubbleBackgroundColor: "#fff",
            bubbleTextColor: "#666",
          }}
          progress={sliderProgress}
          minimumValue={sliderMin}
          maximumValue={sliderMax}
          onSlidingComplete={(value) => player.seekTo(value)}
          renderThumb={() => null}
          sliderHeight={8}
          containerStyle={{ borderRadius: 100 }}
          renderBubble={() => null}
        />
        <View className='flex-row justify-between mt-2'>
          <Text className='text-neutral-500 text-xs'>
            {formatClock(inChapter)}
          </Text>
          <Text className='text-neutral-500 text-xs'>
            -{formatClock(chapterLeft)}
          </Text>
        </View>
        <Text className='text-neutral-400 text-xs text-center mt-1'>
          {t("audiobooks.book_left_percent", {
            left: formatTimeLeft(bookLeft, t),
            percent,
          })}
        </Text>
      </View>

      <View className='flex-row items-center justify-between mt-6 mb-6'>
        <TouchableOpacity
          onPress={player.previousChapter}
          disabled={busy}
          hitSlop={10}
          className='p-2'
          accessibilityRole='button'
          accessibilityLabel={t("audiobooks.previous_chapter")}
        >
          <Ionicons name='play-skip-back' size={26} color='white' />
        </TouchableOpacity>
        <SkipButton
          direction='back'
          seconds={skipBack}
          size={36}
          onPress={player.skipBackward}
          disabled={busy}
        />
        <TouchableOpacity
          onPress={player.togglePlayPause}
          disabled={busy}
          className='bg-white rounded-full items-center justify-center'
          style={{ width: 76, height: 76 }}
          accessibilityRole='button'
          accessibilityLabel={
            player.isPlaying ? t("audiobooks.pause") : t("audiobooks.play")
          }
        >
          {busy || (player.isBuffering && player.isPlaying) ? (
            <ActivityIndicator size='large' color='#121212' />
          ) : (
            <Ionicons
              name={player.isPlaying ? "pause" : "play"}
              size={38}
              color='#121212'
              style={player.isPlaying ? undefined : { marginLeft: 4 }}
            />
          )}
        </TouchableOpacity>
        <SkipButton
          direction='forward'
          seconds={skipForward}
          size={36}
          onPress={player.skipForward}
          disabled={busy}
        />
        <TouchableOpacity
          onPress={player.nextChapter}
          disabled={busy || chapterIndex >= player.chapters.length - 1}
          hitSlop={10}
          className='p-2'
          style={{
            opacity: chapterIndex >= player.chapters.length - 1 ? 0.35 : 1,
          }}
          accessibilityRole='button'
          accessibilityLabel={t("audiobooks.next_chapter")}
        >
          <Ionicons name='play-skip-forward' size={26} color='white' />
        </TouchableOpacity>
      </View>

      <View className='flex-row items-center justify-around mb-10'>
        <PlatformDropdown
          title={t("playback_speed.title")}
          groups={speedGroups}
          trigger={
            <View className='items-center px-2 py-1'>
              <Text className='text-white text-base font-semibold'>
                {formatRate(rate)}
              </Text>
              <Text className='text-neutral-500 text-[11px]'>
                {t("playback_speed.speed")}
              </Text>
            </View>
          }
        />
        <PlatformDropdown
          title={t("audiobooks.sleep.title")}
          groups={sleepGroups}
          trigger={
            <View className='items-center px-2 py-1'>
              <MaterialCommunityIcons
                name={sleep.mode === "off" ? "power-sleep" : "sleep"}
                size={22}
                color={sleep.mode === "off" ? "white" : ACCENT}
              />
              <Text
                className='text-[11px]'
                style={{ color: sleep.mode === "off" ? "#737373" : ACCENT }}
              >
                {sleepLabel}
              </Text>
            </View>
          }
        />
        <TouchableOpacity
          onPress={onBookmark}
          className='items-center px-2 py-1'
          accessibilityRole='button'
        >
          <MaterialCommunityIcons
            name='bookmark-plus-outline'
            size={22}
            color='white'
          />
          <Text className='text-neutral-500 text-[11px]'>
            {t("audiobooks.bookmark")}
          </Text>
        </TouchableOpacity>
        {Platform.OS === "ios" && (
          <View className='items-center px-2 py-1'>
            <View
              style={{
                transform: [{ scale: 1.6 }],
                height: 22,
                justifyContent: "center",
              }}
            >
              <ExpoAvRoutePickerView
                style={{ width: 22, height: 22 }}
                tintColor='#ffffff'
                activeTintColor={ACCENT}
              />
            </View>
            <Text className='text-neutral-500 text-[11px]'>
              {t("audiobooks.output")}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const ChaptersView: React.FC<ChapterNameProps> = ({ chapterName }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const player = useAudiobookPlayer();
  const { position, chapterIndex } = useAudiobookProgress();

  return (
    <FlashList
      data={player.chapters}
      keyExtractor={(chapter) => `${chapter.partIndex}-${chapter.start}`}
      extraData={chapterIndex}
      initialScrollIndex={Math.max(chapterIndex - 2, 0)}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      renderItem={({ item: chapter, index }) => {
        const current = index === chapterIndex;
        const played = index < chapterIndex;
        const share = current
          ? Math.min(
              Math.max(
                (position - chapter.start) / (chapter.end - chapter.start),
                0,
              ),
              1,
            )
          : 0;
        return (
          <TouchableOpacity
            onPress={() => player.jumpToChapter(index)}
            className='px-5 py-3'
            style={{
              backgroundColor: current ? "rgba(147,52,233,0.12)" : undefined,
            }}
          >
            <View className='flex-row items-center'>
              <Text
                className='text-sm'
                style={{ width: 32, color: current ? ACCENT : "#737373" }}
              >
                {index + 1}
              </Text>
              <Text
                numberOfLines={1}
                className='flex-1'
                style={{
                  color: current ? "white" : played ? "#a3a3a3" : "white",
                }}
              >
                {chapterName(chapter, index)}
              </Text>
              <Text className='text-neutral-500 text-xs ml-2'>
                {formatBookLength(chapter.end - chapter.start, t)}
              </Text>
            </View>
            {current && (
              <View className='h-0.5 bg-neutral-800 rounded-full mt-2 ml-8 overflow-hidden'>
                <View
                  className='h-full bg-purple-400'
                  style={{ width: `${share * 100}%` }}
                />
              </View>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
};

const BookmarksView: React.FC = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const player = useAudiobookPlayer();
  const book = player.book!;
  const bookmarks = useMemo(
    () => player.getBookmarks(book.id),
    [book.id, player.getBookmarks, player.bookmarksRevision],
  );

  return (
    <ScrollView
      className='flex-1'
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <TouchableOpacity
        onPress={() => player.addBookmark()}
        className='flex-row items-center mx-5 my-3 bg-neutral-900 rounded-xl px-4 py-3'
        accessibilityRole='button'
      >
        <MaterialCommunityIcons
          name='bookmark-plus-outline'
          size={20}
          color={ACCENT}
        />
        <Text className='text-white ml-3'>{t("audiobooks.add_bookmark")}</Text>
      </TouchableOpacity>
      {bookmarks.length === 0 ? (
        <Text className='text-neutral-500 text-center mt-8 px-6'>
          {t("audiobooks.no_bookmarks")}
        </Text>
      ) : (
        bookmarks.map((bookmark) => (
          <View key={bookmark.id} className='flex-row items-center px-5 py-3'>
            <TouchableOpacity
              className='flex-1 flex-row items-center'
              onPress={() => player.seekTo(bookmark.position)}
            >
              <Ionicons name='bookmark' size={16} color={ACCENT} />
              <View className='ml-3 flex-1'>
                <Text className='text-white'>
                  {formatClock(bookmark.position)}
                </Text>
                {!!bookmark.chapterTitle && (
                  <Text
                    numberOfLines={1}
                    className='text-neutral-500 text-xs mt-0.5'
                  >
                    {bookmark.chapterTitle}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => player.removeBookmark(book.id, bookmark.id)}
              hitSlop={10}
              className='p-2'
              accessibilityRole='button'
              accessibilityLabel={t("common.remove")}
            >
              <Ionicons name='trash-outline' size={18} color='#737373' />
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
};

const QueueView: React.FC = () => {
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const player = useAudiobookPlayer();
  const rows = useMemo<QueueRow[]>(
    () =>
      player.queue.map((book) => ({
        key: book.id,
        title: book.title,
        subtitle: authorLine(book) ?? undefined,
        imageUrl: audiobookCoverUrl(api, book, 120),
      })),
    [api, player.queue],
  );

  return (
    <DraggableQueueList
      rows={rows}
      currentIndex={-1}
      icon='book'
      header={t("audiobooks.up_next")}
      emptyText={t("audiobooks.queue_empty")}
      onPressRow={player.playFromQueue}
      onRemoveRow={player.removeFromQueue}
      onMoveRow={player.moveInQueue}
    />
  );
};
