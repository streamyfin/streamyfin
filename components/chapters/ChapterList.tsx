/**
 * A modal listing an item's chapters. Each row shows the chapter name and its
 * timestamp; the current chapter is highlighted. Tapping a row seeks to that
 * chapter and closes the modal. Player-agnostic — the seek is injected.
 */

import { Ionicons } from "@expo/vector-icons";
import type { ChapterInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { memo, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { useSettings } from "@/utils/atoms/settings";
import {
  type ChapterEntry,
  chapterStartsMs,
  formatChapterTime,
  sortedChapters,
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

const ROW_HEIGHT = 48;
const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

function ChapterListComponent({
  visible,
  chapters,
  currentPositionMs,
  onSeek,
  onClose,
}: ChapterListProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const safeArea =
    (settings?.safeAreaInControlsEnabled ?? true) ? insets : ZERO_INSETS;
  const listRef = useRef<FlatList<ChapterEntry>>(null);

  const entries = useMemo(() => sortedChapters(chapters), [chapters]);
  // Memoize starts so currentChapterIndex computation doesn't re-sort/filter
  // every tick — chapters is the only input that drives the underlying array.
  const starts = useMemo(() => chapterStartsMs(chapters), [chapters]);
  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < starts.length; i++) {
      if (currentPositionMs >= starts[i]) idx = i;
      else break;
    }
    return idx;
  }, [currentPositionMs, starts]);

  // FlatList.initialScrollIndex only fires at first mount; <Modal> keeps its
  // children mounted across visible toggles, so subsequent opens never scroll.
  // Trigger an imperative scroll each time the sheet becomes visible.
  useEffect(() => {
    if (!visible || activeIndex < 0 || entries.length === 0) return;
    const raf = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: activeIndex,
        animated: false,
        viewPosition: 0.5,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, activeIndex, entries.length]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType='slide'
      onRequestClose={onClose}
      // iOS defaults <Modal> to portrait-only; without this it rotates the app
      // back to portrait when opened from the landscape player. Android ignores it.
      supportedOrientations={["portrait", "landscape"]}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              marginLeft: safeArea.left,
              marginRight: safeArea.right,
              paddingBottom: safeArea.bottom,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t("chapters.title")}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole='button'
              accessibilityLabel={t("chapters.close")}
            >
              <Ionicons name='close' size={24} color={Colors.text} />
            </Pressable>
          </View>
          <FlatList
            ref={listRef}
            data={entries}
            keyExtractor={(item, index) => `${item.positionMs}-${index}`}
            getItemLayout={(_, index) => ({
              length: ROW_HEIGHT,
              offset: ROW_HEIGHT * index,
              index,
            })}
            onScrollToIndexFailed={(info) => {
              // Required when getItemLayout is provided and the target index
              // is outside the currently rendered window. Fallback to an
              // offset-based scroll, then retry the precise scroll once a
              // frame has elapsed.
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
              });
              setTimeout(() => {
                listRef.current?.scrollToIndex({
                  index: info.index,
                  animated: false,
                  viewPosition: 0.5,
                });
              }, 50);
            }}
            renderItem={({ item, index }) => {
              const positionMs = item.positionMs;
              const isActive = index === activeIndex;
              return (
                <Pressable
                  onPress={() => {
                    onSeek(positionMs);
                    onClose();
                  }}
                  style={[
                    styles.row,
                    isActive && { backgroundColor: `${Colors.primary}33` },
                  ]}
                >
                  <Text
                    style={[
                      styles.rowText,
                      { color: isActive ? Colors.primary : Colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {item.chapter.Name ||
                      t("chapters.chapter_number", { number: index + 1 })}
                  </Text>
                  <Text style={styles.rowTime}>
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

export const ChapterList = memo(ChapterListComponent);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  title: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    height: ROW_HEIGHT,
  },
  rowText: {
    fontSize: 15,
    flex: 1,
  },
  rowTime: {
    color: Colors.icon,
    fontSize: 13,
    marginLeft: 12,
  },
});
