import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { View, ViewProps } from "react-native";
import { RoundButton } from "./RoundButton";

interface Props extends ViewProps {
  items: BaseItemDto[];
  size?: "default" | "large";
}

export const PlayedStatus: React.FC<Props> = ({ items, ...props }) => {
  const queryClient = useQueryClient();

  const invalidateQueries = () => {
    items.forEach((item) => {
      queryClient.invalidateQueries({
        queryKey: ["item", item.Id],
      });
    })
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

  const allPlayed = items.every((item) => item.UserData?.Played);

  const markAsPlayedStatus = useMarkAsPlayed([...items]);

  return (
    <View {...props}>
      <RoundButton
        fillColor={allPlayed ? "primary" : undefined}
        icon={allPlayed ? "checkmark" : "checkmark"}
        onPress={async () => {    
          console.log(allPlayed);
          await markAsPlayedStatus(!allPlayed)
        }}
        size={props.size}
      />
    </View>
  );
};
