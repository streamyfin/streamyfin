import React, { useMemo, useState } from "react";
import { View, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useControlContext } from "../contexts/ControlContext";
import { useVideoContext } from "../contexts/VideoContext";
import { EmbeddedSubtitle, ExternalSubtitle } from "../types";
import { useAtomValue } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import { router, useLocalSearchParams } from "expo-router";
import { Text } from "@/components/common/Text";

interface DropdownViewDirectProps {
  showControls: boolean;
}

const DropdownViewDirect: React.FC<DropdownViewDirectProps> = ({
  showControls,
}) => {
  const [isMainModalVisible, setIsMainModalVisible] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<
    "subtitle" | "audio" | null
  >(null);

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

    return [...embeddedSubs, ...externalSubs] as (
      | EmbeddedSubtitle
      | ExternalSubtitle
    )[];
  }, [item, isVideoLoaded, subtitleTracks, mediaSource?.MediaStreams]);

  const { subtitleIndex, audioIndex } = useLocalSearchParams<{
    itemId: string;
    audioIndex: string;
    subtitleIndex: string;
    mediaSourceId: string;
    bitrateValue: string;
  }>();

  const closeAllModals = () => {
    setIsMainModalVisible(false);
    setActiveSubMenu(null);
  };

  const MenuOption = ({
    label,
    onPress,
  }: {
    label: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
      onPress={onPress}
    >
      <Text>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color="white" />
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity
        className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
        onPress={() => setIsMainModalVisible(true)}
      >
        <Ionicons name="ellipsis-horizontal" size={24} color="white" />
      </TouchableOpacity>

      <Modal
        visible={isMainModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeAllModals}
      >
        <TouchableOpacity
          className="flex-1 bg-black/50"
          activeOpacity={1}
          onPress={closeAllModals}
        >
          <View className="mt-auto bg-neutral-900 rounded-t-xl">
            {!activeSubMenu ? (
              <>
                <View className="p-4 border-b border-neutral-800">
                  <Text className="text-lg font-bold text-center">
                    Settings
                  </Text>
                </View>
                <View>
                  <MenuOption
                    label="Subtitle"
                    onPress={() => setActiveSubMenu("subtitle")}
                  />
                  <MenuOption
                    label="Audio"
                    onPress={() => setActiveSubMenu("audio")}
                  />
                </View>
              </>
            ) : activeSubMenu === "subtitle" ? (
              <>
                <View className="p-4 border-b border-neutral-800 flex-row items-center">
                  <TouchableOpacity onPress={() => setActiveSubMenu(null)}>
                    <Ionicons name="chevron-back" size={24} color="white" />
                  </TouchableOpacity>
                  <Text className="text-lg font-bold ml-2">Subtitle</Text>
                </View>
                <View className="max-h-[50%]">
                  {allSubtitleTracksForDirectPlay?.map((sub, idx) => (
                    <TouchableOpacity
                      key={`subtitle-${idx}`}
                      className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                      onPress={() => {
                        if ("deliveryUrl" in sub && sub.deliveryUrl) {
                          setSubtitleURL?.(
                            api?.basePath + sub.deliveryUrl,
                            sub.name
                          );
                        } else {
                          setSubtitleTrack?.(sub.index);
                        }
                        router.setParams({
                          subtitleIndex: sub.index.toString(),
                        });
                        closeAllModals();
                      }}
                    >
                      <Text>{sub.name}</Text>
                      {subtitleIndex === sub.index.toString() && (
                        <Ionicons name="checkmark" size={24} color="white" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                <View className="p-4 border-b border-neutral-800 flex-row items-center">
                  <TouchableOpacity onPress={() => setActiveSubMenu(null)}>
                    <Ionicons name="chevron-back" size={24} color="white" />
                  </TouchableOpacity>
                  <Text className="text-lg font-bold ml-2">Audio</Text>
                </View>
                <View className="max-h-[50%]">
                  {audioTracks?.map((track, idx) => (
                    <TouchableOpacity
                      key={`audio-${idx}`}
                      className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                      onPress={() => {
                        setAudioTrack?.(track.index);
                        router.setParams({
                          audioIndex: track.index.toString(),
                        });
                        closeAllModals();
                      }}
                    >
                      <Text>{track.name}</Text>
                      {audioIndex === track.index.toString() && (
                        <Ionicons name="checkmark" size={24} color="white" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity
              className="p-4 border-t border-neutral-800"
              onPress={closeAllModals}
            >
              <Text className="text-center text-purple-400">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

export default DropdownViewDirect;
