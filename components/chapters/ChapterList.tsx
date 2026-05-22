/**
 * A modal listing an item's chapters. Each row shows the chapter name and its
 * timestamp; the current chapter is highlighted. Tapping a row seeks to that
 * chapter and closes the modal. Player-agnostic — the seek is injected.
 */

import { Ionicons } from "@expo/vector-icons";
import type { ChapterInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { FlatList, Modal, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import {
  chapterStartsMs,
  currentChapterIndex,
  formatChapterTime,
} from "@/utils/chapters";

interface ChapterListProps {
  visible: boolean;
  chapters: ChapterInfo[] | null | undefined;
  /** Current playback position in milliseconds (to highlight the row). */
  currentPositionMs: number;
  /** Seek the player to this millisecond position. */
  onSeek: (positionMs: number) => void;
  onClose: () => void;
}

export function ChapterList({
  visible,
  chapters,
  currentPositionMs,
  onSeek,
  onClose,
}: ChapterListProps) {
  const starts = chapterStartsMs(chapters);
  const activeIndex = currentChapterIndex(currentPositionMs, chapters);
  const list = chapters ?? [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType='slide'
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "#0009",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "#1a1a1a",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "70%",
            paddingBottom: 24,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>
              Chapters
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name='close' size={24} color='#fff' />
            </Pressable>
          </View>
          <FlatList
            data={list}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item, index }) => {
              const positionMs = starts[index] ?? 0;
              const isActive = index === activeIndex;
              return (
                <Pressable
                  onPress={() => {
                    onSeek(positionMs);
                    onClose();
                  }}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    backgroundColor: isActive ? "#a855f733" : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? "#a855f7" : "#fff",
                      fontSize: 15,
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {item.Name || `Chapter ${index + 1}`}
                  </Text>
                  <Text style={{ color: "#999", fontSize: 13, marginLeft: 12 }}>
                    {formatChapterTime(positionMs)}
                  </Text>
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
