import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAtomValue } from "jotai";
import type React from "react";
import { useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/utils/atoms/api";
import type { Audiobook } from "@/utils/audiobooks/books";
import { audiobookCoverUrl } from "@/utils/audiobooks/images";

interface Props {
  book: Pick<Audiobook, "imageItemId" | "title">;
  size: number;
  /** Fraction listened, drawn as a bar along the bottom. */
  progress?: number;
  finished?: boolean;
  style?: ViewStyle;
}

// The pixel size asked of the server: the drawn size at a 3x screen, in steps
// so the cache keeps one image per book.
const requestSize = (size: number) =>
  size <= 80 ? 240 : size <= 200 ? 600 : 900;

/**
 * A book's cover, drawn like a book: a darker spine down the left edge and
 * square corners there, rounder on the open side. A book without a cover gets
 * its title on a plain board instead.
 */
export const AudiobookCover: React.FC<Props> = ({
  book,
  size,
  progress,
  finished,
  style,
}) => {
  const api = useAtomValue(apiAtom);
  const uri = useMemo(
    () => audiobookCoverUrl(api, book, requestSize(size)),
    [api, book, size],
  );
  const radius = Math.max(3, Math.round(size * 0.03));
  const spineWidth = Math.max(3, Math.round(size * 0.05));

  return (
    <View
      style={[
        styles.cover,
        {
          width: size,
          height: size,
          borderTopLeftRadius: radius / 2,
          borderBottomLeftRadius: radius / 2,
          borderTopRightRadius: radius,
          borderBottomRightRadius: radius,
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit='cover'
          cachePolicy='memory-disk'
          recyclingKey={book.imageItemId ?? undefined}
        />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons
            name='book'
            size={Math.max(16, size * 0.22)}
            color='#a78bfa'
          />
          {size >= 90 && (
            <Text
              numberOfLines={3}
              style={[
                styles.placeholderTitle,
                { fontSize: Math.max(11, size * 0.09) },
              ]}
            >
              {book.title}
            </Text>
          )}
        </View>
      )}
      <LinearGradient
        pointerEvents='none'
        colors={["rgba(0,0,0,0.45)", "rgba(255,255,255,0.08)", "rgba(0,0,0,0)"]}
        locations={[0, 0.6, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.spine, { width: spineWidth * 2 }]}
      />
      {finished ? (
        <View style={styles.finishedBadge}>
          <Ionicons name='checkmark' size={12} color='white' />
        </View>
      ) : progress !== undefined && progress > 0 ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(progress, 1) * 100}%` },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  cover: {
    overflow: "hidden",
    backgroundColor: "#1f1b2e",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    gap: 6,
    backgroundColor: "#1f1b2e",
  },
  placeholderTitle: {
    color: "#e5e5e5",
    textAlign: "center",
    fontWeight: "600",
  },
  spine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#9334E9",
  },
  finishedBadge: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#9334E9",
  },
});
