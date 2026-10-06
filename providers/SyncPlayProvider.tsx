import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import {
  initialSyncPlaySnapshot,
  SyncPlayController,
} from "@/utils/syncplay/controller";
import { createSyncPlayTransport } from "@/utils/syncplay/transport";
import type {
  SyncPlayGroup,
  SyncPlayLauncher,
  SyncPlayPlayerAdapter,
  SyncPlayQueueMode,
  SyncPlayRepeatMode,
  SyncPlayShuffleMode,
  SyncPlaySnapshot,
} from "@/utils/syncplay/types";

export type {
  SyncPlayGroup,
  SyncPlayLauncher,
  SyncPlayLaunchRequest,
  SyncPlayPlayerAdapter,
  SyncPlayPlayerState,
} from "@/utils/syncplay/types";

interface SyncPlayContextValue extends SyncPlaySnapshot {
  enabled: boolean;
  supported: boolean;
  canCreate: boolean;
  refreshGroups(): Promise<void>;
  createGroup(name: string): Promise<void>;
  joinGroup(groupId: string): Promise<void>;
  leaveGroup(): Promise<void>;
  clearError(): void;
  getGroup(groupId: string): Promise<SyncPlayGroup | undefined>;
  queueItems(ids: string[], mode?: SyncPlayQueueMode): Promise<void>;
  removePlaylistItems(ids: string[]): Promise<void>;
  clearPlaylist(clearPlayingItem?: boolean): Promise<void>;
  movePlaylistItem(id: string, newIndex: number): Promise<void>;
  requestPlaylistItem(id: string): Promise<void>;
  setRepeatMode(mode: SyncPlayRepeatMode): Promise<void>;
  setShuffleMode(mode: SyncPlayShuffleMode): Promise<void>;
  setIgnoreWait(ignore: boolean): Promise<void>;
  listVideos(searchTerm?: string): Promise<BaseItemDto[]>;
  resolveVideos(ids: string[]): Promise<BaseItemDto[]>;
  playItems(
    ids: string[],
    index?: number,
    startPositionTicks?: number,
  ): Promise<void>;
  requestPause(): Promise<void>;
  requestUnpause(): Promise<void>;
  requestSeek(positionTicks: number): Promise<void>;
  requestStop(): Promise<void>;
  requestNext(): Promise<void>;
  requestPrevious(): Promise<void>;
  registerLauncher(launcher: SyncPlayLauncher): () => void;
  registerPlayer(player: SyncPlayPlayerAdapter): () => void;
  notifyReady(): void;
  notifyBuffering(buffering: boolean): void;
  notifyProgress(): void;
  notifyEnded(playlistItemId?: string): void;
}

const noAction = async () => {};
const noNotification = () => {};
const defaultContext: SyncPlayContextValue = {
  ...initialSyncPlaySnapshot(),
  enabled: false,
  supported: false,
  canCreate: false,
  refreshGroups: noAction,
  createGroup: noAction,
  joinGroup: noAction,
  leaveGroup: noAction,
  clearError: noNotification,
  getGroup: async () => undefined,
  queueItems: noAction,
  removePlaylistItems: noAction,
  clearPlaylist: noAction,
  movePlaylistItem: noAction,
  requestPlaylistItem: noAction,
  setRepeatMode: noAction,
  setShuffleMode: noAction,
  setIgnoreWait: noAction,
  listVideos: async () => [],
  resolveVideos: async () => [],
  playItems: noAction,
  requestPause: noAction,
  requestUnpause: noAction,
  requestSeek: noAction,
  requestStop: noAction,
  requestNext: noAction,
  requestPrevious: noAction,
  registerLauncher: () => noNotification,
  registerPlayer: () => noNotification,
  notifyReady: noNotification,
  notifyBuffering: noNotification,
  notifyProgress: noNotification,
  notifyEnded: noNotification,
};
const SyncPlayContext = createContext<SyncPlayContextValue>(defaultContext);

/** Mount below WebSocketProvider and above every player/provider. */
export function SyncPlayProvider({ children }: { children: ReactNode }) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { isConnected, subscribe } = useWebSocketContext();
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState(initialSyncPlaySnapshot);
  const listVideos = useCallback(
    async (searchTerm?: string) => {
      if (!api || !user?.Id) return [];
      return (
        (
          await getItemsApi(api).getItems({
            userId: user.Id,
            recursive: true,
            includeItemTypes: ["Movie", "Episode", "Video"],
            excludeLocationTypes: ["Virtual"],
            searchTerm: searchTerm?.trim() || undefined,
            limit: 30,
            sortBy: ["SortName"],
          })
        ).data.Items ?? []
      );
    },
    [api, user?.Id],
  );
  const resolveVideos = useCallback(
    async (ids: string[]) => {
      if (!api || !user?.Id || ids.length === 0) return [];
      return (
        (
          await getItemsApi(api).getItems({
            userId: user.Id,
            ids: [...new Set(ids)],
          })
        ).data.Items ?? []
      );
    },
    [api, user?.Id],
  );
  const controller = useMemo(
    () =>
      api
        ? new SyncPlayController(createSyncPlayTransport(api), setSnapshot)
        : null,
    [api],
  );

  useEffect(() => {
    setSnapshot(controller?.getSnapshot() ?? initialSyncPlaySnapshot());
    return () => controller?.dispose();
  }, [controller]);
  useEffect(() => {
    controller?.setConnected(isConnected);
  }, [controller, isConnected]);
  useEffect(() => {
    if (!controller) return;
    const offGroup = subscribe(
      "SyncPlayGroupUpdate",
      controller.handleGroupUpdate,
    );
    const offCommand = subscribe("SyncPlayCommand", controller.handleCommand);
    return () => {
      offGroup();
      offCommand();
    };
  }, [controller, subscribe]);

  const value = useMemo<SyncPlayContextValue>(
    () =>
      controller
        ? {
            ...snapshot,
            enabled: !!snapshot.group,
            supported: !!api && user?.Policy?.SyncPlayAccess !== "None",
            canCreate:
              !!api &&
              user?.Policy?.SyncPlayAccess !== "None" &&
              user?.Policy?.SyncPlayAccess !== "JoinGroups",
            error: snapshot.error
              ? t(`syncplay.errors.${snapshot.error}`)
              : null,
            refreshGroups: controller.refreshGroups,
            createGroup: controller.createGroup,
            joinGroup: controller.joinGroup,
            leaveGroup: controller.leaveGroup,
            clearError: controller.clearError,
            getGroup: controller.getGroup,
            queueItems: controller.queueItems,
            removePlaylistItems: controller.removePlaylistItems,
            clearPlaylist: controller.clearPlaylist,
            movePlaylistItem: controller.movePlaylistItem,
            requestPlaylistItem: controller.requestPlaylistItem,
            setRepeatMode: controller.setRepeatMode,
            setShuffleMode: controller.setShuffleMode,
            setIgnoreWait: controller.setIgnoreWait,
            listVideos,
            resolveVideos,
            playItems: controller.playItems,
            requestPause: controller.requestPause,
            requestUnpause: controller.requestUnpause,
            requestSeek: controller.requestSeek,
            requestStop: controller.requestStop,
            requestNext: controller.requestNext,
            requestPrevious: controller.requestPrevious,
            registerLauncher: controller.registerLauncher,
            registerPlayer: controller.registerPlayer,
            notifyReady: controller.notifyReady,
            notifyBuffering: controller.notifyBuffering,
            notifyProgress: controller.notifyProgress,
            notifyEnded: controller.notifyEnded,
          }
        : defaultContext,
    [
      api,
      controller,
      snapshot,
      t,
      user?.Policy?.SyncPlayAccess,
      listVideos,
      resolveVideos,
    ],
  );

  return (
    <SyncPlayContext.Provider value={value}>
      {children}
    </SyncPlayContext.Provider>
  );
}

export const useSyncPlay = () => useContext(SyncPlayContext);
