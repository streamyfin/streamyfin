import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState, useEffect } from "react";
import { Platform, TouchableOpacity } from "react-native";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { BITRATES } from "@/components/BitrateSelector";
import { Settings, useSettings } from "@/utils/atoms/settings";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  const [currentSpeed, setCurrentSpeed] = useState(1.0);
  const [playbackSpeedScope, setPlaybackSpeedScope] = useState(
    PlaybackSpeedScope.All,
  );

  const PLAYBACK_SPEED_SCOPE_LABELS: Record<string, string> = {
    [PlaybackSpeedScope.Media]: "Custom for this media",
  };
  if (item?.SeriesId) {
    PLAYBACK_SPEED_SCOPE_LABELS[PlaybackSpeedScope.Show] =
      "Custom for this show";
  }
  PLAYBACK_SPEED_SCOPE_LABELS[PlaybackSpeedScope.All] = "Default for all media";

  const { subtitleIndex, audioIndex, bitrateValue } = useLocalSearchParams<{
    itemId: string;
    audioIndex: string;
    subtitleIndex: string;
    mediaSourceId: string;
    bitrateValue: string;
  }>();

  const changeBitrate = useCallback(
    (bitrate: string) => {
      const queryParams = new URLSearchParams({
        itemId: item.Id ?? "",
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex.toString() ?? "",
        mediaSourceId: mediaSource?.Id ?? "",
        bitrateValue: bitrate.toString(),
      }).toString();
      // @ts-expect-error
      router.replace(`player/direct-player?${queryParams}`);
    },
    [item, mediaSource, subtitleIndex, audioIndex],
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

  const changePlaybackSpeed = useCallback(
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

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <TouchableOpacity className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'>
          <Ionicons name='ellipsis-horizontal' size={24} color={"white"} />
        </TouchableOpacity>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        loop={true}
        side='bottom'
        align='start'
        alignOffset={0}
        avoidCollisions={true}
        collisionPadding={8}
        sideOffset={8}
      >
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger key='qualitytrigger'>
            Quality
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent
            alignOffset={-10}
            avoidCollisions={true}
            collisionPadding={0}
            loop={true}
            sideOffset={10}
          >
            {BITRATES?.map((bitrate, idx: number) => (
              <DropdownMenu.CheckboxItem
                key={`quality-item-${idx}`}
                value={bitrateValue === (bitrate.value?.toString() ?? "")}
                onValueChange={() =>
                  changeBitrate(bitrate.value?.toString() ?? "")
                }
              >
                <DropdownMenu.ItemTitle key={`audio-item-title-${idx}`}>
                  {bitrate.key}
                </DropdownMenu.ItemTitle>
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>

        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger key='speed-trigger'>
            Playback Speed
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent
            alignOffset={-10}
            avoidCollisions={true}
            collisionPadding={0}
            loop={true}
            sideOffset={10}
          >
            {PLAYBACK_SPEEDS.map((speed, idx) => (
              <DropdownMenu.Sub key={`speed-${idx}`}>
                <DropdownMenu.SubTrigger
                  key={speed.label}
                  textValue={`${speed.label} ${currentSpeed === speed.value ? "✓" : ""}`}
                >
                  {speed.label} {currentSpeed === speed.value && "✓"}
                </DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent
                  alignOffset={-10}
                  avoidCollisions={true}
                  collisionPadding={0}
                  loop={true}
                  sideOffset={10}
                >
                  {Object.entries(PLAYBACK_SPEED_SCOPE_LABELS).map(
                    ([scope, label]) => {
                      let isSelected = "";
                      if (
                        currentSpeed === speed.value &&
                        playbackSpeedScope === scope
                      ) {
                        isSelected = "✓";
                      }
                      const labelText = `${label} ${isSelected}`;

                      return (
                        <DropdownMenu.Item
                          key={`speed-${scope}-${idx}`}
                          textValue={labelText}
                          onSelect={() =>
                            changePlaybackSpeed(
                              speed.value,
                              scope as PlaybackSpeedScope,
                            )
                          }
                        >
                          <DropdownMenu.ItemTitle>
                            {labelText}
                          </DropdownMenu.ItemTitle>
                        </DropdownMenu.Item>
                      );
                    },
                  )}
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
            ))}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>

        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger key='subtitle-trigger'>
            Subtitle
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent
            alignOffset={-10}
            avoidCollisions={true}
            collisionPadding={0}
            loop={true}
            sideOffset={10}
          >
            {subtitleTracks?.map((sub, idx: number) => (
              <DropdownMenu.CheckboxItem
                key={`subtitle-item-${idx}`}
                value={subtitleIndex === sub.index.toString()}
                onValueChange={() => sub.setTrack()}
              >
                <DropdownMenu.ItemTitle key={`subtitle-item-title-${idx}`}>
                  {sub.name}
                </DropdownMenu.ItemTitle>
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger key='audio-trigger'>
            Audio
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent
            alignOffset={-10}
            avoidCollisions={true}
            collisionPadding={0}
            loop={true}
            sideOffset={10}
          >
            {audioTracks?.map((track, idx: number) => (
              <DropdownMenu.CheckboxItem
                key={`audio-item-${idx}`}
                value={audioIndex === track.index.toString()}
                onValueChange={() => track.setTrack()}
              >
                <DropdownMenu.ItemTitle key={`audio-item-title-${idx}`}>
                  {track.name}
                </DropdownMenu.ItemTitle>
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};

export default DropdownView;
