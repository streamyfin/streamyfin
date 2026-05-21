/**
 * Casting Player Episode Controls
 * Fixed 4-button control row for episodes: episode list, previous, next, stop.
 */

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { Router } from "expo-router";
import { Pressable, View } from "react-native";
import type { RemoteMediaClient } from "react-native-google-cast";

interface CastPlayerEpisodeControlsProps {
  /** Bottom safe-area inset, used to offset the fixed control row. */
  insetBottom: number;
  /** Id of the currently playing episode. */
  currentItemId: BaseItemDto["Id"];
  /** Full episode list for the series. */
  episodes: BaseItemDto[];
  /** Next episode in the list, or null if none. */
  nextEpisode: BaseItemDto | null;
  /** Remote media client, or null when no session. */
  remoteMediaClient: RemoteMediaClient | null;
  /** Open the episode list modal. */
  onPressEpisodes: () => void;
  /** Load a different episode on the Chromecast. */
  loadEpisode: (episode: BaseItemDto) => Promise<void>;
  /** Expo Router instance for navigation on stop. */
  router: Router;
}

export function CastPlayerEpisodeControls({
  insetBottom,
  currentItemId,
  episodes,
  nextEpisode,
  remoteMediaClient,
  onPressEpisodes,
  loadEpisode,
  router,
}: CastPlayerEpisodeControlsProps) {
  return (
    <View
      style={{
        position: "absolute",
        bottom: insetBottom + 200,
        left: 0,
        right: 0,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        paddingHorizontal: 20,
      }}
    >
      {/* Episodes button */}
      <Pressable
        onPress={onPressEpisodes}
        style={{
          flex: 1,
          backgroundColor: "#1a1a1a",
          padding: 12,
          borderRadius: 12,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name='list' size={22} color='white' />
      </Pressable>

      {/* Previous episode button */}
      <Pressable
        onPress={async () => {
          const currentIndex = episodes.findIndex(
            (ep) => ep.Id === currentItemId,
          );
          if (currentIndex > 0) {
            await loadEpisode(episodes[currentIndex - 1]);
          }
        }}
        disabled={episodes.findIndex((ep) => ep.Id === currentItemId) <= 0}
        style={{
          flex: 1,
          backgroundColor: "#1a1a1a",
          padding: 12,
          borderRadius: 12,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          opacity:
            episodes.findIndex((ep) => ep.Id === currentItemId) <= 0 ? 0.4 : 1,
        }}
      >
        <Ionicons name='play-skip-back' size={22} color='white' />
      </Pressable>

      {/* Next episode button */}
      <Pressable
        onPress={async () => {
          if (nextEpisode) {
            await loadEpisode(nextEpisode);
          }
        }}
        disabled={!nextEpisode}
        style={{
          flex: 1,
          backgroundColor: "#1a1a1a",
          padding: 12,
          borderRadius: 12,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          opacity: nextEpisode ? 1 : 0.4,
        }}
      >
        <Ionicons name='play-skip-forward' size={22} color='white' />
      </Pressable>

      {/* Stop playback button - stops media but stays connected to Chromecast */}
      <Pressable
        onPress={async () => {
          try {
            // Stop the current media playback (don't disconnect from Chromecast)
            if (remoteMediaClient) {
              await remoteMediaClient.stop();
            }

            // Navigate back/close the player (mini player will disappear since no media is playing)
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(auth)/(tabs)/(home)/");
            }
          } catch (error) {
            console.error("[Casting Player] Error stopping playback:", error);
            // Navigate anyway
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(auth)/(tabs)/(home)/");
            }
          }
        }}
        style={{
          flex: 1,
          backgroundColor: "#1a1a1a",
          padding: 12,
          borderRadius: 12,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name='stop-circle' size={22} color='white' />
      </Pressable>
    </View>
  );
}
