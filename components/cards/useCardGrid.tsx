import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback, useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "./Card";
import { CARD_LAYOUTS, type CardData, type CardKind } from "./CardData";
import { useItemCardBehavior } from "./useItemCardBehavior";

type Options = {
  items: BaseItemDto[];
  /** Cards per row, as the screen's own breakpoints decide. */
  columns: number;
  kind?: CardKind;
  /** Replaces the default navigation. */
  onPressItem?: (item: BaseItemDto) => void;
  /** Replaces the long-press action sheet. */
  onLongPressItem?: (item: BaseItemDto) => void;
  enableActionSheet?: boolean;
};

/**
 * The grid counterpart to `CardRow` — the same cards, laid out in columns.
 *
 * It hands back the pieces a list needs rather than a list of its own, so a
 * screen keeps its header, filters, paging and empty state and only borrows
 * the cells. Card width comes from the column count, since a grid fills the
 * screen where a row's cards are a fixed size.
 */
export function useCardGrid({
  items,
  columns,
  kind = "portrait",
  onPressItem,
  onLongPressItem,
  enableActionSheet,
}: Options) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { cards, handlePress, handleLongPress, actionSheet } =
    useItemCardBehavior({
      items,
      kind,
      onPressItem,
      onLongPressItem,
      enableActionSheet,
    });

  const layout = CARD_LAYOUTS[kind];
  const cardWidth = useMemo(() => {
    const safeColumns = Math.max(columns, 1);
    const available =
      width -
      insets.left -
      insets.right -
      layout.contentInset * 2 -
      layout.spacing * (safeColumns - 1);
    return Math.floor(available / safeColumns);
  }, [width, insets.left, insets.right, columns, layout]);

  // A library can mix poster art with square album art, and a grid row is as
  // tall as its tallest cell — so without a common height the short cards
  // leave ragged gaps. Reserve the tallest card's height for every cell and
  // let the shorter ones sit at the top of it. A grid of one shape (the usual
  // case) reserves exactly that shape and wastes nothing.
  const cellHeight = useMemo(() => {
    if (cards.length === 0) return cardWidth / layout.aspectRatio;
    // A smaller ratio is a taller card.
    const tallest = cards.reduce(
      (min, card) => Math.min(min, card.aspectRatio ?? layout.aspectRatio),
      Number.POSITIVE_INFINITY,
    );
    return cardWidth / tallest;
  }, [cards, cardWidth, layout.aspectRatio]);

  // A column is wider than the card it holds, so each card is nudged within
  // its column to land on the row inset and keep even gutters. Doing it here
  // rather than padding the list keeps a header spanning the full width.
  const columnOffset = useCallback(
    (index: number) => {
      const safeColumns = Math.max(columns, 1);
      const column = index % safeColumns;
      return (
        layout.contentInset +
        (column * (layout.spacing - layout.contentInset * 2)) / safeColumns
      );
    },
    [columns, layout],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CardData; index: number }) => (
      <View
        style={{
          width: "100%",
          height: cellHeight,
          paddingLeft: columnOffset(index),
        }}
      >
        <Card
          card={item}
          kind={kind}
          width={cardWidth}
          onPress={() => handlePress(item.id)}
          onLongPress={
            handleLongPress ? () => handleLongPress(item.id) : undefined
          }
        />
      </View>
    ),
    [cardWidth, cellHeight, columnOffset, kind, handlePress, handleLongPress],
  );

  const keyExtractor = useCallback((card: CardData) => card.id, []);

  return {
    /** Feed the list these instead of the raw items. */
    data: cards,
    renderItem,
    keyExtractor,
    /** Vertical gap between rows. */
    rowGap: layout.spacing,
    /** Mount alongside the list; renders nothing until a long press. */
    actionSheet,
  };
}
