import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { markAsNotPlayed } from "@/utils/jellyfin/playstate/markAsNotPlayed";
import { markAsPlayed } from "@/utils/jellyfin/playstate/markAsPlayed";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import { useHaptic } from "./useHaptic";
import { useAtom } from "jotai";

export const useMarkAsPlayed = (items: BaseItemDto[]) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const queryClient = useQueryClient();
  const lightHapticFeedback = useHaptic("light");

  const invalidateQueries = () => {
    const queriesToInvalidate = [
      ["resumeItems"],
      ["continueWatching"],
      ["nextUp-all"],
      ["nextUp"],
      ["episodes"],
      ["seasons"],
      ["home"],
    ];

    items.forEach((item) => {
      if(!item.Id) return;
      queriesToInvalidate.push(["item", item.Id]);
    });
    
    queriesToInvalidate.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });
  };

  const changeStatus = async (played: boolean, item: BaseItemDto) => {
    // Optimistic update
    queryClient.setQueryData(
      ["item", item.Id],
      (oldData: BaseItemDto | undefined) => {
        if (oldData) {
          return {
            ...oldData,
            UserData: {
              ...oldData.UserData,
              Played: !played,
            },
          };
        }
        return oldData;
      }
    );

    try {
      if (played) {
        await markAsPlayed({
          api: api,
          item: item,
          userId: user?.Id,
        });
      } else {
        await markAsNotPlayed({
          api: api,
          itemId: item?.Id,
          userId: user?.Id,
        });
      }
    } catch (error) {
      // Revert optimistic update on error
      queryClient.setQueryData(
        ["item", item.Id],
        (oldData: BaseItemDto | undefined) => {
          if (oldData) {
            return {
              ...oldData,
              UserData: {
                ...oldData.UserData,
                Played: played,
              },
            };
          }
          return oldData;
        }
      );
      console.error("Error updating played status:", error);
    }

  }

  const markAsPlayedStatus = async (played: boolean) => {
    lightHapticFeedback();

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      await changeStatus(played, item);
    }

    invalidateQueries();
  };

  return markAsPlayedStatus;
};
