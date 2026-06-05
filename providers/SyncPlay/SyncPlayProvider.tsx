/**
 * SyncPlayProvider — React glue around `SyncPlayManager`.
 *
 * Responsibilities:
 *  - Manager lifecycle (construct on api change, destroy on unmount)
 *  - React mirrors of manager state (`isEnabled`, `groupInfo`,
 *    `pendingPlaybackCommand`) so components re-render
 *  - Navigation handlers wired into `PlayerWrapper.localPlay` /
 *    `localSetCurrentPlaylistItem` — these are what jellyfin-web does
 *    synchronously via `playbackManager.play`; on RN they navigate
 *    to the player screen instead
 *  - AppState foreground re-join (we may miss broadcasts while
 *    suspended)
 *
 * External API surface (`useSyncPlay`) is stable; components don't
 * change when the internals do.
 */

import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { toast } from "sonner-native";
import { useAppRouter } from "@/hooks/useAppRouter";
import i18n from "@/i18n";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type { Controller as SyncPlayController } from "./Controller";
import { ticksToMs } from "./constants";
import { SyncPlayManager } from "./Manager";
import { useSyncPlayWebSocket } from "./transport/useSyncPlayWebSocket";
import type { GroupInfoDto, PlayerControls } from "./types";

interface SyncPlayContextValue {
  isEnabled: boolean;
  groupInfo: GroupInfoDto | null;
  canJoinGroups: boolean;
  canCreateGroups: boolean;

  joinGroup: (groupId: string) => Promise<void>;
  createGroup: (groupName?: string) => Promise<void>;
  leaveGroup: () => Promise<void>;
  getGroups: () => Promise<GroupInfoDto[]>;

  controller: SyncPlayController | null;

  setPlayerControls: (controls: PlayerControls | null) => void;
  notifyReady: () => void;
  notifyBuffering: (isBuffering: boolean) => void;
  notifyPlaybackStart: () => void;

  pendingPlaybackCommand: "Unpause" | "Pause" | null;
}

const SyncPlayContext = createContext<SyncPlayContextValue | null>(null);

interface SyncPlayProviderProps {
  children: ReactNode;
}

export function SyncPlayProvider({ children }: SyncPlayProviderProps) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const router = useAppRouter();

  const [manager, setManager] = useState<SyncPlayManager | null>(null);
  const isNavigatingToPlayerRef = useRef(false);

  const [isEnabled, setIsEnabled] = useState(false);
  const [groupInfo, setGroupInfo] = useState<GroupInfoDto | null>(null);
  const [pendingPlaybackCommand, setPendingPlaybackCommand] = useState<
    "Unpause" | "Pause" | null
  >(null);

  const canJoinGroups = useMemo(() => {
    const access = user?.Policy?.SyncPlayAccess;
    return access !== "None" && access !== undefined;
  }, [user?.Policy?.SyncPlayAccess]);

  const canCreateGroups = useMemo(
    () => user?.Policy?.SyncPlayAccess === "CreateAndJoinGroups",
    [user?.Policy?.SyncPlayAccess],
  );

  // Latch: `true` once we've fired the per-attach `playbackstart` event.
  const playbackStartFiredRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Manager lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!api) return;

    const mgr = new SyncPlayManager(api);
    mgr.init();
    setManager(mgr);

    const playerWrapper = mgr.getPlayerWrapper();

    // localPlay → navigate to direct-player with syncPlay=true
    playerWrapper.setLocalPlayHandler((options) => {
      const itemId = options.ids[0];
      if (!itemId) {
        console.warn("SyncPlay: localPlay called with no ids");
        return;
      }
      if (isNavigatingToPlayerRef.current) {
        console.debug("SyncPlay: already navigating to player");
        return;
      }
      isNavigatingToPlayerRef.current = true;

      toast(i18n.t("syncplay.joining_playback"));

      const queryParams = new URLSearchParams({
        itemId,
        playbackPosition: String(options.startPositionTicks ?? 0),
        syncPlay: "true",
      }).toString();
      router.push(`/player/direct-player?${queryParams}`);

      setTimeout(() => {
        isNavigatingToPlayerRef.current = false;
      }, 2000);
    });

    // localSetCurrentPlaylistItem → navigate to the new playlist item
    playerWrapper.setLocalSetCurrentItemHandler((playlistItemId) => {
      if (!playlistItemId) return;
      const queueCore = mgr.getQueueCore();
      const target = queueCore
        .getPlaylist()
        .find((i) => i.PlaylistItemId === playlistItemId);
      const itemId = target?.Id;
      if (!itemId) {
        console.warn(
          "SyncPlay: localSetCurrentPlaylistItem — item not in playlist",
          playlistItemId,
        );
        return;
      }
      if (isNavigatingToPlayerRef.current) return;
      isNavigatingToPlayerRef.current = true;

      const queryParams = new URLSearchParams({
        itemId,
        playbackPosition: String(queueCore.getStartPositionTicks()),
        syncPlay: "true",
      }).toString();
      router.push(`/player/direct-player?${queryParams}`);

      setTimeout(() => {
        isNavigatingToPlayerRef.current = false;
      }, 2000);
    });

    mgr.on("enabled", (...args: unknown[]) => {
      const enabled = args[0] as boolean;
      setIsEnabled(enabled);
      if (!enabled) setGroupInfo(null);
    });

    mgr.on("group-update", (...args: unknown[]) => {
      setGroupInfo((args[0] as GroupInfoDto | null | undefined) ?? null);
    });

    mgr.on("pending-playback-change", (...args: unknown[]) => {
      setPendingPlaybackCommand(args[0] as "Unpause" | "Pause" | null);
    });

    // group-state-change → on "Waiting", park the player at the last
    // broadcast position so it's ready to resume cleanly.
    mgr.on("group-state-change", (...args: unknown[]) => {
      const state = args[0] as string | undefined;
      const wrapper = mgr.getPlayerWrapper();
      if (!wrapper.isPlaybackActive()) return;
      if (state === "Waiting") {
        const lastCommand = mgr.getLastPlaybackCommand();
        wrapper.localPause();
        if (lastCommand?.PositionTicks != null) {
          wrapper.localSeek(lastCommand.PositionTicks);
          console.debug(
            `SyncPlay: paused + seeked to ${ticksToMs(
              lastCommand.PositionTicks,
            )}ms on group-state-change=Waiting`,
          );
        }
      }
    });

    mgr.on("toast", (...args: unknown[]) => {
      const key = args[0] as string;
      const arg = args[1] as string | undefined;
      const message = arg
        ? i18n.t(`syncplay.toasts.${key}`, { user: arg })
        : i18n.t(`syncplay.toasts.${key}`);
      toast(message);
    });

    return () => {
      mgr.destroy();
      setManager(null);
    };
  }, [api, router]);

  // Initial join race: once `enabled` flips true, snapshot the current group.
  useEffect(() => {
    if (isEnabled && manager) {
      setGroupInfo(manager.getGroupInfo());
    }
  }, [isEnabled, manager]);

  // Wire WebSocket messages → manager
  useSyncPlayWebSocket(manager);

  // ---------------------------------------------------------------------------
  // Group management
  // ---------------------------------------------------------------------------

  const getGroups = useCallback(async (): Promise<GroupInfoDto[]> => {
    if (!api) return [];
    try {
      const response = await getSyncPlayApi(api).syncPlayGetGroups();
      return (response.data as unknown as GroupInfoDto[]) ?? [];
    } catch (error) {
      console.error("SyncPlay: failed to get groups", error);
      return [];
    }
  }, [api]);

  const joinGroup = useCallback(
    async (groupId: string): Promise<void> => {
      if (!api) return;
      try {
        await getSyncPlayApi(api).syncPlayJoinGroup({
          joinGroupRequestDto: { GroupId: groupId },
        });
      } catch (error) {
        console.error("SyncPlay: failed to join group", error);
        throw error;
      }
    },
    [api],
  );

  const createGroup = useCallback(
    async (groupName?: string): Promise<void> => {
      if (!api || !user) return;
      const name = groupName || `${user.Name}'s Group`;
      try {
        await getSyncPlayApi(api).syncPlayCreateGroup({
          newGroupRequestDto: { GroupName: name },
        });
      } catch (error) {
        console.error("SyncPlay: failed to create group", error);
        throw error;
      }
    },
    [api, user],
  );

  const leaveGroup = useCallback(async (): Promise<void> => {
    if (!api) return;
    try {
      await getSyncPlayApi(api).syncPlayLeaveGroup();
    } catch (error) {
      console.error("SyncPlay: failed to leave group", error);
      throw error;
    }
  }, [api]);

  // ---------------------------------------------------------------------------
  // App foreground re-join (idempotent; gets us a fresh GroupJoined snapshot)
  // ---------------------------------------------------------------------------

  const lastGroupIdRef = useRef<string | null>(null);
  useEffect(() => {
    lastGroupIdRef.current = groupInfo?.GroupId ?? null;
  }, [groupInfo?.GroupId]);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    if (!api) return;

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const previousAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      const becameActive =
        (previousAppState === "background" ||
          previousAppState === "inactive") &&
        nextAppState === "active";
      if (!becameActive) return;

      const groupId = lastGroupIdRef.current;
      if (!groupId) return;

      // Small delay so the WebSocket has a moment to reconnect.
      setTimeout(() => {
        console.log(`SyncPlay: app foregrounded, rejoining group ${groupId}`);
        getSyncPlayApi(api)
          .syncPlayJoinGroup({ joinGroupRequestDto: { GroupId: groupId } })
          .catch((error) => {
            console.error("SyncPlay: failed to rejoin group", error);
          });
      }, 1000);
    });

    return () => subscription.remove();
  }, [api]);

  // ---------------------------------------------------------------------------
  // Player attach bridges
  // ---------------------------------------------------------------------------

  const setPlayerControls = useCallback(
    (controls: PlayerControls | null) => {
      // Reset the playbackstart latch on each new attach.
      playbackStartFiredRef.current = false;
      manager?.setPlayerControls(controls);
    },
    [manager],
  );

  const notifyReady = useCallback(() => {
    manager?.notifyReady();
  }, [manager]);

  const notifyBuffering = useCallback(
    (isBuffering: boolean) => {
      manager?.notifyBuffering(isBuffering);
      if (!isBuffering && !playbackStartFiredRef.current) {
        playbackStartFiredRef.current = true;
        manager?.notifyPlaybackStart();
      }
    },
    [manager],
  );

  const notifyPlaybackStart = useCallback(() => {
    manager?.notifyPlaybackStart();
  }, [manager]);

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------

  const contextValue: SyncPlayContextValue = useMemo(
    () => ({
      isEnabled,
      groupInfo,
      canJoinGroups,
      canCreateGroups,
      joinGroup,
      createGroup,
      leaveGroup,
      getGroups,
      controller: manager?.getController() ?? null,
      setPlayerControls,
      notifyReady,
      notifyBuffering,
      notifyPlaybackStart,
      pendingPlaybackCommand,
    }),
    [
      isEnabled,
      groupInfo,
      canJoinGroups,
      canCreateGroups,
      joinGroup,
      createGroup,
      leaveGroup,
      getGroups,
      manager,
      setPlayerControls,
      notifyReady,
      notifyBuffering,
      notifyPlaybackStart,
      pendingPlaybackCommand,
    ],
  );

  return (
    <SyncPlayContext.Provider value={contextValue}>
      {children}
    </SyncPlayContext.Provider>
  );
}

export function useSyncPlay(): SyncPlayContextValue {
  const context = useContext(SyncPlayContext);
  if (!context) {
    throw new Error("useSyncPlay must be used within a SyncPlayProvider");
  }
  return context;
}
