import { Ionicons } from "@expo/vector-icons";
import { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo, useState } from "react";
import { Modal, TouchableOpacity, View } from "react-native";
import { Text } from "./common/Text";

interface Props extends React.ComponentProps<typeof View> {
  source?: MediaSourceInfo;
  onChange: (value: number) => void;
  selected?: number | undefined;
}

export const AudioTrackSelector: React.FC<Props> = ({
  source,
  onChange,
  selected,
  ...props
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const audioStreams = useMemo(
    () => source?.MediaStreams?.filter((x) => x.Type === "Audio"),
    [source]
  );

  const selectedAudioSteam = useMemo(
    () => audioStreams?.find((x) => x.Index === selected),
    [audioStreams, selected]
  );
  return (
    <>
      <View
        className="flex shrink"
        style={{
          minWidth: 50,
        }}
      >
        <View className="flex flex-col" {...props}>
          <Text className="opacity-50 mb-1 text-xs">Audio</Text>
          <TouchableOpacity
            className="bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between"
            onPress={() => setIsModalVisible(true)}
          >
            <Text className="" numberOfLines={1}>
              {selectedAudioSteam?.DisplayTitle}
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
                Audio Streams
              </Text>
            </View>

            <View className="max-h-[50%]">
              {audioStreams?.map((audio, idx: number) => (
                <TouchableOpacity
                  key={idx.toString()}
                  className={`p-4 border-b border-neutral-800 flex-row items-center justify-between`}
                  onPress={() => {
                    if (audio.Index !== null && audio.Index !== undefined) {
                      onChange(audio.Index);
                      setIsModalVisible(false);
                    }
                  }}
                >
                  <Text>{audio.DisplayTitle}</Text>
                  {audio.Index === selected && (
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
