import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { SubtitleHelper } from "@/utils/SubtitleHelper";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import React, { useCallback, useMemo, useState } from "react";
import { Modal, TouchableOpacity, View } from "react-native";
import { useControlContext } from "../contexts/ControlContext";
import { useVideoContext } from "../contexts/VideoContext";
import { TranscodedSubtitle } from "../types";

interface DropdownViewProps {
  showControls: boolean;
}

const DropdownView: React.FC<DropdownViewProps> = ({ showControls }) => {
  const [isMainModalVisible, setIsMainModalVisible] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<
    "subtitle" | "audio" | null
  >(null);

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

  const changeToImageBasedSub = useCallback(
    (subtitleIndex: number) => {
      const queryParams = new URLSearchParams({
        itemId: item.Id ?? "", // Ensure itemId is a string
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex?.toString() ?? "",
        mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
        bitrateValue: bitrateValue,
      }).toString();

      // @ts-expect-error
      router.replace(`player/transcoding-player?${queryParams}`);
    },
    [mediaSource]
  );

  // Audio tracks for transcoding streams.
  const allAudio =
    mediaSource?.MediaStreams?.filter((x) => x.Type === "Audio").map((x) => ({
      name: x.DisplayTitle!,
      index: x.Index!,
    })) || [];

  const ChangeTranscodingAudio = useCallback(
    (audioIndex: number) => {
      const queryParams = new URLSearchParams({
        itemId: item.Id ?? "", // Ensure itemId is a string
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex?.toString() ?? "",
        mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
        bitrateValue: bitrateValue,
      }).toString();

      // @ts-expect-error
      router.replace(`player/transcoding-player?${queryParams}`);
    },
    [mediaSource, subtitleIndex, audioIndex]
  );

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
    <View
      style={{
        position: "absolute",
        zIndex: 1000,
        opacity: showControls ? 1 : 0,
      }}
      className="p-4"
    >
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
                  {allSubtitleTracksForTranscodingStream?.map((sub, idx) => (
                    <TouchableOpacity
                      key={`subtitle-${idx}`}
                      className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                      onPress={() => {
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
                        } else {
                          changeToImageBasedSub(sub.index);
                        }
                        closeAllModals();
                      }}
                    >
                      <Text>{sub.name}</Text>
                      {subtitleIndex ===
                        (isOnTextSubtitle && sub.IsTextSubtitleStream
                          ? subtitleHelper
                              .getSourceSubtitleIndex(sub.index)
                              .toString()
                          : sub?.index.toString()) && (
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
                  {allAudio?.map((track, idx) => (
                    <TouchableOpacity
                      key={`audio-${idx}`}
                      className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                      onPress={() => {
                        if (audioIndex === track.index.toString()) return;
                        router.setParams({
                          audioIndex: track.index.toString(),
                        });
                        ChangeTranscodingAudio(track.index);
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
    </View>
  );
};

export default DropdownView;
