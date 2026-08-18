import { LinearGradient } from "expo-linear-gradient";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { CardArtwork } from "./CardArtwork";
import {
  CARD_LAYOUTS,
  type CardData,
  type CardKind,
  type CardSlots,
} from "./CardData";

type CardProps = {
  card: CardData;
  kind: CardKind;
  /** Overrides the kind's card width — a grid sizes cards by its columns. */
  width?: number;
  /**
   * Where the title goes. "over" is the poster card: text on the artwork
   * behind a frosted band. "below" leaves the artwork clean and stacks the
   * text underneath, for rows that carry more than two lines.
   */
  textPlacement?: "over" | "below";
  slots?: Pick<CardSlots, "overlay" | "footer">;
  onPress: () => void;
  onLongPress?: () => void;
};

/**
 * A media card: artwork edge to edge, the title and subtitle over a frosted
 * band at the bottom, and the progress bar under them but still on the card.
 * Everything it draws comes from `CardData` — see `buildItemCards`.
 */
export const Card: React.FC<CardProps> = ({
  card,
  kind,
  width,
  textPlacement = "over",
  slots,
  onPress,
  onLongPress,
}) => {
  const layout = CARD_LAYOUTS[kind];
  const cardWidth = width ?? layout.cardWidth;
  const height = cardWidth / (card.aspectRatio ?? layout.aspectRatio);
  const progress = Math.min(Math.max(card.progress ?? 0, 0), 1);
  const isOver = textPlacement === "over";

  const progressBar = progress > 0 && (
    <View
      style={{
        height: 3,
        borderRadius: 2,
        marginTop: 5,
        backgroundColor: "rgba(255,255,255,0.25)",
      }}
    >
      <View
        style={{
          height: 3,
          borderRadius: 2,
          width: `${progress * 100}%`,
          backgroundColor: Colors.primary,
        }}
      />
    </View>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ width: cardWidth, opacity: card.dimmed ? 0.5 : 1 }}
    >
      <View>
        <CardArtwork
          card={card}
          width={cardWidth}
          height={height}
          cornerRadius={layout.cornerRadius}
          overlay={slots?.overlay?.(card)}
        />

        {isOver && (
          <>
            {/* Frosted band, faded in from nothing so the text stays readable. */}
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.85)"]}
              pointerEvents='none'
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: height * layout.frostFraction,
                borderBottomLeftRadius: layout.cornerRadius,
                borderBottomRightRadius: layout.cornerRadius,
              }}
            />
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: 10,
                paddingBottom: 9,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ fontSize: 13, fontWeight: "600" }}
              >
                {card.title}
              </Text>
              {Boolean(card.subtitle) && (
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}
                >
                  {card.subtitle}
                </Text>
              )}
              {progressBar}
            </View>
          </>
        )}
      </View>

      {!isOver && (
        <View style={{ paddingTop: 6 }}>
          {progressBar}
          <Text
            numberOfLines={2}
            style={{ fontSize: 13, fontWeight: "600", marginTop: 2 }}
          >
            {card.title}
          </Text>
          {Boolean(card.subtitle) && (
            <Text
              numberOfLines={1}
              style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}
            >
              {card.subtitle}
            </Text>
          )}
          {Boolean(card.detail) && (
            <Text
              numberOfLines={1}
              style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}
            >
              {card.detail}
            </Text>
          )}
        </View>
      )}

      {slots?.footer?.(card)}
    </TouchableOpacity>
  );
};
