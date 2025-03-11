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
      if (!item.Id) return;
      queriesToInvalidate.push(["item", item.Id]);
    });

    queriesToInvalidate.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });
  };

  const markAsPlayedStatus = async (played: boolean) => {
    lightHapticFeedback();

    items.forEach((item) => {
      // Optimistic update
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
        },
      );
    });

    try {
      // Process all items
      await Promise.all(
        items.map((item) =>
          played
            ? markAsPlayed({ api, item, userId: user?.Id })
            : markAsNotPlayed({ api, itemId: item?.Id, userId: user?.Id }),
        ),
      );

      // Bulk invalidate
      queryClient.invalidateQueries({
        queryKey: [
          "resumeItems",
          "continueWatching",
          "nextUp-all",
          "nextUp",
          "episodes",
          "seasons",
          "home",
          ...items.map((item) => ["item", item.Id]),
        ].flat(),
      });
    } catch (error) {
      // Revert all optimistic updates on any failure
      items.forEach((item) => {
        queryClient.setQueryData(
          ["item", item.Id],
          (oldData: BaseItemDto | undefined) =>
            oldData
              ? {
                  ...oldData,
                  UserData: { ...oldData.UserData, Played: played },
                }
              : oldData,
        );
      });
      console.error("Error updating played status:", error);
    }

    invalidateQueries();
  };

  return markAsPlayedStatus;
};
