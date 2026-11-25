import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshControl,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudiobookCard } from "@/components/audiobooks/AudiobookCard";
import { useAudiobookLibraryId } from "@/components/audiobooks/AudiobookLibraryContext";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import {
  useAudiobookLibrary,
  useAudiobookProgressMap,
} from "@/hooks/useAudiobookLibrary";
import {
  type AudiobookFilter,
  type AudiobookSort,
  filterAndSortBooks,
} from "@/utils/audiobooks/listing";

const MIN_CARD_WIDTH = 110;
const GRID_PADDING = 16;
const GRID_GAP = 14;

/** Every book in the library, in a grid, with a search, a sort and a filter. */
export default function AudiobookBooksScreen() {
  const libraryId = useAudiobookLibraryId();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { books, isLoading, refetch, isRefetching, isOffline } =
    useAudiobookLibrary(libraryId);
  const progress = useAudiobookProgressMap(books);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<AudiobookSort>("title");
  const [filter, setFilter] = useState<AudiobookFilter>("all");

  const columns = Math.max(
    2,
    Math.floor(
      (windowWidth - GRID_PADDING * 2 + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP),
    ),
  );
  const cardWidth =
    (windowWidth - GRID_PADDING * 2 - GRID_GAP * (columns - 1)) / columns;

  const shown = useMemo(
    () => filterAndSortBooks(books, progress, { search, sort, filter }),
    [books, progress, search, sort, filter],
  );

  const sortGroups = useMemo(
    () => [
      {
        title: t("audiobooks.sort.title"),
        options: (
          [
            ["title", t("audiobooks.sort.by_title")],
            ["author", t("audiobooks.sort.by_author")],
            ["added", t("audiobooks.sort.by_added")],
            ["listened", t("audiobooks.sort.by_listened")],
          ] as [AudiobookSort, string][]
        ).map(([value, label]) => ({
          type: "radio" as const,
          label,
          value,
          selected: sort === value,
          onPress: () => setSort(value),
        })),
      },
      {
        title: t("audiobooks.filter.title"),
        options: (
          [
            ["all", t("audiobooks.filter.all")],
            ["unstarted", t("audiobooks.filter.unstarted")],
            ["started", t("audiobooks.filter.started")],
            ["finished", t("audiobooks.filter.finished")],
          ] as [AudiobookFilter, string][]
        ).map(([value, label]) => ({
          type: "radio" as const,
          label,
          value,
          selected: filter === value,
          onPress: () => setFilter(value),
        })),
      },
    ],
    [sort, filter, t],
  );

  if (isLoading && books.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black'>
      <View
        className='flex-row items-center bg-black'
        style={{
          paddingHorizontal: GRID_PADDING,
          paddingVertical: 10,
          gap: 10,
        }}
      >
        <View className='flex-1 flex-row items-center bg-neutral-900 rounded-xl px-3'>
          <Ionicons name='search' size={16} color='#737373' />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("audiobooks.search_placeholder")}
            placeholderTextColor='#737373'
            autoCorrect={false}
            clearButtonMode='while-editing'
            returnKeyType='search'
            style={{
              flex: 1,
              color: "white",
              paddingVertical: 9,
              marginLeft: 8,
            }}
          />
        </View>
        <PlatformDropdown
          title={t("audiobooks.sort.title")}
          groups={sortGroups}
          trigger={
            <View className='bg-neutral-900 rounded-xl p-2.5'>
              <Ionicons
                name='filter'
                size={18}
                color={filter === "all" ? "white" : "#a78bfa"}
              />
            </View>
          }
        />
      </View>
      <FlashList
        data={shown}
        numColumns={columns}
        key={columns}
        keyExtractor={(book) => book.id}
        keyboardDismissMode='on-drag'
        contentContainerStyle={{
          paddingHorizontal: GRID_PADDING - GRID_GAP / 2,
          paddingBottom: insets.bottom + 100,
        }}
        refreshControl={
          isOffline ? undefined : (
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetch();
              }}
              tintColor='#9334E9'
            />
          )
        }
        ListEmptyComponent={
          <Text className='text-neutral-500 text-center mt-10'>
            {books.length === 0
              ? isOffline
                ? t("audiobooks.no_downloaded_books")
                : t("audiobooks.no_books")
              : t("common.no_results")}
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
                secondsLeft={
                  entry ? entry.duration - entry.listened : undefined
                }
              />
            </View>
          );
        }}
      />
    </View>
  );
}
