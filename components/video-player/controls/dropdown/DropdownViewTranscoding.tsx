import React, { useCallback, useMemo, useState } from "react";
import { View, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { useControlContext } from "../contexts/ControlContext";
import { useVideoContext } from "../contexts/VideoContext";
import { TranscodedSubtitle } from "../types";
import { useAtomValue } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SubtitleHelper } from "@/utils/SubtitleHelper";

interface DropdownViewProps {
  showControls: boolean;
  offline?: boolean; // used to disable external subs for downloads
}

const DropdownView: React.FC<DropdownViewProps> = ({ showControls }) => {
  const router = useRouter();
  const api = useAtomValue(apiAtom);
  const ControlContext = useControlContext();
  const mediaSource = ControlContext?.mediaSource;
  const item = ControlContext?.item;
  const isVideoLoaded = ControlContext?.isVideoLoaded;

  const videoContext = useVideoContext();
  const { subtitleTracks, setSubtitleTrack } = videoContext;

  const { subtitleIndex, audioIndex, bitrateValue } = useLocalSearchParams<{
    itemId: string;
    audioIndex: string;
    subtitleIndex: string;
    mediaSourceId: string;
    bitrateValue: string;
  }>();

  // Either its on a text subtitle or its on not on any subtitle therefore it should show all the embedded HLS subtitles.

  const isOnTextSubtitle = useMemo(() => {
    const res = Boolean(
      mediaSource?.MediaStreams?.find(
        (x) => x.Index === parseInt(subtitleIndex) && x.IsTextSubtitleStream
      ) || subtitleIndex === "-1"
    );
    return res;
  }, []);

  const allSubs =
    mediaSource?.MediaStreams?.filter((x) => x.Type === "Subtitle") ?? [];

  const subtitleHelper = new SubtitleHelper(mediaSource?.MediaStreams ?? []);

  const allSubtitleTracksForTranscodingStream = useMemo(() => {
    const disableSubtitle = {
      name: "Disable",
      index: -1,
      IsTextSubtitleStream: true,
    } as TranscodedSubtitle;
    if (isOnTextSubtitle) {
      const textSubtitles =
        subtitleTracks?.map((s) => ({
          name: s.name,
          index: s.index,
          IsTextSubtitleStream: true,
        })) || [];

      const sortedSubtitles = subtitleHelper.getSortedSubtitles(textSubtitles);

      return [disableSubtitle, ...sortedSubtitles];
    }

    const transcodedSubtitle: TranscodedSubtitle[] = allSubs.map((x) => ({
      name: x.DisplayTitle!,
      index: x.Index!,
      IsTextSubtitleStream: x.IsTextSubtitleStream!,
    }));

    return [disableSubtitle, ...transcodedSubtitle];
  }, [item, isVideoLoaded, subtitleTracks, mediaSource?.MediaStreams]);

  // TODO: Make image based subtitles work with transcoding streams in VLC
  const changeToImageBasedSub = useCallback(
    (subtitleIndex: number) => {
      const queryParams = new URLSearchParams({
        itemId: item.Id ?? "", // Ensure itemId is a string
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex?.toString() ?? "",
        mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
        bitrateValue: bitrateValue,
      }).toString();

      // router.replace(`player/transcoding-player?${queryParams}`);
    },
    [mediaSource]
  );

  // Audio tracks for transcoding streams.
  const allAudio =
    mediaSource?.MediaStreams?.filter((x) => x.Type === "Audio").map((x) => ({
      name: x.DisplayTitle!,
      index: x.Index!,
    })) || [];

  // TODO: Make audio work with transcoding streams in VLC
  const ChangeTranscodingAudio = useCallback(
    (audioIndex: number) => {
      const queryParams = new URLSearchParams({
        itemId: item.Id ?? "", // Ensure itemId is a string
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex?.toString() ?? "",
        mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
        bitrateValue: bitrateValue,
      }).toString();

      // router.replace(`player/transcoding-player?${queryParams}`);
    },
    [mediaSource, subtitleIndex, audioIndex]
  );

  return (
    <View>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <TouchableOpacity className="aspect-square flex flex-col rounded-xl items-center justify-center p-2">
            <Ionicons name="ellipsis-horizontal" size={24} color={"white"} />
          </TouchableOpacity>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          loop={true}
          side="bottom"
          align="start"
          alignOffset={0}
          avoidCollisions={true}
          collisionPadding={8}
          sideOffset={8}
        >
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger key="subtitle-trigger">
              Subtitle
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent
              alignOffset={-10}
              avoidCollisions={true}
              collisionPadding={0}
              loop={true}
              sideOffset={10}
            >
              {allSubtitleTracksForTranscodingStream?.map(
                (sub, idx: number) => (
                  <DropdownMenu.CheckboxItem
                    value={
                      subtitleIndex ===
                      (isOnTextSubtitle && sub.IsTextSubtitleStream
                        ? subtitleHelper
                            .getSourceSubtitleIndex(sub.index)
                            .toString()
                        : sub?.index.toString())
                    }
                    key={`subtitle-item-${idx}`}
                    onValueChange={() => {
                      if (
                        subtitleIndex ===
                        (isOnTextSubtitle && sub.IsTextSubtitleStream
                          ? subtitleHelper
                              .getSourceSubtitleIndex(sub.index)
                              .toString()
                          : sub?.index.toString())
                      )
                        return;

                      router.setParams({
                        subtitleIndex: subtitleHelper
                          .getSourceSubtitleIndex(sub.index)
                          .toString(),
                      });

                      if (sub.IsTextSubtitleStream && isOnTextSubtitle) {
                        setSubtitleTrack && setSubtitleTrack(sub.index);
                        return;
                      }
                      changeToImageBasedSub(sub.index);
                    }}
                  >
                    <DropdownMenu.ItemTitle key={`subtitle-item-title-${idx}`}>
                      {sub.name}
                    </DropdownMenu.ItemTitle>
                  </DropdownMenu.CheckboxItem>
                )
              )}
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger key="audio-trigger">
              Audio
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent
              alignOffset={-10}
              avoidCollisions={true}
              collisionPadding={0}
              loop={true}
              sideOffset={10}
            >
              {allAudio?.map((track, idx: number) => (
                <DropdownMenu.CheckboxItem
                  key={`audio-item-${idx}`}
                  value={audioIndex === track.index.toString()}
                  onValueChange={() => {
                    if (audioIndex === track.index.toString()) return;
                    router.setParams({
                      audioIndex: track.index.toString(),
                    });
                    ChangeTranscodingAudio(track.index);
                  }}
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
    </View>
  );
};

export default DropdownView;
