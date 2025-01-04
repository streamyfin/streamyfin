import { tc } from "@/utils/textTools";
import { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo, useState } from "react";
import { Platform, TouchableOpacity, View, Modal } from "react-native";
import { Text } from "./common/Text";
import { SubtitleHelper } from "@/utils/SubtitleHelper";
import { Ionicons } from "@expo/vector-icons";

interface Props extends React.ComponentProps<typeof View> {
  source?: MediaSourceInfo;
  onChange: (value: number) => void;
  selected?: number | undefined;
  isTranscoding?: boolean;
}

export const SubtitleTrackSelector: React.FC<Props> = ({
  source,
  onChange,
  selected,
  isTranscoding,
  ...props
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const subtitleStreams = useMemo(() => {
    const subtitleHelper = new SubtitleHelper(source?.MediaStreams ?? []);

    if (isTranscoding && Platform.OS === "ios") {
      return subtitleHelper.getUniqueSubtitles();
    }

    return subtitleHelper.getSubtitles();
  }, [source, isTranscoding]);

  const selectedSubtitleSteam = useMemo(
    () => subtitleStreams.find((x) => x.Index === selected),
    [subtitleStreams, selected]
  );

  if (subtitleStreams.length === 0) return null;

  return (
    <>
      <View
        className="flex col shrink justify-start place-self-start items-start"
        style={{
          minWidth: 60,
          maxWidth: 200,
        }}
      >
        <View className="flex flex-col" {...props}>
          <Text className="opacity-50 mb-1 text-xs">Subtitle</Text>
          <TouchableOpacity
            className="bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between"
            onPress={() => setIsModalVisible(true)}
          >
            <Text>
              {selectedSubtitleSteam
                ? tc(selectedSubtitleSteam?.DisplayTitle, 7)
                : "None"}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color="white"
              style={{ opacity: 0.5 }}
            />
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={isModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/50"
          activeOpacity={1}
          onPress={() => setIsModalVisible(false)}
        >
          <View className="mt-auto bg-neutral-900 rounded-t-xl">
            <View className="p-4 border-b border-neutral-800">
              <Text className="text-lg font-bold text-center">
                Subtitle Tracks
              </Text>
            </View>

            <View className="max-h-[50%]">
              <TouchableOpacity
                className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                onPress={() => {
                  onChange(-1);
                  setIsModalVisible(false);
                }}
              >
                <Text>None</Text>
                {selected === -1 && (
                  <Ionicons name="checkmark" size={24} color="white" />
                )}
              </TouchableOpacity>

              {subtitleStreams?.map((subtitle, idx: number) => (
                <TouchableOpacity
                  key={idx.toString()}
                  className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                  onPress={() => {
                    if (
                      subtitle.Index !== undefined &&
                      subtitle.Index !== null
                    ) {
                      onChange(subtitle.Index);
                      setIsModalVisible(false);
                    }
                  }}
                >
                  <Text>{subtitle.DisplayTitle}</Text>
                  {subtitle.Index === selected && (
                    <Ionicons name="checkmark" size={24} color="white" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              className="p-4 border-t border-neutral-800"
              onPress={() => setIsModalVisible(false)}
            >
              <Text className="text-center text-purple-400">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};
