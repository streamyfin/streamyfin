import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, View, type ViewProps } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { Card } from "./Card";
import {
  CARD_LAYOUTS,
  type CardData,
  type CardKind,
  cardRowHeight,
} from "./CardData";
import { CardRowSkeleton } from "./CardRowSkeleton";
import { useItemCardBehavior } from "./useItemCardBehavior";

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
 * It draws the heading, the loading skeleton, the empty state and the cards
 * themselves, so a section only has to say which items it wants shown.
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
  const { cards, handlePress, handleLongPress, actionSheet } =
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

  const layout = CARD_LAYOUTS[kind];
  const listRef = useRef<FlashListRef<CardData>>(null);
  // Every card is the same width, so a card always sits at a multiple of this
  // — both for snapping and for bringing one into view.
  const stride = layout.cardWidth + layout.spacing;

  // Only act on a *change* of scrollToId, so bringing a card into view never
  // fights the user's own scrolling on an unrelated re-render.
  const scrolledToId = useRef<string | null>(null);
  useEffect(() => {
    if (!scrollToId || scrollToId === scrolledToId.current) return;
    const index = cards.findIndex((card) => card.id === scrollToId);
    // The cards may not have arrived yet; this runs again when they do.
    if (index < 0) return;
    scrolledToId.current = scrollToId;
    listRef.current?.scrollToOffset({ offset: index * stride, animated: true });
  }, [scrollToId, cards, stride]);

  const renderCard = useCallback(
    ({ item }: { item: CardData }) => (
      <Card
        card={item}
        kind={kind}
        onPress={() => handlePress(item.id)}
        onLongPress={
          handleLongPress ? () => handleLongPress(item.id) : undefined
        }
      />
    ),
    [kind, handlePress, handleLongPress],
  );

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
      ) : (
        <View style={{ height: cardRowHeight(kind) }}>
          <FlashList
            ref={listRef}
            data={cards}
            renderItem={renderCard}
            keyExtractor={(card) => card.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            // Settle on a card rather than drifting to an arbitrary offset.
            snapToInterval={stride}
            snapToAlignment='start'
            decelerationRate='fast'
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            ItemSeparatorComponent={() => (
              <View style={{ width: layout.spacing }} />
            )}
            ListFooterComponent={
              loadingMore ? (
                <View
                  style={{
                    width: 48,
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ActivityIndicator size='small' color={Colors.primary} />
                </View>
              ) : null
            }
            contentContainerStyle={{
              paddingHorizontal: layout.contentInset,
              paddingVertical: layout.verticalPadding,
            }}
          />
        </View>
      )}

      {actionSheet}
    </View>
  );
};
