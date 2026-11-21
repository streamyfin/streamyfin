import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudiobookCover } from "@/components/audiobooks/AudiobookCover";
import { useAudiobookLibraryId } from "@/components/audiobooks/AudiobookLibraryContext";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import useRouter from "@/hooks/useAppRouter";
import { useAudiobookLibrary } from "@/hooks/useAudiobookLibrary";
import { groupByAuthor } from "@/utils/audiobooks/listing";

const COVER_SIZE = 52;

/** The library's authors, with how many of their books it holds. */
export default function AudiobookAuthorsScreen() {
  const libraryId = useAudiobookLibraryId();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { books, isLoading } = useAudiobookLibrary(libraryId);
  const authors = useMemo(() => groupByAuthor(books), [books]);

  if (isLoading && books.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black'>
      <FlashList
        data={authors}
        keyExtractor={(entry) => entry.name}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        ListEmptyComponent={
          <Text className='text-neutral-500 text-center mt-10 px-6'>
            {t("audiobooks.no_authors")}
          </Text>
        }
        renderItem={({ item: entry }) => (
          <TouchableOpacity
            className='flex-row items-center px-4 py-2.5'
            onPress={() =>
              router.push({
                pathname: "/audiobooks/author/[author]",
                params: {
                  author: entry.name,
                  ...(libraryId ? { libraryId } : {}),
                },
              })
            }
          >
            <AudiobookCover book={entry.books[0]} size={COVER_SIZE} />
            <View className='flex-1 ml-3'>
              <Text numberOfLines={1} className='text-white text-base'>
                {entry.name}
              </Text>
              <Text className='text-neutral-500 text-xs mt-0.5'>
                {t("audiobooks.book_count", { count: entry.books.length })}
              </Text>
            </View>
            <Ionicons name='chevron-forward' size={18} color='#525252' />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
