/**
 * Casting Player Poster
 * Poster image with empty-state fallback, skip intro/credits bar, and buffering overlay.
 */

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { TFunction } from "i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import {
  MediaPlayerState,
  type MediaStatus,
  type RemoteMediaClient,
} from "react-native-google-cast";
import type { useChromecastSegments } from "@/components/chromecast/hooks/useChromecastSegments";
import { Text } from "@/components/common/Text";

type ChromecastSegments = ReturnType<typeof useChromecastSegments>;

interface CastPlayerPosterProps {
  /** Poster image URL, or null when unavailable. */
  posterUrl: string | null;
  /** Whether the cast media is currently buffering. */
  isBuffering: boolean;
  /** The current playback segment (intro/credits/etc.), or null. */
  currentSegment: ChromecastSegments["currentSegment"];
  /** Skip the intro segment. */
  skipIntro: ChromecastSegments["skipIntro"];
  /** Skip the credits segment. */
  skipCredits: ChromecastSegments["skipCredits"];
  /** Skip the current generic segment. */
  skipSegment: ChromecastSegments["skipSegment"];
  /** The remote media client, or null when no session. */
  remoteMediaClient: RemoteMediaClient | null;
  /** Raw Chromecast media status. */
  mediaStatus: MediaStatus | null;
  /** Theme accent color. */
  protocolColor: string;
  /** Translation function. */
  t: TFunction;
}

export function CastPlayerPoster({
  posterUrl,
  isBuffering,
  currentSegment,
  skipIntro,
  skipCredits,
  skipSegment,
  remoteMediaClient,
  mediaStatus,
  protocolColor,
  t,
}: CastPlayerPosterProps) {
  return (
    <View
      style={{
        alignItems: "center",
        marginBottom: 40,
      }}
    >
      <View
        style={{
          width: 280,
          height: 420,
          borderRadius: 12,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit='cover'
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#1a1a1a",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name='film-outline' size={64} color='#333' />
          </View>
        )}

        {/* Skip intro/credits bar at bottom of poster */}
        {currentSegment && (
          <Pressable
            onPress={async () => {
              if (!remoteMediaClient) return;
              try {
                const seekFn = async (positionMs: number) => {
                  if (
                    mediaStatus?.playerState === MediaPlayerState.PLAYING ||
                    mediaStatus?.playerState === MediaPlayerState.PAUSED
                  ) {
                    await remoteMediaClient.seek({
                      position: positionMs / 1000,
                    });
                  }
                };
                if (currentSegment.type === "intro") {
                  await skipIntro(seekFn);
                } else if (currentSegment.type === "credits") {
                  await skipCredits(seekFn);
                } else {
                  await skipSegment(seekFn);
                }
              } catch (error) {
                console.error("[Casting Player] Skip error:", error);
              }
            }}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: protocolColor,
              paddingVertical: 12,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons name='play-skip-forward' size={18} color='white' />
            <Text
              style={{
                color: "white",
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {t(
                `player.skip_${currentSegment.type === "credits" ? "outro" : currentSegment.type}`,
              )}
            </Text>
          </Pressable>
        )}

        {/* Buffering overlay */}
        {isBuffering && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.7)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ActivityIndicator size='large' color={protocolColor} />
            <Text
              style={{
                color: "white",
                fontSize: 16,
                marginTop: 16,
              }}
            >
              {t("casting_player.buffering")}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
