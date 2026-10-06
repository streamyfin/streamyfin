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
import { AppState } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { useSettings } from "@/utils/atoms/settings";
import { isSyncPlayAvailable } from "@/utils/syncplay/availability";
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
  /** This device can play in a group at all. Entry points hide without it. */
  available: boolean;
  /** The account is allowed to use SyncPlay. */
  supported: boolean;
  canCreate: boolean;
  refreshGroups(): Promise<void>;
  createGroup(name: string): Promise<void>;
  joinGroup(groupId: string): Promise<void>;
  /** The user's own decision, and final. */
  leaveGroup(): Promise<void>;
  /** The app cannot follow the group right now. Rejoined on return. */
  suspendGroup(): Promise<void>;
  /** The player was closed: still a member, no longer watching. */
  stopWatching(): Promise<void>;
  /** Open the group's playback again, wherever it is by now. */
  startWatching(): Promise<void>;
  /** Leave the current group for another one. */
  switchGroup(groupId: string): Promise<void>;
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
  available: false,
  supported: false,
  canCreate: false,
  refreshGroups: noAction,
  createGroup: noAction,
  joinGroup: noAction,
  leaveGroup: noAction,
  suspendGroup: noAction,
  stopWatching: noAction,
  startWatching: noAction,
  switchGroup: noAction,
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
  const { settings } = useSettings();
  const [snapshot, setSnapshot] = useState(initialSyncPlaySnapshot);
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
  // No controller where no player can follow a group: the context stays at
  // its inert default and every entry point hides itself on `available`.
  const controller = useMemo(
    () =>
      api && isSyncPlayAvailable()
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
  // A group left because the app went away (background, closed PiP window,
  // lost socket) is taken up again once the app is in front and connected.
  // The socket closes in the background, so the two arrive in either order.
  useEffect(() => {
    if (!controller) return;
    const resume = () => {
      if (AppState.currentState === "active") void controller.resumeGroup();
    };
    if (isConnected) resume();
    const subscription = AppState.addEventListener("change", resume);
    return () => subscription.remove();
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

  const switchGroup = useCallback(
    async (groupId: string) => {
      if (!controller) return;
      await controller.leaveGroup();
      await controller.joinGroup(groupId);
    },
    [controller],
  );

  // The server keeps ignore wait per session and forgets it with the
  // membership, so the user's preference is applied again at every join.
  const groupId = snapshot.group?.GroupId;
  const ignoreWaitByDefault = settings.syncPlayIgnoreWait;
  useEffect(() => {
    if (controller && groupId && ignoreWaitByDefault)
      void controller.setIgnoreWait(true).catch(() => {});
  }, [controller, groupId, ignoreWaitByDefault]);

  const value = useMemo<SyncPlayContextValue>(
    () =>
      controller
        ? {
            ...snapshot,
            enabled: !!snapshot.group,
            available: true,
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
            suspendGroup: controller.suspendGroup,
            stopWatching: controller.stopWatching,
            startWatching: controller.startWatching,
            switchGroup,
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
      resolveVideos,
      switchGroup,
    ],
  );

  return (
    <SyncPlayContext.Provider value={value}>
      {children}
    </SyncPlayContext.Provider>
  );
}

export const useSyncPlay = () => useContext(SyncPlayContext);
