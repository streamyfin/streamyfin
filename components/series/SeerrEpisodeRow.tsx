import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useState } from "react";
import { View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { SheetColors } from "@/constants/Colors";
import type { SeasonWithEpisodes } from "@/utils/seerr/types";

type Episode = NonNullable<SeasonWithEpisodes["episodes"]>[number];

/** One episode of a Seerr season: its still, number and name, air date and overview. */
export const SeerrEpisodeRow: React.FC<{
  episode: Episode;
  still?: string;
  airDate?: string;
}> = ({ episode, still, airDate }) => {
  // The URL that failed rather than a flag: the still moves to Seerr's image cache once the
  // server's public settings are in, and the new URL deserves a try of its own.
  const [failedStill, setFailedStill] = useState<string>();

  return (
    <View style={{ paddingVertical: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View
          style={{
            width: 128,
            aspectRatio: 16 / 9,
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: SheetColors.group,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {still && still !== failedStill ? (
            <Image
              source={{ uri: still }}
              cachePolicy='memory-disk'
              contentFit='cover'
              style={{ width: "100%", height: "100%" }}
              onError={() => setFailedStill(still)}
            />
          ) : (
            <Ionicons
              name='image-outline'
              size={22}
              color='white'
              style={{ opacity: 0.4 }}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600" }} numberOfLines={2}>
            {`${episode.episodeNumber}. ${episode.name}`}
          </Text>
          {airDate && (
            <Text
              style={{
                fontSize: 13,
                marginTop: 2,
                color: SheetColors.secondaryText,
              }}
            >
              {airDate}
            </Text>
          )}
        </View>
      </View>
      {!!episode.overview && (
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: SheetColors.secondaryText,
          }}
        >
          {episode.overview}
        </Text>
      )}
    </View>
  );
};
