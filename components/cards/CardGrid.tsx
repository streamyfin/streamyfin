import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { GlassCardGridView } from "@/modules/glass-card-row";
import { CARD_LAYOUTS, type CardKind } from "./CardData";
import { useItemCardBehavior } from "./useItemCardBehavior";

type Props = {
  items: BaseItemDto[];
  kind?: CardKind;
  columns: number;
  loadingMore?: boolean;
  onEndReached?: () => void;
  /** Room for anything pinned above the grid, plus the bottom safe area. */
  contentInsetTop?: number;
  contentInsetBottom?: number;
  /** Changing this scrolls back to the top — the filters changed underneath. */
  scrollToTopToken?: string | null;
  onPressItem?: (item: BaseItemDto) => void;
  enableActionSheet?: boolean;
};

/**
 * A scrolling grid of media cards, rendered as a single native view.
 *
 * The same cards and the same behaviour as `CardRow` — both take them from
 * `useItemCardBehavior` — arranged in columns instead of a row. The one
 * difference that matters: card width is derived from the column count, since
 * a grid has to fill the screen where a row's width is fixed.
 *
 * Callers must check `isGlassCardGridAvailable()` and keep their JS list for
 * platforms without a native implementation.
 */
export const CardGrid: React.FC<Props> = ({
  items,
  kind = "portrait",
  columns,
  loadingMore = false,
  onEndReached,
  contentInsetTop = 0,
  contentInsetBottom = 0,
  scrollToTopToken,
  onPressItem,
  enableActionSheet = true,
}) => {
  const { width } = useWindowDimensions();
  const { cards, imageHeaders, handlePress, handleLongPress, actionSheet } =
    useItemCardBehavior({
      items,
      kind,
      onPressItem,
      enableActionSheet,
    });

  const base = CARD_LAYOUTS[kind];
  const layout = useMemo(() => {
    const safeColumns = Math.max(columns, 1);
    const available =
      width - base.contentInset * 2 - base.spacing * (safeColumns - 1);
    return { ...base, cardWidth: Math.floor(available / safeColumns) };
  }, [base, columns, width]);

  return (
    <>
      <GlassCardGridView
        items={cards}
        imageHeaders={imageHeaders}
        layout={layout}
        columns={columns}
        loadingMore={loadingMore}
        contentInsetTop={contentInsetTop}
        contentInsetBottom={contentInsetBottom}
        scrollToTopToken={scrollToTopToken}
        onItemPress={({ nativeEvent }) => handlePress(nativeEvent.id)}
        onItemLongPress={
          handleLongPress
            ? ({ nativeEvent }) => handleLongPress(nativeEvent.id)
            : undefined
        }
        onEndReached={onEndReached}
        style={{ flex: 1 }}
      />
      {actionSheet}
    </>
  );
};
