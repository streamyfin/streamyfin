import { FlashList } from "@shopify/flash-list";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudiobookCard } from "@/components/audiobooks/AudiobookCard";
import { useAudiobookLibraryId } from "@/components/audiobooks/AudiobookLibraryContext";
import { HorizontalScroll } from "@/components/common/HorizontalScroll";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { AUDIOBOOK_ROW_LIMIT } from "@/constants/Audiobooks";
import {
  useAudiobookLibrary,
  useAudiobookProgressMap,
} from "@/hooks/useAudiobookLibrary";
import { useAudiobookPlayer } from "@/providers/AudiobookPlayerProvider";
import type { Audiobook } from "@/utils/audiobooks/books";
import { isInProgress } from "@/utils/audiobooks/progress";
import { getDownloadedBook } from "@/utils/audiobooks/storage";

const CARD_WIDTH = 130;
// The cover, two lines of title, the author and the time left.
const ROW_HEIGHT = CARD_WIDTH + 88;

interface Section {
  key: string;
  title: string;
  books: Audiobook[];
}

/**
 * A books library's first tab: the books being listened to, the ones added
 * last and the ones on this device. Rows are worked out from the whole
 * library, see hooks/useAudiobookLibrary.ts.
 */
export default function AudiobookListenNowScreen() {
  const libraryId = useAudiobookLibraryId();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { books, isLoading, isError, refetch, isRefetching, isOffline } =
    useAudiobookLibrary(libraryId);
  const progress = useAudiobookProgressMap(books);
  const { book: currentBook } = useAudiobookPlayer();

  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];
    const listening = books
      .filter((book) => {
        const entry = progress.get(book.id);
        return (
          book.id === currentBook?.id || (entry && isInProgress(entry.point))
        );
      })
      .sort((a, b) => {
        // The book in the player first, then the latest listened.
        if (a.id === currentBook?.id) return -1;
        if (b.id === currentBook?.id) return 1;
        return (
          (progress.get(b.id)?.point.at ?? 0) -
          (progress.get(a.id)?.point.at ?? 0)
        );
      });
    if (listening.length > 0) {
      result.push({
        key: "listening",
        title: t("audiobooks.continue_listening"),
        books: listening.slice(0, AUDIOBOOK_ROW_LIMIT),
      });
    }

    const added = [...books]
      .sort((a, b) => (b.dateCreated ?? "").localeCompare(a.dateCreated ?? ""))
      .slice(0, AUDIOBOOK_ROW_LIMIT);
    if (added.length > 0 && !isOffline) {
      result.push({
        key: "added",
        title: t("audiobooks.recently_added"),
        books: added,
      });
    }

    const downloaded = books.filter((book) => getDownloadedBook(book.id));
    if (downloaded.length > 0) {
      result.push({
        key: "downloaded",
        title: t("audiobooks.downloaded"),
        books: downloaded.slice(0, AUDIOBOOK_ROW_LIMIT),
      });
    }
    return result;
  }, [books, progress, currentBook?.id, isOffline, t]);

  if (isLoading && books.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black px-6'>
        <Text className='text-neutral-500 text-center'>
          {isError
            ? t("audiobooks.failed_to_load_library")
            : isOffline
              ? t("audiobooks.no_downloaded_books")
              : t("audiobooks.no_books")}
        </Text>
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black'>
      <FlashList
        data={sections}
        keyExtractor={(section) => section.key}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 100,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
            }}
            tintColor='#9334E9'
          />
        }
        renderItem={({ item: section }) => (
          <View className='mb-6'>
            <Text className='text-lg font-bold px-4 mb-3'>{section.title}</Text>
            <HorizontalScroll
              data={section.books}
              height={ROW_HEIGHT}
              keyExtractor={(book) => book.id}
              renderItem={(book) => {
                const entry = progress.get(book.id);
                return (
                  <AudiobookCard
                    book={book}
                    width={CARD_WIDTH}
                    libraryId={libraryId}
                    progress={entry?.fraction}
                    finished={entry?.point.finished}
                    secondsLeft={
                      entry ? entry.duration - entry.listened : undefined
                    }
                  />
                );
              }}
            />
          </View>
        )}
      />
    </View>
  );
}
