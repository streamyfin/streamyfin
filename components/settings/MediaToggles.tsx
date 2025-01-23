import React from "react";
import { TouchableOpacity, View, ViewProps } from "react-native";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { Text } from "../common/Text";

interface Props extends ViewProps {}

export const MediaToggles: React.FC<Props> = ({ ...props }) => {
  const [settings, updateSettings] = useSettings();

  if (!settings) return null;

  const renderSkipControl = (
    value: number,
    onDecrease: () => void,
    onIncrease: () => void
  ) => (
    <View className="flex flex-row items-center">
      <TouchableOpacity
        onPress={onDecrease}
        className="w-8 h-8 bg-neutral-800 rounded-l-lg flex items-center justify-center"
      >
        <Text>-</Text>
      </TouchableOpacity>
      <Text className="w-12 h-8 bg-neutral-800 first-letter:px-3 py-2 flex items-center justify-center">
        {value}s
      </Text>
      <TouchableOpacity
        className="w-8 h-8 bg-neutral-800 rounded-r-lg flex items-center justify-center"
        onPress={onIncrease}
      >
        <Text>+</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View {...props}>
      <ListGroup title="Media Controls">
        <ListItem title="Forward Skip Length">
          {renderSkipControl(
            settings.forwardSkipTime,
            () =>
              updateSettings({
                forwardSkipTime: Math.max(0, settings.forwardSkipTime - 5),
              }),
            () =>
              updateSettings({
                forwardSkipTime: Math.min(60, settings.forwardSkipTime + 5),
              })
          )}
        </ListItem>

        <ListItem title="Rewind Length">
          {renderSkipControl(
            settings.rewindSkipTime,
            () =>
              updateSettings({
                rewindSkipTime: Math.max(0, settings.rewindSkipTime - 5),
              }),
            () =>
              updateSettings({
                rewindSkipTime: Math.min(60, settings.rewindSkipTime + 5),
              })
          )}
        </ListItem>
      </ListGroup>
    </View>
  );
};
