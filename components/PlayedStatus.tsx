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

  return (
    <View
      className=" bg-neutral-800/80 rounded-full h-10 w-10 flex items-center justify-center"
      {...props}
    >
      {item.UserData?.Played ? (
        <TouchableOpacity
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await markAsNotPlayed({
              api: api,
              itemId: item?.Id,
              userId: user?.Id,
            });
            invalidateQueries();
          }}
        >
          <View className="rounded h-10 aspect-square flex items-center justify-center">
            <Ionicons name="checkmark-circle" size={24} color="white" />
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await markAsPlayed({
              api: api,
              item: item,
              userId: user?.Id,
            });
            invalidateQueries();
          }}
        >
          <View className="rounded h-10 aspect-square flex items-center justify-center">
            <Ionicons name="checkmark-circle-outline" size={24} color="white" />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};
