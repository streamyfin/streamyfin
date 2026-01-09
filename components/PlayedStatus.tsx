import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useCallback } from "react";
import { View, type ViewProps } from "react-native";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { RoundButton } from "./RoundButton";

interface Props extends ViewProps {
  items: BaseItemDto[];
  isOffline?: boolean;
  size?: "default" | "large";
}

export const PlayedStatus: React.FC<Props> = ({ items, ...props }) => {
  const allPlayed = items.every((item) => item.UserData?.Played);
  const toggle = useMarkAsPlayed(items);

  const handlePress = useCallback(() => {
    void toggle(!allPlayed);
  }, [allPlayed, toggle]);

  return (
    <View {...props}>
      <RoundButton
        color={allPlayed ? "purple" : "white"}
        icon={allPlayed ? "checkmark" : "checkmark"}
        onPress={handlePress}
        size={props.size}
      />
    </View>
  );
};
