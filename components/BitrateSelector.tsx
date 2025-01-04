import { TouchableOpacity, View, Modal } from "react-native";
import { Text } from "./common/Text";
import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";

export type Bitrate = {
  key: string;
  value: number | undefined;
};

export const BITRATES: Bitrate[] = [
  {
    key: "Max",
    value: undefined,
  },
  {
    key: "8 Mb/s",
    value: 8000000,
    height: 1080,
  },
  {
    key: "4 Mb/s",
    value: 4000000,
    height: 1080,
  },
  {
    key: "2 Mb/s",
    value: 2000000,
  },
  {
    key: "500 Kb/s",
    value: 500000,
  },
  {
    key: "250 Kb/s",
    value: 250000,
  },
].sort((a, b) => (b.value || Infinity) - (a.value || Infinity));

interface Props extends React.ComponentProps<typeof View> {
  onChange: (value: Bitrate) => void;
  selected?: Bitrate | null;
  inverted?: boolean | null;
}

export const BitrateSelector: React.FC<Props> = ({
  onChange,
  selected,
  inverted,
  ...props
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const sorted = useMemo(() => {
    if (inverted)
      return BITRATES.sort(
        (a, b) => (a.value || Infinity) - (b.value || Infinity)
      );
    return BITRATES.sort(
      (a, b) => (b.value || Infinity) - (a.value || Infinity)
    );
  }, [inverted]);

  return (
    <>
      <View
        className="flex shrink"
        style={{
          minWidth: 60,
          maxWidth: 200,
        }}
      >
        <View className="flex flex-col" {...props}>
          <Text className="opacity-50 mb-1 text-xs">Quality</Text>
          <TouchableOpacity
            className="bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between"
            onPress={() => setIsModalVisible(true)}
          >
            <Text className="" numberOfLines={1}>
              {BITRATES.find((b) => b.value === selected?.value)?.key}
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
                Select Quality
              </Text>
            </View>

            <View className="max-h-[50%]">
              {sorted.map((bitrate) => (
                <TouchableOpacity
                  key={bitrate.key}
                  className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                  onPress={() => {
                    onChange(bitrate);
                    setIsModalVisible(false);
                  }}
                >
                  <Text>{bitrate.key}</Text>
                  {bitrate.value === selected?.value && (
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
