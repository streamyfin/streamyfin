import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { markAsNotPlayed } from "@/utils/jellyfin/playstate/markAsNotPlayed";
import { markAsPlayed } from "@/utils/jellyfin/playstate/markAsPlayed";
import { Ionicons } from "@expo/vector-icons";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useAtom } from "jotai";
import React from "react";
import { TouchableOpacity, View, ViewProps } from "react-native";
import { RoundButton } from "./RoundButton";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const PlayedStatus: React.FC<Props> = ({ item, ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

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

  const handlePress = async (played: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (played) {
      await markAsNotPlayed({
        api: api,
        itemId: item?.Id,
        userId: user?.Id,
      });
    } else {
      await markAsPlayed({
        api: api,
        item: item,
        userId: user?.Id,
      });
    }
    invalidateQueries();
  };

  return (
    <View {...props}>
      <RoundButton
        icon={
          item.UserData?.Played
            ? "checkmark-circle"
            : "checkmark-circle-outline"
        }
        onPress={() => handlePress(item.UserData?.Played || false)}
        size="large"
      />
    </View>
  );
};
