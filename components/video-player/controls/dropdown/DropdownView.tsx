import { Ionicons } from "@expo/vector-icons";
import React, { useCallback } from "react";
import { Platform, TouchableOpacity } from "react-native";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { BITRATES } from "@/components/BitrateSelector";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useControlContext } from "../contexts/ControlContext";
import { useVideoContext } from "../contexts/VideoContext";

const DropdownView = () => {
  const videoContext = useVideoContext();
  const { subtitleTracks, audioTracks } = videoContext;
  const ControlContext = useControlContext();
  const [item, mediaSource] = [
    ControlContext?.item,
    ControlContext?.mediaSource,
  ];
  const router = useRouter();

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
