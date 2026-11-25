import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { AudiobookCover } from "@/components/audiobooks/AudiobookCover";
import { Text } from "@/components/common/Text";
import useRouter from "@/hooks/useAppRouter";
import { useAudiobookOptions } from "@/hooks/useAudiobookOptions";
import { type Audiobook, authorLine } from "@/utils/audiobooks/books";
import { formatTimeLeft } from "@/utils/audiobooks/format";

interface Props {
  book: Audiobook;
  /** Fraction listened. */
  progress?: number;
  /** Seconds left, shown under the author when started. */
  secondsLeft?: number;
  finished?: boolean;
  libraryId?: string;
  width: number;
}

/** A book in a grid or a row: its cover, title, author and how far in. */
export const AudiobookCard: React.FC<Props> = ({
  book,
  progress,
  secondsLeft,
  finished,
  libraryId,
  width,
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const showOptions = useAudiobookOptions(libraryId);

  const open = useCallback(() => {
    router.push({
      pathname: "/audiobooks/book/[bookId]",
      params: { bookId: book.id, ...(libraryId ? { libraryId } : {}) },
    });
  }, [router, book.id, libraryId]);

  const started = !finished && (progress ?? 0) > 0;

  return (
    <TouchableOpacity
      onPress={open}
      onLongPress={() => showOptions(book, { finished })}
      style={{ width }}
      accessibilityRole='button'
      accessibilityLabel={book.title}
    >
      <AudiobookCover
        book={book}
        size={width}
        progress={progress}
        finished={finished}
      />
      <Text numberOfLines={2} className='text-white text-sm font-medium mt-2'>
        {book.title}
      </Text>
      {authorLine(book) && (
        <Text numberOfLines={1} className='text-neutral-400 text-xs'>
          {authorLine(book)}
        </Text>
      )}
      {started && secondsLeft !== undefined && (
        <View className='flex-row items-center mt-0.5'>
          <Ionicons name='time-outline' size={11} color='#a78bfa' />
          <Text numberOfLines={1} className='text-purple-300 text-xs ml-1'>
            {formatTimeLeft(secondsLeft, t)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
