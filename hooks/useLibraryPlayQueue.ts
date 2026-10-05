import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { NavigationContext } from "expo-router/react-navigation";
import { useAtomValue } from "jotai";
import { useCallback, useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { useShuffleQueue } from "@/hooks/useShuffleQueue";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  buildLibraryQueueQuery,
  type LibraryItemsFilter,
  libraryLanguageOptions,
} from "@/utils/library/libraryItemsQuery";
import { writeErrorLog } from "@/utils/log";

/**
 * Play All and Shuffle for a library page: asks the server for the list the
 * filters currently select, queues it and starts the first item.
 */
export const useLibraryPlayQueue = (filter: LibraryItemsFilter) => {
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();
  const { startQueue } = useShuffleQueue();
  const navigation = useContext(NavigationContext);
  const [isStarting, setIsStarting] = useState(false);
  // The state above lags a render behind, which is long enough for a second
  // tap to send a second request and open a second player.
  const startingRef = useRef(false);

  const start = useCallback(
    async (shuffle: boolean) => {
      if (!api || startingRef.current) return;
      startingRef.current = true;
      setIsStarting(true);
      try {
        const response = await getItemsApi(api).getItems(
          buildLibraryQueueQuery(filter, { shuffle }),
          libraryLanguageOptions(filter),
        );
        // The answer can arrive after the user left the page, or after an
        // earlier tap already opened the player. Starting then would present
        // a player nobody asked for, or swap the queue under the one playing.
        if (navigation?.isFocused?.() === false) return;
        // The grid can show items while the queue comes back empty: an audio
        // playlist, or a library whose last match was just deleted.
        if (!startQueue(response.data.Items ?? [])) {
          toast(t("library.no_results"));
        }
      } catch (error) {
        writeErrorLog("Library play queue failed to start", error);
        toast.error(t("common.something_went_wrong"));
      } finally {
        startingRef.current = false;
        setIsStarting(false);
      }
    },
    [api, filter, startQueue, t, navigation],
  );

  const playAll = useCallback(() => start(false), [start]);
  const shuffle = useCallback(() => start(true), [start]);

  return { playAll, shuffle, isStarting };
};
