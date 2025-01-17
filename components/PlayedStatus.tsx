import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { View, ViewProps } from "react-native";
import { RoundButton } from "./RoundButton";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const PlayedStatus: React.FC<Props> = ({ item, ...props }) => {
  const queryClient = useQueryClient();

  const invalidateQueries = () => {
    queryClient.invalidateQueries({
      queryKey: ["item", item.Id],
    });
    queryClient.invalidateQueries({
      queryKey: ["resumeItems"],
    });
    queryClient.invalidateQueries({
      queryKey: ["continueWatching"],
    });
    queryClient.invalidateQueries({
      queryKey: ["nextUp-all"],
    });
    queryClient.invalidateQueries({
      queryKey: ["nextUp"],
    });
    queryClient.invalidateQueries({
      queryKey: ["episodes"],
    });
    queryClient.invalidateQueries({
      queryKey: ["seasons"],
    });
    queryClient.invalidateQueries({
      queryKey: ["home"],
    });
  };

  const markAsPlayedStatus = useMarkAsPlayed(item);

  return (
    <View {...props}>
      <RoundButton
        fillColor={item.UserData?.Played ? "primary" : undefined}
        icon={item.UserData?.Played ? "checkmark" : "checkmark"}
        onPress={() => markAsPlayedStatus(!item.UserData?.Played || true)}
        size="large"
      />
    </View>
  );
};
