import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import DraggableFlatList, {
  type RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { Text } from "@/components/common/Text";
import { CreatePlaylistModal } from "@/components/music/CreatePlaylistModal";
import { PlaylistPickerSheet } from "@/components/music/PlaylistPickerSheet";
import { TrackOptionsSheet } from "@/components/music/TrackOptionsSheet";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  type RepeatMode,
  useMusicPlayer,
} from "@/providers/MusicPlayerProvider";
import { formatBitrate } from "@/utils/bitrate";
import { formatDuration } from "@/utils/time";

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return null;
  const sizes = ["B", "KB", "MB", "GB"];
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
};

const formatSampleRate = (sampleRate?: number | null) => {
  if (!sampleRate) return null;
  return `${(sampleRate / 1000).toFixed(1)} kHz`;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ARTWORK_SIZE = SCREEN_WIDTH - 80;

type ViewMode = "player" | "queue";

export default function NowPlayingScreen() {
  const [api] = useAtom(apiAtom);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>("player");
  const [trackOptionsOpen, setTrackOptionsOpen] = useState(false);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);

  const {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    isLoading,
    progress,
    duration,
    repeatMode,
    shuffleEnabled,
    mediaSource,
    isTranscoding,
    togglePlayPause,
    next,
    previous,
    seek,
    setRepeatMode,
    toggleShuffle,
    jumpToIndex,
    removeFromQueue,
    reorderQueue,
    stop,
  } = useMusicPlayer();

  const sliderProgress = useSharedValue(0);
  const sliderMin = useSharedValue(0);
  const sliderMax = useSharedValue(1);

  useEffect(() => {
    sliderProgress.value = progress;
  }, [progress, sliderProgress]);

  useEffect(() => {
    sliderMax.value = duration > 0 ? duration : 1;
  }, [duration, sliderMax]);

  const imageUrl = useMemo(() => {
    if (!api || !currentTrack) return null;
    const albumId = currentTrack.AlbumId || currentTrack.ParentId;
    if (albumId) {
      return `${api.basePath}/Items/${albumId}/Images/Primary?maxHeight=600&maxWidth=600`;
    }
    return `${api.basePath}/Items/${currentTrack.Id}/Images/Primary?maxHeight=600&maxWidth=600`;
  }, [api, currentTrack]);

  const progressText = useMemo(() => {
    const progressTicks = progress * 10000000;
    return formatDuration(progressTicks);
  }, [progress]);

  const durationText = useMemo(() => {
    const durationTicks = duration * 10000000;
    return formatDuration(durationTicks);
  }, [duration]);

  const handleSliderComplete = useCallback(
    (value: number) => {
      seek(value);
    },
    [seek],
  );

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const _handleStop = useCallback(() => {
    stop();
    router.back();
  }, [stop, router]);

  const cycleRepeatMode = useCallback(() => {
    const modes: RepeatMode[] = ["off", "all", "one"];
    const currentIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setRepeatMode(nextMode);
  }, [repeatMode, setRepeatMode]);

  const handleOptionsPress = useCallback(() => {
    setTrackOptionsOpen(true);
  }, []);

  const handleAddToPlaylist = useCallback(() => {
    setPlaylistPickerOpen(true);
  }, []);

  const handleCreateNewPlaylist = useCallback(() => {
    setCreatePlaylistOpen(true);
  }, []);

  const getRepeatIcon = (): string => {
    switch (repeatMode) {
      case "one":
        return "repeat";
      case "all":
        return "repeat";
      default:
        return "repeat";
    }
  };

  const canGoNext = queueIndex < queue.length - 1 || repeatMode === "all";
  const canGoPrevious = queueIndex > 0 || progress > 3 || repeatMode === "all";

  if (!currentTrack) {
    return (
      <BottomSheetModalProvider>
        <View
          className='flex-1 bg-[#121212] items-center justify-center'
          style={{
            paddingTop: Platform.OS === "android" ? insets.top : 0,
            paddingBottom: Platform.OS === "android" ? insets.bottom : 0,
          }}
        >
          <Text className='text-neutral-500'>No track playing</Text>
        </View>
      </BottomSheetModalProvider>
    );
  }

  return (
    <BottomSheetModalProvider>
      <View
        className='flex-1 bg-[#121212]'
        style={{
          paddingTop: Platform.OS === "android" ? insets.top : 0,
          paddingBottom: Platform.OS === "android" ? insets.bottom : 0,
        }}
      >
        {/* Header */}
        <View className='flex-row items-center justify-between px-4 pt-3 pb-2'>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className='p-2'
          >
            <Ionicons name='chevron-down' size={28} color='white' />
          </TouchableOpacity>

          <View className='flex-row'>
            <TouchableOpacity
              onPress={() => setViewMode("player")}
              className='px-3 py-1'
            >
              <Text
                className={
                  viewMode === "player"
                    ? "text-white font-semibold"
                    : "text-neutral-500"
                }
              >
                Now Playing
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode("queue")}
              className='px-3 py-1'
            >
              <Text
                className={
                  viewMode === "queue"
                    ? "text-white font-semibold"
                    : "text-neutral-500"
                }
              >
                Queue ({queue.length})
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleOptionsPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className='p-2'
          >
            <Ionicons name='ellipsis-horizontal' size={24} color='white' />
          </TouchableOpacity>
        </View>

        {viewMode === "player" ? (
          <PlayerView
            api={api}
            currentTrack={currentTrack}
            imageUrl={imageUrl}
            sliderProgress={sliderProgress}
            sliderMin={sliderMin}
            sliderMax={sliderMax}
            progressText={progressText}
            durationText={durationText}
            isPlaying={isPlaying}
            isLoading={isLoading}
            repeatMode={repeatMode}
            shuffleEnabled={shuffleEnabled}
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
            onSliderComplete={handleSliderComplete}
            onTogglePlayPause={togglePlayPause}
            onNext={next}
            onPrevious={previous}
            onCycleRepeat={cycleRepeatMode}
            onToggleShuffle={toggleShuffle}
            getRepeatIcon={getRepeatIcon}
            queue={queue}
            queueIndex={queueIndex}
            mediaSource={mediaSource}
            isTranscoding={isTranscoding}
          />
        ) : (
          <QueueView
            api={api}
            queue={queue}
            queueIndex={queueIndex}
            onJumpToIndex={jumpToIndex}
            onRemoveFromQueue={removeFromQueue}
            onReorderQueue={reorderQueue}
          />
        )}

        <TrackOptionsSheet
          open={trackOptionsOpen}
          setOpen={setTrackOptionsOpen}
          track={currentTrack}
          onAddToPlaylist={handleAddToPlaylist}
        />
        <PlaylistPickerSheet
          open={playlistPickerOpen}
          setOpen={setPlaylistPickerOpen}
          trackToAdd={currentTrack}
          onCreateNew={handleCreateNewPlaylist}
        />
        <CreatePlaylistModal
          open={createPlaylistOpen}
          setOpen={setCreatePlaylistOpen}
          initialTrackId={currentTrack?.Id}
        />
      </View>
    </BottomSheetModalProvider>
  );
}

interface PlayerViewProps {
  api: any;
  currentTrack: BaseItemDto;
  imageUrl: string | null;
  sliderProgress: any;
  sliderMin: any;
  sliderMax: any;
  progressText: string;
  durationText: string;
  isPlaying: boolean;
  isLoading: boolean;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  canGoNext: boolean;
  canGoPrevious: boolean;
  onSliderComplete: (value: number) => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onCycleRepeat: () => void;
  onToggleShuffle: () => void;
  getRepeatIcon: () => string;
  queue: BaseItemDto[];
  queueIndex: number;
  mediaSource: MediaSourceInfo | null;
  isTranscoding: boolean;
}

const PlayerView: React.FC<PlayerViewProps> = ({
  currentTrack,
  imageUrl,
  sliderProgress,
  sliderMin,
  sliderMax,
  progressText,
  durationText,
  isPlaying,
  isLoading,
  repeatMode,
  shuffleEnabled,
  canGoNext,
  canGoPrevious,
  onSliderComplete,
  onTogglePlayPause,
  onNext,
  onPrevious,
  onCycleRepeat,
  onToggleShuffle,
  getRepeatIcon,
  queue,
  queueIndex,
  mediaSource,
  isTranscoding,
}) => {
  const audioStream = useMemo(() => {
    return mediaSource?.MediaStreams?.find((stream) => stream.Type === "Audio");
  }, [mediaSource]);

  const fileSize = formatFileSize(mediaSource?.Size);
  const codec = audioStream?.Codec?.toUpperCase();
  const bitrate = formatBitrate(audioStream?.BitRate);
  const sampleRate = formatSampleRate(audioStream?.SampleRate);
  const playbackMethod = isTranscoding ? "Transcoding" : "Direct";

  const hasAudioStats =
    mediaSource && (fileSize || codec || bitrate || sampleRate);
  return (
    <ScrollView className='flex-1 px-6' showsVerticalScrollIndicator={false}>
      {/* Album artwork */}
      <View
        className='self-center mb-8 mt-4'
        style={{
          width: ARTWORK_SIZE,
          height: ARTWORK_SIZE,
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 16,
          elevation: 10,
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit='cover'
            cachePolicy='memory-disk'
          />
        ) : (
          <View className='flex-1 items-center justify-center bg-neutral-800'>
            <Ionicons name='musical-note' size={80} color='#666' />
          </View>
        )}
      </View>

      {/* Track info */}
      <View className='mb-6'>
        <Text numberOfLines={1} className='text-white text-2xl font-bold'>
          {currentTrack.Name}
        </Text>
        <Text numberOfLines={1} className='text-purple-400 text-lg mt-1'>
          {currentTrack.Artists?.join(", ") || currentTrack.AlbumArtist}
        </Text>
        {currentTrack.Album && (
          <Text numberOfLines={1} className='text-neutral-500 text-sm mt-1'>
            {currentTrack.Album}
          </Text>
        )}

        {/* Audio Stats */}
        {hasAudioStats && (
          <View className='flex-row flex-wrap gap-1.5 mt-3'>
            {fileSize && <Badge variant='gray' text={fileSize} />}
            {codec && <Badge variant='gray' text={codec} />}
            <Badge
              variant='gray'
              text={playbackMethod}
              iconLeft={
                <Ionicons
                  name={isTranscoding ? "swap-horizontal" : "play"}
                  size={12}
                  color='white'
                />
              }
            />
            {bitrate && bitrate !== "N/A" && (
              <Badge variant='gray' text={bitrate} />
            )}
            {sampleRate && <Badge variant='gray' text={sampleRate} />}
          </View>
        )}
      </View>

      {/* Progress slider */}
      <View className='mb-4'>
        <Slider
          theme={{
            maximumTrackTintColor: "#333",
            minimumTrackTintColor: "#9334E9",
            bubbleBackgroundColor: "#9334E9",
            bubbleTextColor: "#fff",
          }}
          progress={sliderProgress}
          minimumValue={sliderMin}
          maximumValue={sliderMax}
          onSlidingComplete={onSliderComplete}
          thumbWidth={16}
          sliderHeight={6}
          containerStyle={{ borderRadius: 10 }}
          renderBubble={() => null}
        />
        <View className='flex flex-row justify-between px-1 mt-2'>
          <Text className='text-neutral-500 text-xs'>{progressText}</Text>
          <Text className='text-neutral-500 text-xs'>{durationText}</Text>
        </View>
      </View>

      {/* Main Controls */}
      <View className='flex flex-row items-center justify-center mb-2'>
        <TouchableOpacity
          onPress={onPrevious}
          disabled={!canGoPrevious || isLoading}
          className='p-4'
          style={{ opacity: canGoPrevious && !isLoading ? 1 : 0.3 }}
        >
          <Ionicons name='play-skip-back' size={32} color='white' />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onTogglePlayPause}
          disabled={isLoading}
          className='mx-8 bg-white rounded-full p-4'
        >
          {isLoading ? (
            <ActivityIndicator size={36} color='#121212' />
          ) : (
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={36}
              color='#121212'
              style={isPlaying ? {} : { marginLeft: 4 }}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onNext}
          disabled={!canGoNext || isLoading}
          className='p-4'
          style={{ opacity: canGoNext && !isLoading ? 1 : 0.3 }}
        >
          <Ionicons name='play-skip-forward' size={32} color='white' />
        </TouchableOpacity>
      </View>

      {/* Shuffle & Repeat Controls */}
      <View className='flex flex-row items-center justify-center mb-2'>
        <TouchableOpacity onPress={onToggleShuffle} className='p-3 mx-4'>
          <Ionicons
            name='shuffle'
            size={24}
            color={shuffleEnabled ? "#9334E9" : "#666"}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={onCycleRepeat} className='p-3 mx-4 relative'>
          <Ionicons
            name={getRepeatIcon() as any}
            size={24}
            color={repeatMode !== "off" ? "#9334E9" : "#666"}
          />
          {repeatMode === "one" && (
            <View className='absolute right-0 bg-purple-600 rounded-full w-4 h-4 items-center justify-center'>
              <Text className='text-white text-[10px] font-bold'>1</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Queue info */}
      {queue.length > 1 && (
        <View className='items-center mb-4'>
          <Text className='text-neutral-500 text-sm'>
            {queueIndex + 1} of {queue.length}
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

interface QueueViewProps {
  api: any;
  queue: BaseItemDto[];
  queueIndex: number;
  onJumpToIndex: (index: number) => void;
  onRemoveFromQueue: (index: number) => void;
  onReorderQueue: (newQueue: BaseItemDto[]) => void;
}

const QueueView: React.FC<QueueViewProps> = ({
  api,
  queue,
  queueIndex,
  onJumpToIndex,
  onRemoveFromQueue,
  onReorderQueue,
}) => {
  const renderQueueItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<BaseItemDto>) => {
      const index = getIndex() ?? 0;
      const isCurrentTrack = index === queueIndex;
      const isPast = index < queueIndex;

      const albumId = item.AlbumId || item.ParentId;
      const imageUrl = api
        ? albumId
          ? `${api.basePath}/Items/${albumId}/Images/Primary?maxHeight=80&maxWidth=80`
          : `${api.basePath}/Items/${item.Id}/Images/Primary?maxHeight=80&maxWidth=80`
        : null;

      return (
        <ScaleDecorator>
          <TouchableOpacity
            onPress={() => onJumpToIndex(index)}
            onLongPress={drag}
            disabled={isActive}
            className='flex-row items-center px-4 py-3'
            style={{
              opacity: isPast && !isActive ? 0.5 : 1,
              backgroundColor: isActive
                ? "#2a2a2a"
                : isCurrentTrack
                  ? "rgba(147, 52, 233, 0.3)"
                  : "#121212",
            }}
          >
            {/* Drag handle */}
            <TouchableOpacity
              onPressIn={drag}
              disabled={isActive}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className='pr-2'
            >
              <Ionicons
                name='reorder-three'
                size={20}
                color={isActive ? "#9334E9" : "#666"}
              />
            </TouchableOpacity>

            {/* Album art */}
            <View className='w-12 h-12 rounded overflow-hidden bg-neutral-800 mr-3'>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit='cover'
                  cachePolicy='memory-disk'
                />
              ) : (
                <View className='flex-1 items-center justify-center'>
                  <Ionicons name='musical-note' size={16} color='#666' />
                </View>
              )}
            </View>

            {/* Track info */}
            <View className='flex-1 mr-2'>
              <Text
                numberOfLines={1}
                className={`text-base ${isCurrentTrack ? "text-purple-400 font-semibold" : "text-white"}`}
              >
                {item.Name}
              </Text>
              <Text numberOfLines={1} className='text-neutral-500 text-sm'>
                {item.Artists?.join(", ") || item.AlbumArtist}
              </Text>
            </View>

            {/* Now playing indicator */}
            {isCurrentTrack && (
              <Ionicons name='musical-note' size={16} color='#9334E9' />
            )}

            {/* Remove button (not for current track) */}
            {!isCurrentTrack && (
              <TouchableOpacity
                onPress={() => onRemoveFromQueue(index)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className='p-2'
              >
                <Ionicons name='close' size={20} color='#666' />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </ScaleDecorator>
      );
    },
    [api, queueIndex, onJumpToIndex, onRemoveFromQueue],
  );

  const handleDragEnd = useCallback(
    ({ data }: { data: BaseItemDto[] }) => {
      onReorderQueue(data);
    },
    [onReorderQueue],
  );

  const history = queue.slice(0, queueIndex);

  return (
    <DraggableFlatList
      data={queue}
      keyExtractor={(item, index) => `${item.Id}-${index}`}
      renderItem={renderQueueItem}
      onDragEnd={handleDragEnd}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View className='px-4 py-2'>
          <Text className='text-neutral-400 text-xs uppercase tracking-wider'>
            {history.length > 0 ? "Playing from queue" : "Up next"}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View className='flex-1 items-center justify-center py-20'>
          <Text className='text-neutral-500'>Queue is empty</Text>
        </View>
      }
    />
  );
};
