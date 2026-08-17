import { View } from "react-native";
import { CARD_LAYOUTS, type CardKind } from "./CardData";

/** Placeholder cards shown while a row loads, sized like the real ones. */
export const CardRowSkeleton: React.FC<{ kind: CardKind; count?: number }> = ({
  kind,
  count = 3,
}) => {
  const layout = CARD_LAYOUTS[kind];

  return (
    <View
      style={{
        flexDirection: "row",
        gap: layout.spacing,
        paddingHorizontal: layout.contentInset,
        paddingVertical: layout.verticalPadding,
      }}
    >
      {Array.from({ length: count }, (_, i) => i).map((i) => (
        <View
          key={i}
          style={{
            width: layout.cardWidth,
            height: layout.cardWidth / layout.aspectRatio,
            borderRadius: layout.cornerRadius,
            backgroundColor: "#171717",
          }}
        />
      ))}
    </View>
  );
};
