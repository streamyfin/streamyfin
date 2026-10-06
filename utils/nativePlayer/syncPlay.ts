import type { TFunction } from "i18next";
import type {
  NativePlayerSyncPlayAction,
  NativePlayerSyncPlayState,
} from "@/modules/mpv-player";
import type { useSyncPlay } from "@/providers/SyncPlayProvider";
import type { SyncPlaySnapshot } from "@/utils/syncplay/types";

export type SyncPlayLibraryState = {
  items: { itemId: string; title: string }[];
  loading: boolean;
  query: string;
  error?: string;
};

const labels = [
  "queue",
  "playback_options",
  "repeat",
  "shuffle",
  "ignore_wait",
  "ignore_wait_hint",
  "on",
  "off",
  "empty_queue",
  "now_playing",
  "move_up",
  "move_down",
  "remove",
  "clear_upcoming",
  "clear_all",
  "add_videos",
  "search_videos",
  "videos_failed",
  "no_videos",
  "play_now",
  "play_next",
  "append",
  "refresh_group",
  "close",
  "play",
  "pause",
  "leave",
  "title",
  "reconnecting",
] as const;

export function buildNativeSyncPlayState(
  sync: SyncPlaySnapshot,
  titles: Record<string, string>,
  library: SyncPlayLibraryState,
  t: TFunction,
): NativePlayerSyncPlayState | null {
  if (!sync.group) return null;
  const status = sync.groupState || "Idle";
  return {
    groupId: sync.group.GroupId,
    groupName: sync.group.GroupName,
    status: t(`syncplay.states.${status}`),
    connected: sync.connected,
    busy: sync.busy,
    error: sync.error || library.error || undefined,
    playlist: sync.playlist.map((item) => ({
      itemId: item.ItemId,
      playlistItemId: item.PlaylistItemId,
      title: titles[item.ItemId] || t("syncplay.unavailable_video"),
    })),
    currentPlaylistItemId: sync.currentPlaylistItemId || undefined,
    repeatMode: sync.repeatMode,
    shuffleMode: sync.shuffleMode,
    ignoreWait: sync.ignoreWait,
    hasNext: sync.hasNext,
    hasPrevious: sync.hasPrevious,
    library: library.items,
    libraryLoading: library.loading,
    libraryQuery: library.query,
    strings: {
      ...Object.fromEntries(labels.map((key) => [key, t(`syncplay.${key}`)])),
      repeat_modes_RepeatNone: t("syncplay.repeat_modes.RepeatNone"),
      repeat_modes_RepeatOne: t("syncplay.repeat_modes.RepeatOne"),
      repeat_modes_RepeatAll: t("syncplay.repeat_modes.RepeatAll"),
      next: t("live_tv.next"),
      previous: t("live_tv.previous"),
      stop: t("player.stopPlayback"),
      status: sync.connected
        ? t(`syncplay.states.${status}`)
        : t("syncplay.reconnecting"),
    },
  };
}

type Coordinator = ReturnType<typeof useSyncPlay>;

/** Swift/Compose requests change the Jellyfin group; they never mutate a solo decoder. */
export async function dispatchNativeSyncPlayAction(
  sync: Coordinator,
  request: NativePlayerSyncPlayAction,
  search: (query: string) => Promise<void>,
): Promise<void> {
  if (!sync.enabled) return;
  switch (request.action) {
    case "play":
      return sync.requestUnpause();
    case "pause":
      return sync.requestPause();
    case "seek":
      if (Number.isFinite(request.positionSec) && request.positionSec! >= 0)
        return sync.requestSeek(Math.round(request.positionSec! * 10_000_000));
      break;
    case "next":
      return sync.requestNext();
    case "previous":
      return sync.requestPrevious();
    case "stop":
      return sync.requestStop();
    case "ended":
      return sync.notifyEnded(request.playlistItemId);
    case "leave":
      return sync.leaveGroup();
    case "refresh":
      if (sync.group) await sync.getGroup(sync.group.GroupId);
      return;
    case "repeat":
      if (
        request.mode === "RepeatNone" ||
        request.mode === "RepeatOne" ||
        request.mode === "RepeatAll"
      )
        return sync.setRepeatMode(request.mode);
      break;
    case "shuffle":
      if (request.mode === "Sorted" || request.mode === "Shuffle")
        return sync.setShuffleMode(request.mode);
      break;
    case "ignoreWait":
      if (typeof request.value === "boolean")
        return sync.setIgnoreWait(request.value);
      break;
    case "select":
      if (request.playlistItemId)
        return sync.requestPlaylistItem(request.playlistItemId);
      break;
    case "remove":
      if (request.playlistItemId)
        return sync.removePlaylistItems([request.playlistItemId]);
      break;
    case "move":
      if (
        request.playlistItemId &&
        Number.isInteger(request.newIndex) &&
        request.newIndex! >= 0
      )
        return sync.movePlaylistItem(request.playlistItemId, request.newIndex!);
      break;
    case "clear":
      if (typeof request.value === "boolean")
        return sync.clearPlaylist(request.value);
      break;
    case "queue":
      if (
        request.itemIds?.length &&
        (request.mode === "Queue" || request.mode === "QueueNext")
      )
        return sync.queueItems(request.itemIds, request.mode);
      break;
    case "search":
      return search(request.query || "");
    case "playItems":
      if (request.itemIds?.length) return sync.playItems(request.itemIds, 0, 0);
      break;
  }
  throw new Error("Invalid native SyncPlay action");
}
