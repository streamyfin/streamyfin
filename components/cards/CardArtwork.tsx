import { View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import type { CardData } from "./CardData";

type Props = {
  card: CardData;
  width: number;
  height: number;
  cornerRadius: number;
  /**
   * Draws the progress bar along the artwork's bottom edge. A poster card
   * draws its own under the title instead, inside the frosted band.
   */
  edgeProgress?: boolean;
  /** Full-bleed layer over the artwork — a play glyph, a status icon. */
  overlay?: React.ReactNode;
};

/**
 * The artwork rectangle every card is built on: the image, the placeholder
 * when there is none, the corner badge, and whatever the screen layers on top.
 *
 * `imageUrl` may be a server URL or a `data:` URI — ServerImage resolves auth
 * headers by host, so a hostless source passes straight through.
 */
export const CardArtwork: React.FC<Props> = ({
  card,
  width,
  height,
  cornerRadius,
  edgeProgress = false,
  overlay,
}) => {
  const progress = Math.min(Math.max(card.progress ?? 0, 0), 1);
  const unplayed = card.unplayedCount ?? 0;

  return (
    <View
      style={{
        width,
        height,
        borderRadius: cornerRadius,
        overflow: "hidden",
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

      {overlay}

      {edgeProgress && progress > 0 && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 3,
            backgroundColor: "rgba(255,255,255,0.25)",
          }}
        >
          <View
            style={{
              height: 3,
              width: `${progress * 100}%`,
              backgroundColor: Colors.primary,
            }}
          />
        </View>
      )}

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
              width: 13,
              height: 13,
              borderRadius: 6.5,
              backgroundColor: Colors.primary,
            }}
          />
        )
      )}
    </View>
  );
};
