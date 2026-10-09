import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useCallback } from "react";
import { TouchableOpacity, View } from "react-native";
import DraggableFlatList, {
  type RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
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
 * The strip a row's drag handle sits in, from the row's leading edge: its
 * padding, the handle and the handle's own hit slop.
 */
const DRAG_HANDLE_STRIP = { left: 0, width: 52 };

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
  const row = useCallback(
    (item: QueueRow, index: number, isActive: boolean, drag: () => void) => {
      const isCurrent = index === currentIndex;
      const isPast = index < currentIndex;

      return (
        <TouchableOpacity
          key={item.key}
          testID={testID ? `${testID}-row-${item.key}` : undefined}
          onPress={() => onPressRow(index)}
          // Only where the list scrolls itself: see dragHitSlop below.
          onLongPress={scrollable ? drag : undefined}
          disabled={isActive || disabled}
          className='flex-row items-center px-4 py-3'
          style={{
            opacity: isPast && !isActive ? 0.5 : 1,
            backgroundColor: isActive
              ? "#2a2a2a"
              : isCurrent
                ? "rgba(147, 52, 233, 0.3)"
                : "#121212",
          }}
        >
          <TouchableOpacity
            onPressIn={drag}
            disabled={isActive || disabled}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className='pr-2'
          >
            <Ionicons
              name='reorder-three'
              size={20}
              color={isActive ? ACCENT : "#666"}
            />
          </TouchableOpacity>

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
              onPress={() => onRemoveRow(index)}
              disabled={disabled}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className='p-2'
            >
              <Ionicons name='close' size={20} color='#666' />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      );
    },
    [
      currentIndex,
      disabled,
      canRemoveCurrent,
      icon,
      artwork,
      testID,
      scrollable,
      onPressRow,
      onRemoveRow,
    ],
  );

  const renderRow = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<QueueRow>) => (
      <ScaleDecorator>
        {row(item, getIndex() ?? 0, isActive, drag)}
      </ScaleDecorator>
    ),
    [row],
  );

  const handleDragEnd = useCallback(
    ({ from, to }: { from: number; to: number }) => {
      onDragActiveChange?.(false);
      if (from !== to) onMoveRow(from, to);
    },
    [onMoveRow, onDragActiveChange],
  );

  const headerView = header ? (
    <View className='px-4 py-2'>
      <Text className='text-neutral-400 text-xs uppercase tracking-wider'>
        {header}
      </Text>
    </View>
  ) : null;
  const emptyView = (
    <View
      className={`items-center justify-center ${scrollable ? "flex-1 py-20" : "py-8"}`}
    >
      <Text className='text-neutral-500'>{emptyText}</Text>
    </View>
  );

  return (
    <DraggableFlatList
      testID={testID}
      data={rows}
      keyExtractor={(item) => item.key}
      renderItem={renderRow}
      onDragBegin={() => onDragActiveChange?.(true)}
      // A press on the handle that never moves ends here, not in onDragEnd.
      onRelease={() => onDragActiveChange?.(false)}
      onDragEnd={handleDragEnd}
      scrollEnabled={scrollable}
      // Inside something else that scrolls, the list's pan would claim every
      // vertical swipe that starts on a row, and on Android the parent then
      // never scrolls: a long queue hid whatever came after it. Limited to
      // the handles, a swipe anywhere else on a row belongs to the parent.
      dragHitSlop={scrollable ? undefined : DRAG_HANDLE_STRIP}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={headerView}
      ListEmptyComponent={emptyView}
    />
  );
};
