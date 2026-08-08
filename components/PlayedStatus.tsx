import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useCallback } from "react";
import { View, type ViewProps } from "react-native";
import { Colors } from "@/constants/Colors";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { HeaderIcon } from "./common/HeaderIcon";
import { RoundButton } from "./RoundButton";

interface Props extends ViewProps {
  items: BaseItemDto[];
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
      <RoundButton onPress={handlePress} size={props.size}>
        <HeaderIcon
          name={allPlayed ? "played" : "unplayed"}
          tintColor={allPlayed ? Colors.primary : "white"}
          size={props.size === "large" ? undefined : 18}
        />
      </RoundButton>
    </View>
  );
};
