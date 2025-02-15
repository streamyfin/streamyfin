import React from "react";
import { TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { useVideoContext } from "../contexts/VideoContext";
import { useLocalSearchParams } from "expo-router";

interface DropdownViewProps {
  showControls: boolean;
  offline?: boolean; // used to disable external subs for downloads
}

const DropdownView: React.FC<DropdownViewProps> = ({
  showControls,
  offline = false,
}) => {
  const videoContext = useVideoContext();
  const { subtitleTracks, audioTracks } = videoContext;

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
