import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { NavigationContext } from "expo-router/react-navigation";
import { useAtomValue } from "jotai";
import { useCallback, useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";
import { writeErrorLog } from "@/utils/log";
import {
  buildMusicQueueQuery,
  type MusicQueueSource,
} from "@/utils/music/musicQueries";

/**
 * Play all and Shuffle for a music library or folder: asks the server for its
 * songs, queues them and starts the first one.
 */
export const useMusicPlayQueue = (source: MusicQueueSource | null) => {
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();
  const { playQueue } = useMusicPlayer();
  const navigation = useContext(NavigationContext);
  const [isStarting, setIsStarting] = useState(false);
  // The state above lags a render behind, which is long enough for a second
  // tap to send a second request and replace the queue the first one started.
  const startingRef = useRef(false);

  const start = useCallback(
    async (shuffle: boolean) => {
      if (!api || !source || startingRef.current) return;
      startingRef.current = true;
      setIsStarting(true);
      try {
        const response = await getItemsApi(api).getItems(
          buildMusicQueueQuery(source, { shuffle }),
        );
        // The answer can arrive after the user left the page; swapping the
        // queue then would replace whatever they started in the meantime.
        if (navigation?.isFocused?.() === false) return;
        const tracks = response.data.Items ?? [];
        if (tracks.length === 0) {
          toast(t("music.no_songs"));
          return;
        }
        playQueue(tracks, 0);
      } catch (error) {
        writeErrorLog("Music play queue failed to start", error);
        toast.error(t("common.something_went_wrong"));
      } finally {
        startingRef.current = false;
        setIsStarting(false);
      }
    },
    [api, source, playQueue, t, navigation],
  );

  const playAll = useCallback(() => start(false), [start]);
  const shuffle = useCallback(() => start(true), [start]);

  return { playAll, shuffle, isStarting };
};
