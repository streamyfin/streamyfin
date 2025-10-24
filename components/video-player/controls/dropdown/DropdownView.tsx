import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, TouchableOpacity } from "react-native";

const _DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;

import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { Settings, useSettings } from "@/utils/atoms/settings";
import { useControlContext } from "../contexts/ControlContext";
import { useVideoContext } from "../contexts/VideoContext";

export const PLAYBACK_SPEEDS = [
  { label: "0.25x", value: 0.25 },
  { label: "0.5x", value: 0.5 },
  { label: "0.75x", value: 0.75 },
  { label: "1x", value: 1.0 },
  { label: "1.25x", value: 1.25 },
  { label: "1.5x", value: 1.5 },
  { label: "1.75x", value: 1.75 },
  { label: "2x", value: 2.0 },
  { label: "2.25x", value: 2.25 },
  { label: "2.5x", value: 2.5 },
  { label: "2.75x", value: 2.75 },
  { label: "3x", value: 3.0 },
];
export enum PlaybackSpeedScope {
  Media = "media",
  Show = "show",
  All = "all",
}

const DropdownView = () => {
  const videoContext = useVideoContext();
  const { subtitleTracks, audioTracks } = videoContext;
  const ControlContext = useControlContext();
  const [item, mediaSource] = [
    ControlContext?.item,
    ControlContext?.mediaSource,
  ];
  const router = useRouter();
  const [_currentSpeed, setCurrentSpeed] = useState(1.0);
  const [_playbackSpeedScope, setPlaybackSpeedScope] = useState(
    PlaybackSpeedScope.All,
  );

  const _PLAYBACK_SPEED_SCOPE_LABELS = useMemo(() => {
    const labels: Record<string, string> = {
      [PlaybackSpeedScope.Media]: "Custom for this media",
    };

    if (item?.SeriesId) {
      labels[PlaybackSpeedScope.Show] = "Custom for this show";
    }

    labels[PlaybackSpeedScope.All] = "Default for all media";

    return labels;
  }, [item?.SeriesId]);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["75%"], []);

  const { subtitleIndex, audioIndex, bitrateValue, playbackPosition, offline } =
    useLocalSearchParams<{
      itemId: string;
      audioIndex: string;
      subtitleIndex: string;
      mediaSourceId: string;
      bitrateValue: string;
      playbackPosition: string;
      offline: string;
    }>();

  const isOffline = offline === "true";

  const changeBitrate = useCallback(
    (bitrate: string) => {
      const queryParams = new URLSearchParams({
        itemId: item.Id ?? "",
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex.toString() ?? "",
        mediaSourceId: mediaSource?.Id ?? "",
        bitrateValue: bitrate.toString(),
        playbackPosition: playbackPosition,
      }).toString();
      router.replace(`player/direct-player?${queryParams}` as any);
    },
    [item, mediaSource, subtitleIndex, audioIndex, playbackPosition],
  );

  const [settings, updateSettings] = useSettings();

  // Helper function to clear conflicting playback speed settings
  const clearConflictingSettings = useCallback(
    (
      scope: PlaybackSpeedScope,
      item: BaseItemDto | undefined,
      perMedia: Settings["playbackSpeedPerMedia"],
      perShow: Settings["playbackSpeedPerShow"],
    ) => {
      const updatedPerMedia = { ...perMedia };
      const updatedPerShow = { ...perShow };

      if (scope === "all") {
        // Clear both media-specific and show-specific settings
        if (item?.Id && updatedPerMedia[item.Id] !== undefined) {
          delete updatedPerMedia[item.Id];
        }
        if (item?.SeriesId && updatedPerShow[item.SeriesId] !== undefined) {
          delete updatedPerShow[item.SeriesId];
        }
      } else if (scope === "media") {
        // Clear show-specific setting only
        if (item?.SeriesId && updatedPerShow[item.SeriesId] !== undefined) {
          delete updatedPerShow[item.SeriesId];
        }
      } else if (scope === "show") {
        // Clear media-specific setting only
        if (item?.Id && updatedPerMedia[item.Id] !== undefined) {
          delete updatedPerMedia[item.Id];
        }
      }

      return { updatedPerMedia, updatedPerShow };
    },
    [],
  );

  // Helper function to update playback speed settings
  const updatePlaybackSpeedSettings = useCallback(
    (
      speed: number,
      scope: PlaybackSpeedScope,
      item: BaseItemDto | undefined,
    ) => {
      const { updatedPerMedia, updatedPerShow } = clearConflictingSettings(
        scope,
        item,
        settings.playbackSpeedPerMedia,
        settings.playbackSpeedPerShow,
      );

      if (scope === "all") {
        updateSettings({
          defaultPlaybackSpeed: speed,
          playbackSpeedPerMedia: updatedPerMedia,
          playbackSpeedPerShow: updatedPerShow,
        });
      } else if (scope === "media" && item?.Id) {
        updatedPerMedia[item.Id] = speed;
        updateSettings({
          playbackSpeedPerMedia: updatedPerMedia,
          playbackSpeedPerShow: updatedPerShow,
        });
      } else if (scope === "show" && item?.SeriesId) {
        updatedPerShow[item.SeriesId] = speed;
        updateSettings({
          playbackSpeedPerShow: updatedPerShow,
          playbackSpeedPerMedia: updatedPerMedia,
        });
      }
    },
    [settings, updateSettings, clearConflictingSettings],
  );

  const _changePlaybackSpeed = useCallback(
    (speed: number, scope: PlaybackSpeedScope) => {
      setCurrentSpeed(speed);
      setPlaybackSpeedScope(scope);

      // Use the correct VLC player method to change playback speed
      if (videoContext?.videoRef?.current) {
        videoContext.videoRef.current.setRate(speed);
      }

      // Update settings using the helper function
      updatePlaybackSpeedSettings(speed, scope, item);
    },
    [videoContext, item, updatePlaybackSpeedSettings],
  );

  // Initialize playback speed based on stored preferences
  useEffect(() => {
    if (!item?.Id || !settings) return;

    let preferredSpeed = settings.defaultPlaybackSpeed;

    // Check for media-specific speed preference
    if (settings.playbackSpeedPerMedia[item.Id]) {
      // Highest priority
      preferredSpeed = settings.playbackSpeedPerMedia[item.Id];
      setPlaybackSpeedScope(PlaybackSpeedScope.Media);
    }
    // Check for show-specific speed preference (only for episodes)
    else if (item.SeriesId && settings.playbackSpeedPerShow[item.SeriesId]) {
      preferredSpeed = settings.playbackSpeedPerShow[item.SeriesId];
      setPlaybackSpeedScope(PlaybackSpeedScope.Show);
    }

    // Set the speed on the player and update local state
    if (videoContext?.videoRef?.current) {
      videoContext.videoRef.current.setRate(preferredSpeed);
    }
    setCurrentSpeed(preferredSpeed);
  }, [item, settings, videoContext]);

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      setOpen(false);
    }
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  const handleOpen = () => {
    setOpen(true);
    bottomSheetModalRef.current?.present();
  };

  const handleClose = () => {
    setOpen(false);
    bottomSheetModalRef.current?.dismiss();
  };

  useEffect(() => {
    if (open) bottomSheetModalRef.current?.present();
    else bottomSheetModalRef.current?.dismiss();
  }, [open]);

  // Hide on TV platforms
  if (Platform.isTV) return null;

  return (
    <>
      <TouchableOpacity
        className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
        onPress={handleOpen}
      >
        <Ionicons name='ellipsis-horizontal' size={24} color={"white"} />
      </TouchableOpacity>

      <BottomSheetModal
        ref={bottomSheetModalRef}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
      >
        <BottomSheetScrollView
          style={{
            flex: 1,
          }}
        >
          <View
            className='mt-2 mb-8'
            style={{
              paddingLeft: Math.max(16, insets.left),
              paddingRight: Math.max(16, insets.right),
            }}
          >
            <Text className='font-bold text-2xl mb-6'>Playback Options</Text>

            {/* Quality Section */}
            {!isOffline && (
              <View className='mb-6'>
                <Text className='font-semibold text-lg mb-3 text-neutral-300'>
                  Quality
                </Text>
                <View
                  style={{
                    borderRadius: 20,
                    overflow: "hidden",
                  }}
                  className='flex flex-col rounded-xl overflow-hidden'
                >
                  {BITRATES?.map((bitrate, idx: number) => (
                    <View key={`quality-item-${idx}`}>
                      <TouchableOpacity
                        onPress={() => {
                          changeBitrate(bitrate.value?.toString() ?? "");
                          setTimeout(() => handleClose(), 250);
                        }}
                        className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
                      >
                        <Text className='flex shrink'>{bitrate.key}</Text>
                        {bitrateValue === (bitrate.value?.toString() ?? "") ? (
                          <Ionicons
                            name='radio-button-on'
                            size={24}
                            color='white'
                          />
                        ) : (
                          <Ionicons
                            name='radio-button-off'
                            size={24}
                            color='white'
                          />
                        )}
                      </TouchableOpacity>
                      {idx < BITRATES.length - 1 && (
                        <View
                          style={{
                            height: StyleSheet.hairlineWidth,
                          }}
                          className='bg-neutral-700'
                        />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Subtitle Section */}
            <View className='mb-6'>
              <Text className='font-semibold text-lg mb-3 text-neutral-300'>
                Subtitles
              </Text>
              <View
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                }}
                className='flex flex-col rounded-xl overflow-hidden'
              >
                {subtitleTracks?.map((sub, idx: number) => (
                  <View key={`subtitle-item-${idx}`}>
                    <TouchableOpacity
                      onPress={() => {
                        sub.setTrack();
                        setTimeout(() => handleClose(), 250);
                      }}
                      className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
                    >
                      <Text className='flex shrink'>{sub.name}</Text>
                      {subtitleIndex === sub.index.toString() ? (
                        <Ionicons
                          name='radio-button-on'
                          size={24}
                          color='white'
                        />
                      ) : (
                        <Ionicons
                          name='radio-button-off'
                          size={24}
                          color='white'
                        />
                      )}
                    </TouchableOpacity>
                    {idx < (subtitleTracks?.length ?? 0) - 1 && (
                      <View
                        style={{
                          height: StyleSheet.hairlineWidth,
                        }}
                        className='bg-neutral-700'
                      />
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Audio Section */}
            {(audioTracks?.length ?? 0) > 0 && (
              <View className='mb-6'>
                <Text className='font-semibold text-lg mb-3 text-neutral-300'>
                  Audio
                </Text>
                <View
                  style={{
                    borderRadius: 20,
                    overflow: "hidden",
                  }}
                  className='flex flex-col rounded-xl overflow-hidden'
                >
                  {audioTracks?.map((track, idx: number) => (
                    <View key={`audio-item-${idx}`}>
                      <TouchableOpacity
                        onPress={() => {
                          track.setTrack();
                          setTimeout(() => handleClose(), 250);
                        }}
                        className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
                      >
                        <Text className='flex shrink'>{track.name}</Text>
                        {audioIndex === track.index.toString() ? (
                          <Ionicons
                            name='radio-button-on'
                            size={24}
                            color='white'
                          />
                        ) : (
                          <Ionicons
                            name='radio-button-off'
                            size={24}
                            color='white'
                          />
                        )}
                      </TouchableOpacity>
                      {idx < (audioTracks?.length ?? 0) - 1 && (
                        <View
                          style={{
                            height: StyleSheet.hairlineWidth,
                          }}
                          className='bg-neutral-700'
                        />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
};

export default DropdownView;
