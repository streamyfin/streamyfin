/**
 * Casting Player Episode Controls
 * Fixed control row: episode list, previous, next, stop.
 * Episode-specific buttons (list / previous / next) are conditional;
 * Stop is always rendered so movies still get a Stop button.
 */

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { Router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import type { RemoteMediaClient } from "react-native-google-cast";
import { Text } from "@/components/common/Text";
import { DEBUG_TOUCH_ZONES } from "@/utils/casting/debug";

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
  /** Whether the current item exposes chapter markers. */
  hasChapters: boolean;
  /** Open the chapter list modal. */
  onPressChapters: () => void;
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
  hasChapters,
  onPressChapters,
  loadEpisode,
  router,
}: CastPlayerEpisodeControlsProps) {
  const { t } = useTranslation();

  const hasEpisodeList = episodes.length > 0;
  const hasPrevious = episodes.findIndex((ep) => ep.Id === currentItemId) > 0;
  const hasNext = nextEpisode != null;

  // Count of buttons actually rendered (Stop is always rendered).
  const buttonCount =
    1 +
    (hasEpisodeList ? 1 : 0) +
    (hasChapters ? 1 : 0) +
    (hasPrevious ? 1 : 0) +
    (hasNext ? 1 : 0);

  // When Stop is the only button (movies), render it full-width with a label.
  const isLoneStop = buttonCount === 1;

  // Each button stretches evenly only when the row holds more than one;
  // a lone Stop button keeps its intrinsic size and stays centered.
  const buttonStyle = {
    ...(buttonCount > 1 ? { flex: 1 } : {}),
    backgroundColor: "#1a1a1a",
    padding: 12,
    borderRadius: 12,
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  };

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
      {/* Episodes button - only rendered when an episode list exists (not for movies) */}
      {hasEpisodeList && (
        <Pressable onPress={onPressEpisodes} style={buttonStyle}>
          <Ionicons name='list' size={22} color='white' />
        </Pressable>
      )}

      {/* Chapter list button - rendered for both episodes and movies when chapters exist */}
      {hasChapters && (
        <Pressable onPress={onPressChapters} style={buttonStyle}>
          <Ionicons name='bookmarks' size={22} color='white' />
        </Pressable>
      )}

      {/* Previous episode button - only rendered when a previous episode exists */}
      {hasPrevious && (
        <Pressable
          onPress={async () => {
            const currentIndex = episodes.findIndex(
              (ep) => ep.Id === currentItemId,
            );
            if (currentIndex > 0) {
              await loadEpisode(episodes[currentIndex - 1]);
            }
          }}
          style={buttonStyle}
        >
          <Ionicons name='play-skip-back' size={22} color='white' />
        </Pressable>
      )}

      {/* Next episode button - only rendered when a next episode exists */}
      {hasNext && (
        <Pressable
          onPress={async () => {
            if (nextEpisode) {
              await loadEpisode(nextEpisode);
            }
          }}
          style={buttonStyle}
        >
          <Ionicons name='play-skip-forward' size={22} color='white' />
        </Pressable>
      )}

      {/* Stop playback button - always rendered; stops media but stays connected to Chromecast */}
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
        style={[buttonStyle, isLoneStop && { flex: 1, gap: 8 }]}
      >
        <Ionicons name='stop-circle' size={22} color='white' />
        {isLoneStop && (
          <Text style={{ color: "white", fontSize: 15, fontWeight: "600" }}>
            {t("casting_player.stop")}
          </Text>
        )}
      </Pressable>

      {__DEV__ && DEBUG_TOUCH_ZONES && (
        <View
          pointerEvents='none'
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            borderWidth: 1,
            borderColor: "lime",
          }}
        />
      )}
    </View>
  );
}
