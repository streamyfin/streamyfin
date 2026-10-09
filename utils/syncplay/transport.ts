import type { Api } from "@jellyfin/sdk";
import type { GroupInfoDto } from "@jellyfin/sdk/lib/generated-client";
import { getSyncPlayApi, getTimeSyncApi } from "@jellyfin/sdk/lib/utils/api";
import { SYNCPLAY_REQUEST_TIMEOUT_MS } from "@/constants/SyncPlay";
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
  const options = { timeout: SYNCPLAY_REQUEST_TIMEOUT_MS };
  return {
    listGroups: async () =>
      (await sync.syncPlayGetGroups(options)).data
        .map(toGroup)
        .filter((group): group is SyncPlayGroup => !!group),
    getGroup: async (id) =>
      toGroup((await sync.syncPlayGetGroup({ id }, options)).data),
    createGroup: async (name) =>
      toGroup(
        (
          await sync.syncPlayCreateGroup(
            {
              newGroupRequestDto: { GroupName: name },
            },
            options,
          )
        ).data,
      ),
    joinGroup: async (groupId) => {
      await sync.syncPlayJoinGroup(
        {
          joinGroupRequestDto: { GroupId: groupId },
        },
        options,
      );
    },
    leaveGroup: async () => {
      await sync.syncPlayLeaveGroup(options);
    },
    getTime: async () => (await getTimeSyncApi(api).getUtcTime(options)).data,
    ping: async (pingMs) => {
      await sync.syncPlayPing({ pingRequestDto: { Ping: pingMs } }, options);
    },
    playItems: async (ids, index, position) => {
      await sync.syncPlaySetNewQueue(
        {
          playRequestDto: {
            PlayingQueue: ids,
            PlayingItemPosition: index,
            StartPositionTicks: position,
          },
        },
        options,
      );
    },
    queueItems: async (ids, mode) => {
      await sync.syncPlayQueue(
        {
          queueRequestDto: { ItemIds: ids, Mode: mode },
        },
        options,
      );
    },
    removePlaylistItems: async (ids, clearPlaylist, clearPlayingItem) => {
      await sync.syncPlayRemoveFromPlaylist(
        {
          removeFromPlaylistRequestDto: {
            PlaylistItemIds: ids,
            ClearPlaylist: clearPlaylist,
            ClearPlayingItem: clearPlayingItem,
          },
        },
        options,
      );
    },
    movePlaylistItem: async (playlistItemId, newIndex) => {
      await sync.syncPlayMovePlaylistItem(
        {
          movePlaylistItemRequestDto: {
            PlaylistItemId: playlistItemId,
            NewIndex: newIndex,
          },
        },
        options,
      );
    },
    setPlaylistItem: async (playlistItemId) => {
      await sync.syncPlaySetPlaylistItem(
        {
          setPlaylistItemRequestDto: { PlaylistItemId: playlistItemId },
        },
        options,
      );
    },
    setRepeatMode: async (mode) => {
      await sync.syncPlaySetRepeatMode(
        {
          setRepeatModeRequestDto: { Mode: mode },
        },
        options,
      );
    },
    setShuffleMode: async (mode) => {
      await sync.syncPlaySetShuffleMode(
        {
          setShuffleModeRequestDto: { Mode: mode },
        },
        options,
      );
    },
    setIgnoreWait: async (ignoreWait) => {
      await sync.syncPlaySetIgnoreWait(
        {
          ignoreWaitRequestDto: { IgnoreWait: ignoreWait },
        },
        options,
      );
    },
    pause: async () => {
      await sync.syncPlayPause(options);
    },
    unpause: async () => {
      await sync.syncPlayUnpause(options);
    },
    seek: async (position) => {
      await sync.syncPlaySeek(
        { seekRequestDto: { PositionTicks: position } },
        options,
      );
    },
    stop: async () => {
      await sync.syncPlayStop(options);
    },
    next: async (playlistItemId) => {
      await sync.syncPlayNextItem(
        {
          nextItemRequestDto: { PlaylistItemId: playlistItemId },
        },
        options,
      );
    },
    previous: async (playlistItemId) => {
      await sync.syncPlayPreviousItem(
        {
          previousItemRequestDto: { PlaylistItemId: playlistItemId },
        },
        options,
      );
    },
    ready: async (request) => {
      await sync.syncPlayReady({ readyRequestDto: request }, options);
    },
    buffering: async (request) => {
      await sync.syncPlayBuffering({ bufferRequestDto: request }, options);
    },
  };
};
