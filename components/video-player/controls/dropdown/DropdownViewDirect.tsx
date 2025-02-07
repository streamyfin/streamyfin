import React, { useMemo, useState } from "react";
import { View, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { useControlContext } from "../contexts/ControlContext";
import { useVideoContext } from "../contexts/VideoContext";
import { EmbeddedSubtitle, ExternalSubtitle } from "../types";
import { useAtomValue } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import { router, useLocalSearchParams } from "expo-router";

interface DropdownViewDirectProps {
  showControls: boolean;
  offline?: boolean; // used to disable external subs for downloads
}

const DropdownViewDirect: React.FC<DropdownViewDirectProps> = ({
  showControls,
  offline = false,
}) => {
  const api = useAtomValue(apiAtom);
  const ControlContext = useControlContext();
  const mediaSource = ControlContext?.mediaSource;
  const item = ControlContext?.item;
  const isVideoLoaded = ControlContext?.isVideoLoaded;

  const videoContext = useVideoContext();
  const {
    subtitleTracks,
    audioTracks,
    setSubtitleURL,
    setSubtitleTrack,
    setAudioTrack,
  } = videoContext;

  const allSubtitleTracksForDirectPlay = useMemo(() => {
    if (mediaSource?.TranscodingUrl) return null;
    const embeddedSubs =
      subtitleTracks
        ?.map((s) => ({
          name: s.name,
          index: s.index,
          deliveryUrl: undefined,
        }))
        .filter((sub) => !sub.name.endsWith("[External]")) || [];

    const externalSubs =
      mediaSource?.MediaStreams?.filter(
        (stream) => stream.Type === "Subtitle" && !!stream.DeliveryUrl
      ).map((s) => ({
        name: s.DisplayTitle! + " [External]",
        index: s.Index!,
        deliveryUrl: s.DeliveryUrl,
      })) || [];

    // Combine embedded subs with external subs only if not offline
    if (!offline) {
      return [...embeddedSubs, ...externalSubs] as (
        | EmbeddedSubtitle
        | ExternalSubtitle
      )[];
    }
    return embeddedSubs as EmbeddedSubtitle[];
  }, [item, isVideoLoaded, subtitleTracks, mediaSource?.MediaStreams, offline]);

  const { subtitleIndex, audioIndex } = useLocalSearchParams<{
    itemId: string;
    audioIndex: string;
    subtitleIndex: string;
    mediaSourceId: string;
    bitrateValue: string;
  }>();

  return (
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
            {allSubtitleTracksForDirectPlay?.map((sub, idx: number) => (
              <DropdownMenu.CheckboxItem
                key={`subtitle-item-${idx}`}
                value={subtitleIndex === sub.index.toString()}
                onValueChange={() => {
                  if ("deliveryUrl" in sub && sub.deliveryUrl) {
                    setSubtitleURL &&
                      setSubtitleURL(api?.basePath + sub.deliveryUrl, sub.name);
                  } else {
                    setSubtitleTrack && setSubtitleTrack(sub.index);
                  }
                  router.setParams({
                    subtitleIndex: sub.index.toString(),
                  });
                }}
              >
                <DropdownMenu.ItemTitle key={`subtitle-item-title-${idx}`}>
                  {sub.name}
                </DropdownMenu.ItemTitle>
              </DropdownMenu.CheckboxItem>
            ))}
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
            {audioTracks?.map((track, idx: number) => (
              <DropdownMenu.CheckboxItem
                key={`audio-item-${idx}`}
                value={audioIndex === track.index.toString()}
                onValueChange={() => {
                  setAudioTrack && setAudioTrack(track.index);
                  router.setParams({
                    audioIndex: track.index.toString(),
                  });
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
  );
};

export default DropdownViewDirect;
