import { Ionicons } from "@expo/vector-icons";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type React from "react";
import { useCallback, useMemo, useRef } from "react";
import { TouchableOpacity, View, type ViewInstance } from "react-native";
import {
  DraxHandle,
  DraxProvider,
  SortableContainer,
  SortableItem,
  type SortableReorderEvent,
  useDraxContext,
  useSortableList,
} from "react-native-drax";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";

export interface QueueRow {
  /** Unique within the list, and stable while the row moves. */
  key: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
}

interface Props {
  rows: QueueRow[];
  currentIndex: number;
  /** Square album art, or a 2:3 poster. */
  artwork?: "square" | "poster";
  /** Shown where a row has no image, and on the row that is playing. */
  icon: keyof typeof Ionicons.glyphMap;
  header?: string;
  emptyText: string;
  /**
   * Off when something around the list already scrolls (a sheet, a screen).
   * The list then lays out every row and leaves the scrolling to its parent,
   * which is the one nesting React Native accepts for a virtualized list.
   */
  scrollable?: boolean;
  /** Rows show but ignore presses: a request is pending or the list is stale. */
  disabled?: boolean;
  /** Whether the playing row can be removed. Music cannot drop its own track. */
  canRemoveCurrent?: boolean;
  testID?: string;
  onPressRow: (index: number) => void;
  onRemoveRow: (index: number) => void;
  onMoveRow: (from: number, to: number) => void;
  /**
   * Whether a row is being dragged. For a parent that scrolls: it has to
   * stand still meanwhile, or on iOS its own pan takes the drag.
   */
  onDragActiveChange?: (active: boolean) => void;
}

const ACCENT = "#9334E9";
/**
 * A drag starts on the handle at once: the rest of a row stays free to
 * scroll and to be pressed, in a list that scrolls itself as in a sheet.
 */
const HANDLE_DRAG_DELAY_MS = 0;

// Module level: drax resets the rows whenever this changes, which during a
// drag throws back the rows it has moved.
const rowKey = (row: QueueRow) => row.key;

/**
 * drax maps the finger with the provider's screen position, measured when
 * the provider lays out only. In a sheet that scrolls, the provider moves
 * without a layout and a drag lands off by the distance scrolled, so a touch
 * on the handle measures it again, before the pan activates.
 *
 * The handle sits beside the row's touchable, not in it: the pan does not
 * take a tap, which would otherwise press the row.
 */
const QueueHandle: React.FC = () => {
  const { rootViewRef, rootOffsetSV } = useDraxContext();
  const measureRoot = useCallback(() => {
    rootViewRef.current?.measure((_x, _y, _width, _height, pageX, pageY) => {
      rootOffsetSV.value = { x: pageX, y: pageY };
    });
  }, [rootViewRef, rootOffsetSV]);

  return (
    <DraxHandle style={{ alignSelf: "stretch" }}>
      <View
        onTouchStart={measureRoot}
        className='flex-1 justify-center pl-4 pr-2'
      >
        <Ionicons name='reorder-three' size={20} color='#666' />
      </View>
    </DraxHandle>
  );
};

/**
 * A queue as the music player shows it: artwork, title and subtitle, a drag
 * handle to reorder and a button to remove. Shared with the SyncPlay queue.
 */
export const DraggableQueueList: React.FC<Props> = ({
  rows,
  currentIndex,
  artwork = "square",
  icon,
  header,
  emptyText,
  scrollable = true,
  disabled = false,
  canRemoveCurrent = false,
  testID,
  onPressRow,
  onRemoveRow,
  onMoveRow,
  onDragActiveChange,
}) => {
  const listRef = useRef<FlashListRef<QueueRow>>(null);
  const columnRef = useRef<ViewInstance>(null);
  const draggingRef = useRef(false);

  // Reported once per drag, from whichever end drax calls first.
  const setDragging = useCallback(
    (active: boolean) => {
      if (draggingRef.current === active) return;
      draggingRef.current = active;
      onDragActiveChange?.(active);
    },
    [onDragActiveChange],
  );
  const endDrag = useCallback(() => setDragging(false), [setDragging]);

  const sortable = useSortableList({
    data: rows,
    keyExtractor: rowKey,
    longPressDelay: HANDLE_DRAG_DELAY_MS,
    lockToMainAxis: true,
    onReorder: ({ fromIndex, toIndex }: SortableReorderEvent<QueueRow>) => {
      if (fromIndex !== toIndex) onMoveRow(fromIndex, toIndex);
    },
    onDragStart: () => setDragging(true),
    // The list hears only of a drop inside it; the dragged row's own end,
    // below, covers one outside.
    onDragEnd: endDrag,
  });

  // drax renders its own copy of the rows, which a drop the parent accepts
  // leaves in the old order (it moves them with transforms): a rendered row
  // finds its place in the queue by key, not by where drax renders it.
  const indexByKey = useMemo(
    () => new Map(rows.map((item, index) => [item.key, index])),
    [rows],
  );
  const currentKey = rows[currentIndex]?.key;

  const row = useCallback(
    (item: QueueRow, slot: number) => {
      const index = indexByKey.get(item.key) ?? -1;
      const isCurrent = item.key === currentKey;
      const isPast = index < currentIndex;

      return (
        <SortableItem
          sortable={sortable}
          index={slot}
          dragHandle
          draggable={!disabled}
          hoverDraggingStyle={{ backgroundColor: "#2a2a2a" }}
          onDragEnd={endDrag}
          onDragDrop={endDrag}
        >
          <View
            className='flex-row items-center'
            style={{
              opacity: isPast ? 0.5 : 1,
              backgroundColor: isCurrent
                ? "rgba(147, 52, 233, 0.3)"
                : "#121212",
            }}
          >
            <QueueHandle />

            <TouchableOpacity
              testID={testID ? `${testID}-row-${item.key}` : undefined}
              onPress={() => index >= 0 && onPressRow(index)}
              disabled={disabled}
              className='flex-1 flex-row items-center py-3 pr-4'
            >
              <View
                className={`rounded overflow-hidden bg-neutral-800 mr-3 ${
                  artwork === "poster" ? "w-10 h-[60px]" : "w-12 h-12"
                }`}
              >
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit='cover'
                    cachePolicy='memory-disk'
                  />
                ) : (
                  <View className='flex-1 items-center justify-center'>
                    <Ionicons name={icon} size={16} color='#666' />
                  </View>
                )}
              </View>

              <View className='flex-1 mr-2'>
                <Text
                  numberOfLines={1}
                  className={`text-base ${isCurrent ? "text-purple-400 font-semibold" : "text-white"}`}
                >
                  {item.title}
                </Text>
                {!!item.subtitle && (
                  <Text numberOfLines={1} className='text-neutral-500 text-sm'>
                    {item.subtitle}
                  </Text>
                )}
              </View>

              {isCurrent && <Ionicons name={icon} size={16} color={ACCENT} />}

              {(!isCurrent || canRemoveCurrent) && (
                <TouchableOpacity
                  testID={testID ? `${testID}-remove-${item.key}` : undefined}
                  onPress={() => index >= 0 && onRemoveRow(index)}
                  disabled={disabled}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className='p-2'
                >
                  <Ionicons name='close' size={20} color='#666' />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        </SortableItem>
      );
    },
    [
      sortable,
      indexByKey,
      currentKey,
      currentIndex,
      disabled,
      canRemoveCurrent,
      icon,
      artwork,
      testID,
      onPressRow,
      onRemoveRow,
      endDrag,
    ],
  );

  const headerView = header ? (
    <View className='px-4 py-2'>
      <Text className='text-neutral-400 text-xs uppercase tracking-wider'>
        {header}
      </Text>
    </View>
  ) : undefined;
  const emptyView = (
    <View
      className={`items-center justify-center ${scrollable ? "flex-1 py-20" : "py-8"}`}
    >
      <Text className='text-neutral-500'>{emptyText}</Text>
    </View>
  );

  if (!scrollable) {
    // Inside something else that scrolls: every row is laid out here and
    // the parent scrolls, so a swipe on a row (off its handle) moves the
    // parent, and the queue never hides what comes after it.
    return (
      <DraxProvider>
        <SortableContainer sortable={sortable} scrollRef={columnRef}>
          <View ref={columnRef} testID={testID}>
            {headerView}
            {rows.length === 0
              ? emptyView
              : sortable.data.map((item, index) => (
                  <View key={sortable.stableKeyExtractor(item, index)}>
                    {row(item, index)}
                  </View>
                ))}
          </View>
        </SortableContainer>
      </DraxProvider>
    );
  }

  return (
    <DraxProvider style={{ flex: 1 }}>
      <SortableContainer
        sortable={sortable}
        scrollRef={listRef}
        style={{ flex: 1 }}
      >
        <FlashList
          ref={listRef}
          testID={testID}
          data={sortable.data}
          keyExtractor={sortable.stableKeyExtractor}
          onScroll={sortable.onScroll}
          onContentSizeChange={sortable.onContentSizeChange}
          renderItem={({ item, index }) => row(item, index)}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={headerView}
          ListEmptyComponent={emptyView}
        />
      </SortableContainer>
    </DraxProvider>
  );
};
