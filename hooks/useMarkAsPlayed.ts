import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { markAsNotPlayed } from "@/utils/jellyfin/playstate/markAsNotPlayed";
import { markAsPlayed } from "@/utils/jellyfin/playstate/markAsPlayed";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import { useHaptic } from "./useHaptic";
import { useAtom } from "jotai";

export const useMarkAsPlayed = (item: BaseItemDto) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const queryClient = useQueryClient();
  const lightHapticFeedback = useHaptic("light");

  const invalidateQueries = () => {
    const queriesToInvalidate = [
      ["item", item.Id],
      ["resumeItems"],
      ["continueWatching"],
      ["nextUp-all"],
      ["nextUp"],
      ["episodes"],
      ["seasons"],
      ["home"],
    ];

    queriesToInvalidate.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });
  };

  const markAsPlayedStatus = async (played: boolean) => {
    lightHapticFeedback();

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
      invalidateQueries();
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
  };

  return markAsPlayedStatus;
};
