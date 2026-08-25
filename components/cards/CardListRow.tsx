import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { CardArtwork } from "./CardArtwork";
import {
  CARD_LAYOUTS,
  type CardData,
  type CardKind,
  type CardSlots,
} from "./CardData";

type Props = {
  card: CardData;
  kind?: CardKind;
  slots?: CardSlots;
  onPress: () => void;
  onLongPress?: () => void;
};

/**
 * A media item as a list row: artwork on the left, its lines beside it, and
 * room for whatever the screen hangs off the end.
 *
 * The same `CardData` as `Card` — the two differ only in arrangement, so an
 * item says the same thing whichever shape a screen chooses.
 */
export const CardListRow: React.FC<Props> = ({
  card,
  kind = "rowWide",
  slots,
  onPress,
  onLongPress,
}) => {
  const layout = CARD_LAYOUTS[kind];
  const width = layout.cardWidth;
  const height = width / (card.aspectRatio ?? layout.aspectRatio);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ opacity: card.dimmed ? 0.5 : 1 }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <CardArtwork
          card={card}
          width={width}
          height={height}
          cornerRadius={layout.cornerRadius}
          edgeProgress
          overlay={slots?.overlay?.(card)}
        />

        <View style={{ flex: 1, marginLeft: layout.spacing }}>
          <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: "600" }}>
            {card.title}
          </Text>
          {Boolean(card.subtitle) && (
            <Text
              numberOfLines={1}
              style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}
            >
              {card.subtitle}
            </Text>
          )}
          {Boolean(card.detail) && (
            <Text
              numberOfLines={1}
              style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}
            >
              {card.detail}
            </Text>
          )}
        </View>

        {slots?.trailing && (
          <View style={{ marginLeft: 8 }}>{slots.trailing(card)}</View>
        )}
      </View>

      {slots?.footer?.(card)}
    </TouchableOpacity>
  );
};
