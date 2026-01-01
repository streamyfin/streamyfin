import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { Dimensions, StyleSheet, TouchableOpacity, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudioCastButton } from "@/components/audio-player/AudioCastButton";
import { Text } from "@/components/common/Text";
import { DownloadButton } from "@/components/music/DownloadButton";
import { useFavorite } from "@/hooks/useFavorite";
import { useAudioPlayer } from "@/providers/AudioPlayerProvider";

const emptyItem: BaseItemDto = {};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ARTWORK_SIZE = SCREEN_WIDTH - 64;

function formatTime(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function AudioPlayerScreen() {
  const insets = useSafeAreaInsets();
  const {
    state,
    togglePlayPause,
    skipToNext,
    skipToPrevious,
    skipForward,
    skipBackward,
    seekTo,
    setRepeatMode,
    toggleShuffle,
    castToSession,
    castToChromecast,
    disconnectFromRemote,
  } = useAudioPlayer();

  const {
    currentTrack,
    isPlaying,
    isBuffering,
    position,
    duration,
    repeatMode,
    shuffleEnabled,
    queue,
    queueIndex,
  } = state;

  // For the favorite button
  const { isFavorite, toggleFavorite } = useFavorite(
    currentTrack?.jellyfinItem || emptyItem,
  );

  // Slider values
  const progress = useSharedValue(0);
  const min = useSharedValue(0);
  const max = useSharedValue(100);
  const isSeeking = useSharedValue(false);

  // Update progress when not seeking
  useMemo(() => {
    if (!isSeeking.value && duration > 0) {
      progress.value = (position / duration) * 100;
    }
  }, [position, duration, isSeeking.value]);

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleArtistPress = useCallback(() => {
    const artistId = currentTrack?.jellyfinItem?.ArtistItems?.[0]?.Id;
    if (artistId) {
      router.push(`/(auth)/music/artist/${artistId}`);
    }
  }, [currentTrack]);

  const handleAlbumPress = useCallback(() => {
    const albumId = currentTrack?.jellyfinItem?.AlbumId;
    if (albumId) {
      router.push(`/albums/${albumId}`);
    }
  }, [currentTrack]);

  const handleGenrePress = useCallback((genre: string) => {
    router.push(
      `/(auth)/(tabs)/(home)/music/genre/${encodeURIComponent(genre)}`,
    );
  }, []);

  const handleSeek = useCallback(
    async (value: number) => {
      const newPosition = (value / 100) * duration;
      await seekTo(newPosition);
    },
    [duration, seekTo],
  );

  const cycleRepeatMode = useCallback(() => {
    const modes: Array<"off" | "one" | "all" | "album"> = [
      "off",
      "all",
      "album",
      "one",
    ];
    const currentIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setRepeatMode(nextMode);
  }, [repeatMode, setRepeatMode]);

  const repeatIcon = "repeat" as const;

  const repeatColor = repeatMode === "off" ? "#6b7280" : "#9333ea";

  // Animation for play button
  const playButtonScale = useSharedValue(1);
  const playButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }],
  }));

  const handlePlayPause = useCallback(() => {
    playButtonScale.value = withSpring(0.9, { damping: 10 }, () => {
      playButtonScale.value = withSpring(1);
    });
    togglePlayPause();
  }, [togglePlayPause, playButtonScale]);

  // Swipe gesture for next/previous track
  const artworkTranslateX = useSharedValue(0);
  const artworkOpacity = useSharedValue(1);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      artworkTranslateX.value = event.translationX;
      // Fade out artwork slightly as user swipes
      artworkOpacity.value = 1 - Math.abs(event.translationX) / SCREEN_WIDTH;
    })
    .onEnd((event) => {
      const SWIPE_THRESHOLD = 100;

      if (event.translationX > SWIPE_THRESHOLD) {
        // Swipe right - previous track
        runOnJS(skipToPrevious)();
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        // Swipe left - next track
        runOnJS(skipToNext)();
      }

      // Reset artwork position
      artworkTranslateX.value = withSpring(0);
      artworkOpacity.value = withSpring(1);
    });

  const artworkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: artworkTranslateX.value }],
    opacity: artworkOpacity.value,
  }));

  if (!currentTrack) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.emptyState}>
          <Ionicons name='musical-notes' size={64} color='#6b7280' />
          <Text style={styles.emptyText}>No track playing</Text>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.emptyCloseButton}
          >
            <Text style={styles.emptyCloseButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Background with blur */}
      {currentTrack.artwork && (
        <Image
          source={{ uri: currentTrack.artwork }}
          style={StyleSheet.absoluteFill}
          contentFit='cover'
          blurRadius={50}
        />
      )}
      <LinearGradient
        colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.9)"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
          <Ionicons name='chevron-down' size={28} color='white' />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={handleAlbumPress}
          disabled={!currentTrack.jellyfinItem?.AlbumId}
        >
          <Text style={styles.headerSubtitle}>PLAYING FROM</Text>
          <Text
            style={[
              styles.headerTitle,
              currentTrack.jellyfinItem?.AlbumId && styles.linkText,
            ]}
            numberOfLines={1}
          >
            {currentTrack.album || "Unknown Album"}
          </Text>
        </TouchableOpacity>
        <AudioCastButton
          size='large'
          onCastToSession={castToSession}
          onCastToChromecast={castToChromecast}
          onDisconnect={disconnectFromRemote}
          style={styles.headerButton}
        />
      </View>

      {/* Artwork */}
      <View style={styles.artworkContainer}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.artworkWrapper, artworkAnimatedStyle]}>
            {currentTrack.artwork ? (
              <Image
                source={{ uri: currentTrack.artwork }}
                style={styles.artwork}
                contentFit='cover'
                transition={300}
              />
            ) : (
              <View style={styles.artworkPlaceholder}>
                <Ionicons name='musical-note' size={80} color='#6b7280' />
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Track info */}
      <View style={styles.trackInfo}>
        <View style={styles.trackInfoText}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <TouchableOpacity
            onPress={handleArtistPress}
            disabled={!currentTrack.jellyfinItem?.ArtistItems?.[0]?.Id}
          >
            <Text
              style={[
                styles.trackArtist,
                currentTrack.jellyfinItem?.ArtistItems?.[0]?.Id &&
                  styles.linkText,
              ]}
              numberOfLines={1}
            >
              {currentTrack.artist || "Unknown Artist"}
            </Text>
          </TouchableOpacity>
          {/* Genre labels */}
          {currentTrack.jellyfinItem?.Genres &&
            currentTrack.jellyfinItem.Genres.length > 0 && (
              <View style={styles.genreContainer}>
                {currentTrack.jellyfinItem.Genres.slice(0, 3).map((genre) => (
                  <TouchableOpacity
                    key={genre}
                    style={styles.genreChip}
                    onPress={() => handleGenrePress(genre)}
                  >
                    <Text style={styles.genreText}>{genre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
        </View>
        <View style={styles.actionButtons}>
          {currentTrack?.jellyfinItem && (
            <>
              <DownloadButton
                item={currentTrack.jellyfinItem}
                type='track'
                size={28}
                color='white'
                showProgress={false}
                showBadge={true}
              />
              {currentTrack.jellyfinItem.AlbumId && (
                <DownloadButton
                  item={{
                    ...currentTrack.jellyfinItem,
                    Id: currentTrack.jellyfinItem.AlbumId,
                    Name: currentTrack.album,
                  }}
                  type='album'
                  size={28}
                  color='white'
                  showProgress={false}
                  showBadge={true}
                />
              )}
            </>
          )}
          <TouchableOpacity
            onPress={toggleFavorite}
            style={styles.favoriteButton}
          >
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={28}
              color={isFavorite ? "#9333ea" : "white"}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress slider */}
      <View style={styles.progressContainer}>
        <Slider
          style={styles.slider}
          progress={progress}
          minimumValue={min}
          maximumValue={max}
          onSlidingStart={() => {
            isSeeking.value = true;
          }}
          onSlidingComplete={async (value) => {
            isSeeking.value = false;
            await handleSeek(value);
          }}
          theme={{
            minimumTrackTintColor: "#9333ea",
            maximumTrackTintColor: "rgba(255,255,255,0.3)",
            bubbleBackgroundColor: "#9333ea",
          }}
          thumbWidth={12}
          containerStyle={styles.sliderContainer}
          renderBubble={() => null}
        />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>
            {formatTime(position)} / {formatTime(duration)}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        {/* Shuffle */}
        <TouchableOpacity
          onPress={toggleShuffle}
          style={styles.secondaryControl}
        >
          <Ionicons
            name='shuffle'
            size={24}
            color={shuffleEnabled ? "#9333ea" : "#6b7280"}
          />
        </TouchableOpacity>

        {/* Skip back */}
        <TouchableOpacity onPress={skipToPrevious} style={styles.skipControl}>
          <Ionicons name='play-skip-back' size={32} color='white' />
        </TouchableOpacity>

        {/* Play/Pause */}
        <Animated.View style={playButtonAnimatedStyle}>
          <TouchableOpacity onPress={handlePlayPause} style={styles.playButton}>
            {isBuffering ? (
              <Ionicons name='hourglass' size={40} color='black' />
            ) : isPlaying ? (
              <Ionicons name='pause' size={40} color='black' />
            ) : (
              <Ionicons name='play' size={40} color='black' />
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Skip forward */}
        <TouchableOpacity onPress={skipToNext} style={styles.skipControl}>
          <Ionicons name='play-skip-forward' size={32} color='white' />
        </TouchableOpacity>

        {/* Repeat */}
        <TouchableOpacity
          onPress={cycleRepeatMode}
          style={styles.secondaryControl}
        >
          <Ionicons name={repeatIcon} size={24} color={repeatColor} />
          {repeatMode === "one" && (
            <View style={styles.repeatOneBadge}>
              <Text style={styles.repeatOneText}>1</Text>
            </View>
          )}
          {repeatMode === "album" && (
            <View style={styles.repeatOneBadge}>
              <Text style={styles.repeatOneText}>A</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Skip controls */}
      <View style={styles.skipTimeControls}>
        <TouchableOpacity onPress={skipBackward} style={styles.skipTimeButton}>
          <Ionicons name='play-back' size={20} color='#9ca3af' />
          <Text style={styles.skipTimeText}>15</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={skipForward} style={styles.skipTimeButton}>
          <Text style={styles.skipTimeText}>15</Text>
          <Ionicons name='play-forward' size={20} color='#9ca3af' />
        </TouchableOpacity>
      </View>

      {/* Queue indicator */}
      <View
        style={[styles.queueIndicator, { paddingBottom: insets.bottom + 16 }]}
      >
        <Text style={styles.queueText}>
          {queueIndex + 1} of {queue.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  emptyText: {
    fontSize: 18,
    color: "#6b7280",
  },
  emptyCloseButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#1c1c1e",
    borderRadius: 8,
  },
  emptyCloseButtonText: {
    color: "white",
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerSubtitle: {
    fontSize: 10,
    color: "#9ca3af",
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 14,
    color: "white",
    fontWeight: "600",
    marginTop: 2,
  },
  artworkContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  artworkWrapper: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1c1c1e",
    justifyContent: "center",
    alignItems: "center",
  },
  trackInfo: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 32,
    marginTop: 32,
    marginBottom: 16,
  },
  trackInfoText: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "white",
  },
  trackArtist: {
    fontSize: 18,
    color: "#9ca3af",
    marginTop: 4,
  },
  linkText: {
    textDecorationLine: "underline",
  },
  genreContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  genreChip: {
    backgroundColor: "rgba(147, 51, 234, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(147, 51, 234, 0.4)",
  },
  genreText: {
    fontSize: 12,
    color: "#a855f7",
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  favoriteButton: {
    padding: 8,
  },
  progressContainer: {
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  sliderContainer: {
    borderRadius: 4,
  },
  timeContainer: {
    alignItems: "center",
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  controlsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  secondaryControl: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  skipControl: {
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  repeatOneBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#9333ea",
    justifyContent: "center",
    alignItems: "center",
  },
  repeatOneText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "white",
  },
  skipTimeControls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 64,
    marginBottom: 24,
  },
  skipTimeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  skipTimeText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  volumeContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 12,
    marginBottom: 24,
  },
  volumeSlider: {
    flex: 1,
    height: 40,
  },
  queueIndicator: {
    alignItems: "center",
  },
  queueText: {
    fontSize: 12,
    color: "#6b7280",
  },
});
