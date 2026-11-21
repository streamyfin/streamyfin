import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { AudiobookCover } from "@/components/audiobooks/AudiobookCover";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import useRouter from "@/hooks/useAppRouter";
import { useAudiobookDownload } from "@/hooks/useAudiobookDownload";
import {
  useAudiobook,
  useAudiobookProgressMap,
} from "@/hooks/useAudiobookLibrary";
import { useAudiobookOptions } from "@/hooks/useAudiobookOptions";
import {
  useAudiobookPlayer,
  useAudiobookProgress,
} from "@/providers/AudiobookPlayerProvider";
import { squareArtworkSide } from "@/utils/artworkSize";
import {
  type AudiobookChapter,
  buildChapters,
  chapterDisplayTitle,
  chapterIndexAt,
} from "@/utils/audiobooks/books";
import {
  formatBookLength,
  formatClock,
  formatTimeLeft,
} from "@/utils/audiobooks/format";

const OVERVIEW_LINES = 4;

/**
 * A book: cover, who wrote and reads it, how far in, its description, the
 * bookmarks and the chapters. `bookId` is the id of any of its files.
 */
export default function AudiobookScreen() {
  const { bookId, libraryId: libraryParam } = useLocalSearchParams<{
    bookId: string;
    libraryId?: string;
  }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const windowSize = useWindowDimensions();
  // The square follows the window's short side, see utils/artworkSize.ts.
  const coverSize = squareArtworkSide(windowSize, { ratio: 0.58 });

  const {
    book,
    libraryId: libraryFromServer,
    isLoading,
    isOffline,
  } = useAudiobook(bookId);
  const libraryId = libraryParam ?? libraryFromServer ?? undefined;
  const player = useAudiobookPlayer();
  const live = useAudiobookProgress();
  const showOptions = useAudiobookOptions(libraryId);
  const download = useAudiobookDownload(book);
  const [overviewOpen, setOverviewOpen] = useState(false);

  const books = useMemo(() => (book ? [book] : []), [book]);
  const entry = useAudiobookProgressMap(books).get(book?.id ?? "");
  const chapters = useMemo(() => (book ? buildChapters(book) : []), [book]);

  const isCurrent = !!book && player.book?.id === book.id;
  const isPlayingThis = isCurrent && player.isPlaying;
  const finished = !isCurrent && !!entry?.point.finished;
  const position = isCurrent ? live.position : (entry?.listened ?? 0);
  const duration = entry?.duration ?? 0;
  const started = isCurrent || (!!entry && entry.listened > 0 && !finished);
  const currentChapter = started ? chapterIndexAt(chapters, position) : -1;

  const bookmarks = useMemo(
    () => (book ? player.getBookmarks(book.id) : []),
    [book, player.getBookmarks, player.bookmarksRevision],
  );

  const chapterName = useCallback(
    (chapter: AudiobookChapter, index: number) =>
      chapterDisplayTitle(chapter, index, (number) =>
        t("chapters.chapter_number", { number }),
      ),
    [t],
  );

  const onPlay = useCallback(() => {
    if (!book) return;
    if (isCurrent) player.togglePlayPause();
    else player.playBook(book);
  }, [book, isCurrent, player]);

  const onDownload = useCallback(() => {
    if (!book) return;
    if (download.status === "done") {
      Alert.alert(t("audiobooks.delete_download"), book.title, [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => download.remove(),
        },
      ]);
      return;
    }
    if (download.status === "downloading") return;
    download.download().then((result) => {
      if (result && result.unavailable > 0) {
        toast.error(t("audiobooks.download_unavailable"));
      }
    });
  }, [book, download, t]);

  if (!book) {
    return (
      <View className='flex-1 justify-center items-center bg-black px-6'>
        {isLoading ? (
          <Loader />
        ) : (
          <Text className='text-neutral-500 text-center'>
            {isOffline
              ? t("audiobooks.not_downloaded")
              : t("audiobooks.book_not_found")}
          </Text>
        )}
      </View>
    );
  }

  const playLabel = isPlayingThis
    ? t("audiobooks.pause")
    : finished
      ? t("audiobooks.listen_again")
      : started
        ? t("audiobooks.resume")
        : t("audiobooks.play");

  const meta = [
    formatBookLength(duration, t),
    book.year ? String(book.year) : null,
    chapters.length > 1
      ? t("audiobooks.chapter_count", { count: chapters.length })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const header = (
    <View style={{ paddingTop: insets.top + 56 }} className='px-5 pb-2'>
      <View className='items-center'>
        <View
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
        <Text className='text-white text-2xl font-bold mt-5 text-center'>
          {book.title}
        </Text>
        {book.authors.length > 0 && (
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/audiobooks/author/[author]",
                params: {
                  author: book.authors[0],
                  ...(libraryId ? { libraryId } : {}),
                },
              })
            }
          >
            <Text className='text-purple-400 text-base mt-1 text-center'>
              {book.authors.join(", ")}
            </Text>
          </TouchableOpacity>
        )}
        {book.narrators.length > 0 && (
          <Text className='text-neutral-400 text-sm mt-1 text-center'>
            {t("audiobooks.read_by", { names: book.narrators.join(", ") })}
          </Text>
        )}
        <Text className='text-neutral-500 text-xs mt-1.5'>{meta}</Text>
      </View>

      {(started || finished) && (
        <View className='mt-5'>
          <View className='h-1.5 rounded-full bg-neutral-800 overflow-hidden'>
            <View
              className='h-full bg-purple-500'
              style={{
                width: `${duration > 0 ? Math.min(position / duration, 1) * 100 : 0}%`,
              }}
            />
          </View>
          <Text className='text-neutral-400 text-xs mt-1.5'>
            {finished
              ? t("audiobooks.finished")
              : formatTimeLeft(
                  Math.max(duration - position, 0) /
                    (isCurrent ? player.rate : 1),
                  t,
                )}
          </Text>
        </View>
      )}

      <View className='flex-row items-center mt-5' style={{ gap: 12 }}>
        <TouchableOpacity
          onPress={onPlay}
          disabled={isCurrent && player.isLoading}
          className='flex-1 flex-row items-center justify-center bg-purple-600 rounded-full py-3.5'
          accessibilityRole='button'
        >
          {isCurrent && player.isLoading ? (
            <ActivityIndicator color='white' />
          ) : (
            <>
              <Ionicons
                name={isPlayingThis ? "pause" : "play"}
                size={20}
                color='white'
              />
              <Text className='text-white font-semibold ml-2'>{playLabel}</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDownload}
          className='bg-neutral-800 rounded-full items-center justify-center'
          style={{ width: 50, height: 50 }}
          accessibilityRole='button'
          accessibilityLabel={
            download.status === "done"
              ? t("audiobooks.delete_download")
              : t("audiobooks.download")
          }
        >
          {download.status === "downloading" ? (
            <View className='items-center'>
              <ActivityIndicator size='small' color='white' />
              {download.progress > 0 && (
                <Text className='text-[9px] text-neutral-300'>
                  {Math.round(download.progress * 100)}%
                </Text>
              )}
            </View>
          ) : (
            <Ionicons
              name={
                download.status === "done"
                  ? "checkmark-circle"
                  : "arrow-down-circle-outline"
              }
              size={24}
              color={download.status === "done" ? "#22c55e" : "white"}
            />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => showOptions(book, { finished })}
          className='bg-neutral-800 rounded-full items-center justify-center'
          style={{ width: 50, height: 50 }}
          accessibilityRole='button'
          accessibilityLabel={t("audiobooks.more")}
        >
          <Ionicons name='ellipsis-horizontal' size={22} color='white' />
        </TouchableOpacity>
      </View>

      {!!book.overview && (
        <TouchableOpacity
          className='mt-5'
          activeOpacity={0.8}
          onPress={() => setOverviewOpen((open) => !open)}
        >
          <Text
            className='text-neutral-300 text-sm leading-5'
            numberOfLines={overviewOpen ? undefined : OVERVIEW_LINES}
          >
            {book.overview}
          </Text>
          <Text className='text-purple-400 text-xs mt-1'>
            {overviewOpen ? t("audiobooks.less") : t("audiobooks.more")}
          </Text>
        </TouchableOpacity>
      )}

      {bookmarks.length > 0 && (
        <View className='mt-6'>
          <Text className='text-white text-lg font-bold mb-2'>
            {t("audiobooks.bookmarks")}
          </Text>
          {bookmarks.map((bookmark) => (
            <TouchableOpacity
              key={bookmark.id}
              className='flex-row items-center py-2'
              onPress={() =>
                player.playBook(book, { position: bookmark.position })
              }
            >
              <Ionicons name='bookmark' size={16} color='#a78bfa' />
              <Text className='text-white ml-3'>
                {formatClock(bookmark.position)}
              </Text>
              {!!bookmark.chapterTitle && (
                <Text
                  numberOfLines={1}
                  className='text-neutral-400 ml-2 flex-1'
                >
                  {bookmark.chapterTitle}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {chapters.length > 1 && (
        <Text className='text-white text-lg font-bold mt-6 mb-1'>
          {t("chapters.title")}
        </Text>
      )}
    </View>
  );

  return (
    <FlashList
      data={chapters.length > 1 ? chapters : []}
      keyExtractor={(chapter) => `${chapter.partIndex}-${chapter.start}`}
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      extraData={currentChapter}
      renderItem={({ item: chapter, index }) => {
        const isCurrentChapter = index === currentChapter;
        return (
          <TouchableOpacity
            className='flex-row items-center px-5 py-3'
            onPress={() => player.playBook(book, { position: chapter.start })}
          >
            <View style={{ width: 30 }}>
              {isCurrentChapter ? (
                <Ionicons
                  name={isPlayingThis ? "volume-high" : "bookmark"}
                  size={15}
                  color='#a78bfa'
                />
              ) : (
                <Text className='text-neutral-500 text-sm'>{index + 1}</Text>
              )}
            </View>
            <View className='flex-1'>
              <Text
                numberOfLines={1}
                className={
                  isCurrentChapter
                    ? "text-purple-300 font-medium"
                    : "text-white"
                }
              >
                {chapterName(chapter, index)}
              </Text>
              <Text className='text-neutral-500 text-xs mt-0.5'>
                {formatClock(chapter.start)}
              </Text>
            </View>
            <Text className='text-neutral-500 text-xs ml-2'>
              {formatBookLength(chapter.end - chapter.start, t)}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}
