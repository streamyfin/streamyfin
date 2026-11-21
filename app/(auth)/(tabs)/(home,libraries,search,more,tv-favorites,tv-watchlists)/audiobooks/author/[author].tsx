import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudiobookCard } from "@/components/audiobooks/AudiobookCard";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import {
  useAudiobookLibrary,
  useAudiobookProgressMap,
} from "@/hooks/useAudiobookLibrary";
import { booksByAuthor } from "@/utils/audiobooks/listing";

const MIN_CARD_WIDTH = 120;
const GRID_PADDING = 16;
const GRID_GAP = 14;

/** One author's books in a library. */
export default function AudiobookAuthorScreen() {
  const { author, libraryId } = useLocalSearchParams<{
    author: string;
    libraryId?: string;
  }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const { books, isLoading } = useAudiobookLibrary(libraryId);
  const shown = useMemo(
    () =>
      author
        ? booksByAuthor(books, author).sort(
            (a, b) =>
              (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title),
          )
        : [],
    [books, author],
  );
  const progress = useAudiobookProgressMap(shown);

  useEffect(() => {
    navigation.setOptions({ title: author ?? "" });
  }, [navigation, author]);

  const columns = Math.max(
    2,
    Math.floor(
      (windowWidth - GRID_PADDING * 2 + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP),
    ),
  );
  const cardWidth =
    (windowWidth - GRID_PADDING * 2 - GRID_GAP * (columns - 1)) / columns;

  if (isLoading && shown.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  return (
    <FlashList
      data={shown}
      numColumns={columns}
      key={columns}
      keyExtractor={(book) => book.id}
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingHorizontal: GRID_PADDING - GRID_GAP / 2,
        paddingTop: 12,
        paddingBottom: insets.bottom + 100,
      }}
      ListEmptyComponent={
        <Text className='text-neutral-500 text-center mt-10 px-6'>
          {t("audiobooks.no_books")}
        </Text>
      }
      renderItem={({ item: book }) => {
        const entry = progress.get(book.id);
        return (
          <View style={{ paddingHorizontal: GRID_GAP / 2, marginBottom: 18 }}>
            <AudiobookCard
              book={book}
              width={cardWidth}
              libraryId={libraryId}
              progress={entry?.fraction}
              finished={entry?.point.finished}
              secondsLeft={entry ? entry.duration - entry.listened : undefined}
            />
          </View>
        );
      }}
    />
  );
}
