import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { View, type ViewProps } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import {
  GlassCardRowView,
  isGlassCardRowAvailable,
} from "@/modules/glass-card-row";
import {
  CARD_LAYOUTS,
  type CardData,
  type CardKind,
  cardRowHeight,
} from "./CardData";
import { CardRowSkeleton } from "./CardRowSkeleton";
import { JsCardRow } from "./JsCardRow";
import { useItemCardBehavior } from "./useItemCardBehavior";
import { useNativeMediaCards } from "./useNativeMediaCards";

interface Props extends ViewProps {
  /** Section heading. Omit for a bare row. */
  title?: string | null;
  /** Renders a "See all" action next to the title. */
  onPressSeeAll?: () => void;
  seeAllLabel?: string;
  kind?: CardKind;

  /** Media items — cards, navigation and the action sheet are handled here. */
  items?: BaseItemDto[];
  /** Prebuilt cards, for anything that isn't a `BaseItemDto` (cast members). */
  cards?: CardData[];

  /** Prefer the episode's own still over the series thumbnail. */
  useEpisodePoster?: boolean;
  /** Item to keep at full opacity; every other card is faded back. */
  selectedId?: string | null;
  /** Card to scroll into view when this value changes. */
  scrollToId?: string | null;

  loading?: boolean;
  /** Spinner after the last card while the next page loads. */
  loadingMore?: boolean;
  onEndReached?: () => void;
  /** Shown in place of the row when there is nothing to draw. */
  emptyText?: string;
  /** Renders nothing at all when the row is empty. */
  hideIfEmpty?: boolean;

  /** Replaces the default navigation (items mode). */
  onPressItem?: (item: BaseItemDto) => void;
  /** Press handler for `cards` mode. */
  onPressId?: (id: string) => void;
  /** Long press opens the played/favorite sheet (items mode). Default: true. */
  enableActionSheet?: boolean;
}

/**
 * A horizontal row of media cards — the one component every section uses.
 *
 * It draws the heading, the loading skeleton and the empty state, then renders
 * the row natively when a native implementation exists and falls back to the
 * JS cards when it doesn't. Call sites never branch on platform: adding a
 * native view for another platform (see docs/native-card-row.md) switches all
 * of them at once.
 */
export const CardRow: React.FC<Props> = ({
  title,
  onPressSeeAll,
  seeAllLabel,
  kind = "wide",
  items,
  cards: providedCards,
  useEpisodePoster = false,
  selectedId,
  scrollToId,
  loading = false,
  loadingMore = false,
  onEndReached,
  emptyText,
  hideIfEmpty = false,
  onPressItem,
  onPressId,
  enableActionSheet = true,
  ...props
}) => {
  const nativeCards = useNativeMediaCards();
  const { cards, imageHeaders, handlePress, handleLongPress, actionSheet } =
    useItemCardBehavior({
      items,
      cards: providedCards,
      kind,
      useEpisodePoster,
      selectedId,
      onPressItem,
      onPressId,
      enableActionSheet,
    });

  // The setting only chooses between two renderers of the same cards; it can't
  // conjure a native view where none exists.
  const drawNatively = nativeCards && isGlassCardRowAvailable();

  const isEmpty = cards.length === 0;
  if (hideIfEmpty && isEmpty && !loading) return null;

  return (
    <View {...props}>
      {Boolean(title) && (
        <SectionHeader
          title={title as string}
          actionLabel={seeAllLabel}
          actionDisabled={loading}
          onPressAction={onPressSeeAll}
        />
      )}

      {loading ? (
        <CardRowSkeleton kind={kind} />
      ) : isEmpty ? (
        emptyText ? (
          <View className='px-4'>
            <Text className='text-neutral-500'>{emptyText}</Text>
          </View>
        ) : null
      ) : drawNatively ? (
        <GlassCardRowView
          items={cards}
          imageHeaders={imageHeaders}
          layout={CARD_LAYOUTS[kind]}
          loadingMore={loadingMore}
          scrollToId={scrollToId}
          onItemPress={({ nativeEvent }) => handlePress(nativeEvent.id)}
          onItemLongPress={
            handleLongPress
              ? ({ nativeEvent }) => handleLongPress(nativeEvent.id)
              : undefined
          }
          onEndReached={onEndReached}
          style={{ height: cardRowHeight(kind) }}
        />
      ) : (
        <JsCardRow
          cards={cards}
          kind={kind}
          onPressId={handlePress}
          onEndReached={onEndReached}
        />
      )}

      {actionSheet}
    </View>
  );
};
