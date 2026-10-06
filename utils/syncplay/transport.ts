import type { Api } from "@jellyfin/sdk";
import type { GroupInfoDto } from "@jellyfin/sdk/lib/generated-client";
import { getSyncPlayApi, getTimeSyncApi } from "@jellyfin/sdk/lib/utils/api";
import type { SyncPlayGroup, SyncPlayTransport } from "./types";

const toGroup = (group: GroupInfoDto | undefined): SyncPlayGroup | undefined =>
  group?.GroupId
    ? {
        GroupId: group.GroupId,
        GroupName: group.GroupName ?? "",
        Participants: group.Participants ?? [],
        State: group.State,
        LastUpdatedAt: group.LastUpdatedAt,
      }
    : undefined;

export const createSyncPlayTransport = (api: Api): SyncPlayTransport => {
  const sync = getSyncPlayApi(api);
  return {
    listGroups: async () =>
      (await sync.syncPlayGetGroups()).data
        .map(toGroup)
        .filter((group): group is SyncPlayGroup => !!group),
    getGroup: async (id) => toGroup((await sync.syncPlayGetGroup({ id })).data),
    createGroup: async (name) =>
      toGroup(
        (
          await sync.syncPlayCreateGroup({
            newGroupRequestDto: { GroupName: name },
          })
        ).data,
      ),
    joinGroup: async (groupId) => {
      await sync.syncPlayJoinGroup({
        joinGroupRequestDto: { GroupId: groupId },
      });
    },
    leaveGroup: async () => {
      await sync.syncPlayLeaveGroup();
    },
    getTime: async () => (await getTimeSyncApi(api).getUtcTime()).data,
    ping: async (pingMs) => {
      await sync.syncPlayPing({ pingRequestDto: { Ping: pingMs } });
    },
    playItems: async (ids, index, position) => {
      await sync.syncPlaySetNewQueue({
        playRequestDto: {
          PlayingQueue: ids,
          PlayingItemPosition: index,
          StartPositionTicks: position,
        },
      });
    },
    queueItems: async (ids, mode) => {
      await sync.syncPlayQueue({
        queueRequestDto: { ItemIds: ids, Mode: mode },
      });
    },
    removePlaylistItems: async (ids, clearPlaylist, clearPlayingItem) => {
      await sync.syncPlayRemoveFromPlaylist({
        removeFromPlaylistRequestDto: {
          PlaylistItemIds: ids,
          ClearPlaylist: clearPlaylist,
          ClearPlayingItem: clearPlayingItem,
        },
      });
    },
    movePlaylistItem: async (playlistItemId, newIndex) => {
      await sync.syncPlayMovePlaylistItem({
        movePlaylistItemRequestDto: {
          PlaylistItemId: playlistItemId,
          NewIndex: newIndex,
        },
      });
    },
    setPlaylistItem: async (playlistItemId) => {
      await sync.syncPlaySetPlaylistItem({
        setPlaylistItemRequestDto: { PlaylistItemId: playlistItemId },
      });
    },
    setRepeatMode: async (mode) => {
      await sync.syncPlaySetRepeatMode({
        setRepeatModeRequestDto: { Mode: mode },
      });
    },
    setShuffleMode: async (mode) => {
      await sync.syncPlaySetShuffleMode({
        setShuffleModeRequestDto: { Mode: mode },
      });
    },
    setIgnoreWait: async (ignoreWait) => {
      await sync.syncPlaySetIgnoreWait({
        ignoreWaitRequestDto: { IgnoreWait: ignoreWait },
      });
    },
    pause: async () => {
      await sync.syncPlayPause();
    },
    unpause: async () => {
      await sync.syncPlayUnpause();
    },
    seek: async (position) => {
      await sync.syncPlaySeek({ seekRequestDto: { PositionTicks: position } });
    },
    stop: async () => {
      await sync.syncPlayStop();
    },
    next: async (playlistItemId) => {
      await sync.syncPlayNextItem({
        nextItemRequestDto: { PlaylistItemId: playlistItemId },
      });
    },
    previous: async (playlistItemId) => {
      await sync.syncPlayPreviousItem({
        previousItemRequestDto: { PlaylistItemId: playlistItemId },
      });
    },
    ready: async (request) => {
      await sync.syncPlayReady({ readyRequestDto: request });
    },
    buffering: async (request) => {
      await sync.syncPlayBuffering({ bufferRequestDto: request });
    },
  };
};
