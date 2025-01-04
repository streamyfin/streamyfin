import { convertBitsToMegabitsOrGigabits } from "@/utils/bToMb";
import { Ionicons } from "@expo/vector-icons";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo, useState } from "react";
import { Modal, TouchableOpacity, View } from "react-native";
import { Text } from "./common/Text";

interface Props extends React.ComponentProps<typeof View> {
  item: BaseItemDto;
  onChange: (value: MediaSourceInfo) => void;
  selected?: MediaSourceInfo | null;
}

export const MediaSourceSelector: React.FC<Props> = ({
  item,
  onChange,
  selected,
  ...props
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const selectedName = useMemo(
    () =>
      item.MediaSources?.find((x) => x.Id === selected?.Id)?.MediaStreams?.find(
        (x) => x.Type === "Video"
      )?.DisplayTitle || "",
    [item, selected]
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
          <Text className="opacity-50 mb-1 text-xs">Video</Text>
          <TouchableOpacity
            className="bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between"
            onPress={() => setIsModalVisible(true)}
          >
            <Text numberOfLines={1}>{selectedName}</Text>
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
                Media Sources
              </Text>
            </View>

            <View className="max-h-[50%]">
              {item.MediaSources?.map((source, idx: number) => (
                <TouchableOpacity
                  key={idx.toString()}
                  className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                  onPress={() => {
                    onChange(source);
                    setIsModalVisible(false);
                  }}
                >
                  <Text>
                    {`${name(source.Name)} - ${convertBitsToMegabitsOrGigabits(
                      source.Size
                    )}`}
                  </Text>
                  {source.Id === selected?.Id && (
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

const name = (name?: string | null) => {
  if (name && name.length > 40)
    return name.substring(0, 20) + " [...] " + name.substring(name.length - 20);
  return name;
};
