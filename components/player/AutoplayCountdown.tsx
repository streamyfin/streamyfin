/**
 * Player-agnostic "next episode" countdown card. The parent owns the timer and
 * positioning — this component only renders the next episode's poster, title,
 * the remaining seconds, and the Play-now / Cancel actions.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";

interface AutoplayCountdownProps {
  /** The episode that will play next. */
  nextEpisode: BaseItemDto;
  /** Poster image URL for the next episode, or null. */
  posterUrl: string | null;
  /** Seconds left before the next episode plays. */
  secondsRemaining: number;
  /** Play the next episode immediately. */
  onPlayNow: () => void;
  /** Cancel autoplay — the next episode will not play. */
  onCancel: () => void;
}

export function AutoplayCountdown({
  nextEpisode,
  posterUrl,
  secondsRemaining,
  onPlayNow,
  onCancel,
}: AutoplayCountdownProps) {
  const { t } = useTranslation();

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 12,
        width: 320,
        padding: 12,
        borderRadius: 12,
        backgroundColor: "rgba(20, 20, 20, 0.94)",
      }}
    >
      {posterUrl && (
        <Image
          source={{ uri: posterUrl }}
          style={{ width: 62, height: 93, borderRadius: 6 }}
          contentFit='cover'
        />
      )}
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <View style={{ gap: 2 }}>
          <Text style={{ color: "#999", fontSize: 12 }}>
            {t("player.up_next")}
          </Text>
          <Text
            style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}
            numberOfLines={2}
          >
            {nextEpisode.Name}
          </Text>
          <Text style={{ color: "#a855f7", fontSize: 13 }}>
            {t("player.next_episode_in", { seconds: secondsRemaining })}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Pressable
            onPress={onPlayNow}
            accessibilityRole='button'
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: "#a855f7",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>
              {t("player.play_now")}
            </Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            accessibilityRole='button'
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: "#333",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>
              {t("player.cancel")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
