import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { AudiobookCard } from "@/components/audiobooks/AudiobookCard";
import { HorizontalScroll } from "@/components/common/HorizontalScroll";
import { Text } from "@/components/common/Text";
import { useAudiobookProgressMap } from "@/hooks/useAudiobookLibrary";
import type { Audiobook } from "@/utils/audiobooks/books";

const CARD_WIDTH = 120;

/** The downloaded books on the downloads screen, which plays them offline. */
export const DownloadedAudiobooksRow: React.FC<{ books: Audiobook[] }> = ({
  books,
}) => {
  const { t } = useTranslation();
  const progress = useAudiobookProgressMap(books);
  if (books.length === 0) return null;
  return (
    <View className='mb-4'>
      <Text className='text-lg font-bold px-4 mb-2'>
        {t("audiobooks.title")}
      </Text>
      <HorizontalScroll
        data={books}
        height={CARD_WIDTH + 88}
        keyExtractor={(book) => book.id}
        renderItem={(book) => {
          const entry = progress.get(book.id);
          return (
            <AudiobookCard
              book={book}
              width={CARD_WIDTH}
              progress={entry?.fraction}
              finished={entry?.point.finished}
              secondsLeft={entry ? entry.duration - entry.listened : undefined}
            />
          );
        }}
      />
    </View>
  );
};
