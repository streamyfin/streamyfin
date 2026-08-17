import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { CARD_LAYOUTS, type CardData, type CardKind } from "./CardData";

type CardProps = {
  card: CardData;
  kind: CardKind;
  onPress: () => void;
};

/**
 * The JS drawing of a card — same data as the native view, same layout rules.
 * Used wherever no native implementation exists (Android today, or a build
 * without the module), so a platform never has to look different by accident.
 */
export const JsCard: React.FC<CardProps> = ({ card, kind, onPress }) => {
  const layout = CARD_LAYOUTS[kind];
  const height = layout.cardWidth / layout.aspectRatio;
  const progress = Math.min(Math.max(card.progress ?? 0, 0), 1);
  const unplayed = card.unplayedCount ?? 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: layout.cardWidth,
        height,
        borderRadius: layout.cornerRadius,
        overflow: "hidden",
        opacity: card.dimmed ? 0.5 : 1,
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.12)",
      }}
    >
      {card.imageUrl ? (
        <Image
          id={card.id}
          source={{ uri: card.imageUrl }}
          cachePolicy='memory-disk'
          contentFit='cover'
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: "#1a1a1a" }} />
      )}

      {/* Frosted band, faded in from nothing so the text stays readable. */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: height * layout.frostFraction,
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
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600" }}>
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
        {progress > 0 && (
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
        )}
      </View>

      {unplayed > 0 ? (
        <View
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            minWidth: 20,
            height: 20,
            paddingHorizontal: 5,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: Colors.primary,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700" }}>
            {unplayed >= 1000 ? "1k+" : unplayed}
          </Text>
        </View>
      ) : (
        card.unwatched && (
          <View
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: Colors.primary,
            }}
          />
        )
      )}
    </TouchableOpacity>
  );
};

type RowProps = {
  cards: CardData[];
  kind: CardKind;
  onPressId: (id: string) => void;
  onEndReached?: () => void;
};

/** Horizontal row of `JsCard`s — the fallback for `CardRow`. */
export const JsCardRow: React.FC<RowProps> = ({
  cards,
  kind,
  onPressId,
  onEndReached,
}) => {
  const layout = CARD_LAYOUTS[kind];

  const handleScroll = (event: any) => {
    if (!onEndReached) return;
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    if (layoutMeasurement.width + contentOffset.x >= contentSize.width - 20) {
      onEndReached();
    }
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{
        paddingHorizontal: layout.contentInset,
        paddingVertical: layout.verticalPadding,
        gap: layout.spacing,
      }}
    >
      {cards.map((card) => (
        <JsCard
          key={card.id}
          card={card}
          kind={kind}
          onPress={() => onPressId(card.id)}
        />
      ))}
    </ScrollView>
  );
};
