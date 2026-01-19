import type { MediaStream } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVTypography } from "@/constants/TVTypography";

export interface TVTechnicalDetailsProps {
  mediaStreams: MediaStream[];
}

export const TVTechnicalDetails: React.FC<TVTechnicalDetailsProps> = React.memo(
  ({ mediaStreams }) => {
    const { t } = useTranslation();

    const videoStream = mediaStreams.find((s) => s.Type === "Video");
    const audioStream = mediaStreams.find((s) => s.Type === "Audio");

    if (!videoStream && !audioStream) {
      return null;
    }

    return (
      <View style={{ marginBottom: 32 }}>
        <Text
          style={{
            fontSize: TVTypography.heading,
            fontWeight: "600",
            color: "#FFFFFF",
            marginBottom: 20,
          }}
        >
          {t("item_card.technical_details")}
        </Text>
        <View style={{ flexDirection: "row", gap: 40 }}>
          {videoStream && (
            <View>
              <Text
                style={{
                  fontSize: TVTypography.callout,
                  color: "#6B7280",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                Video
              </Text>
              <Text style={{ fontSize: TVTypography.body, color: "#FFFFFF" }}>
                {videoStream.DisplayTitle ||
                  `${videoStream.Codec?.toUpperCase()} ${videoStream.Width}x${videoStream.Height}`}
              </Text>
            </View>
          )}
          {audioStream && (
            <View>
              <Text
                style={{
                  fontSize: TVTypography.callout,
                  color: "#6B7280",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                Audio
              </Text>
              <Text style={{ fontSize: TVTypography.body, color: "#FFFFFF" }}>
                {audioStream.DisplayTitle ||
                  `${audioStream.Codec?.toUpperCase()} ${audioStream.Channels}ch`}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  },
);
