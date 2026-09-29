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
import { usePathname } from "expo-router";
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
import { toast } from "sonner-native";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useKeepWebSocketAlive } from "@/hooks/useKeepWebSocketAlive";
import i18n from "@/i18n";
import { getDownloadedItemById } from "@/providers/Downloads";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { logAndCaptureError } from "@/utils/log";
import {
  type PlayRequest,
  toDirectPlayerQuery,
} from "@/utils/nativePlayer/playRequest";
import type { Controller as SyncPlayController } from "./Controller";
import { SyncPlayManager } from "./Manager";
import { createGroupRejoin } from "./transport/groupRejoin";
import { useSyncPlayWebSocket } from "./transport/useSyncPlayWebSocket";
import type { GroupInfoDto, PlayerControls, SyncPlayOsdAction } from "./types";

interface SyncPlayContextValue {
  isEnabled: boolean;
  groupInfo: GroupInfoDto | null;
  canJoinGroups: boolean;
  canCreateGroups: boolean;

  joinGroup: (groupId: string) => Promise<void>;
  createGroup: (groupName?: string) => Promise<void>;
  leaveGroup: () => Promise<void>;
  getGroups: () => Promise<GroupInfoDto[]>;

  /**
   * Re-attach to the group's command stream and jump back to the
   * group's currently-playing item. Mirrors jellyfin-web's "Resume
   * playback" menu entry: in jellyfin-web it just calls
   * `playbackManager.play` on the group's current queue position.
   * Here we navigate to direct-player with the same params our
   * `localSetCurrentItem` bridge would use, so the player picks up
   * mid-group with `syncPlay=true` and the right offset.
   */
  resumeGroupPlayback: () => Promise<void>;
  registerPlaybackNavigator: (
    navigator: (request: PlayRequest) => Promise<boolean>,
  ) => () => void;
  registerPlaybackPresentationGuard: (guard: () => Promise<void>) => () => void;

  controller: SyncPlayController | null;

  setPlayerControls: (controls: PlayerControls | null) => void;
  notifyReady: () => void;
  notifyBuffering: (isBuffering: boolean) => void;
  notifyPlaybackStart: () => void;
  notifyPlaybackState: (playing: boolean) => void;
  notifyPlaybackError: (error: unknown) => void;

  pendingPlaybackCommand: "Unpause" | "Pause" | null;
  /**
   * Current SyncPlay OSD overlay state. Drives the animated icon over the
   * video that mirrors jellyfin-web's `#syncPlayIcon`. `null` means hidden.
   */
  osdAction: SyncPlayOsdAction | null;
}

const SyncPlayContext = createContext<SyncPlayContextValue | null>(null);

interface SyncPlayProviderProps {
  children: ReactNode;
}

export function SyncPlayProvider({ children }: SyncPlayProviderProps) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const router = useAppRouter();
  const { ws, isConnected: isWsConnected } = useWebSocketContext();
  const rejoinRef = useRef<ReturnType<typeof createGroupRejoin> | null>(null);

  const [manager, setManager] = useState<SyncPlayManager | null>(null);
  const navigationRequestRef = useRef(0);
  const playbackNavigatorRef = useRef<
    ((request: PlayRequest) => Promise<boolean>) | null
  >(null);
  const presentationGuardRef = useRef<(() => Promise<void>) | null>(null);
  const registerPlaybackPresentationGuard = useCallback(
    (guard: () => Promise<void>) => {
      presentationGuardRef.current = guard;
      return () => {
        if (presentationGuardRef.current === guard)
          presentationGuardRef.current = null;
      };
    },
    [],
  );
  const registerPlaybackNavigator = useCallback(
    (navigator: (request: PlayRequest) => Promise<boolean>) => {
      playbackNavigatorRef.current = navigator;
      return () => {
        if (playbackNavigatorRef.current === navigator) {
          playbackNavigatorRef.current = null;
        }
      };
    },
    [],
  );

  // Keep a live ref of the current route pathname so the
  // navigateToPlayer helper (wired up once inside the manager-lifecycle
  // effect) can read the *current* page without stale-closure issues.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const [isEnabled, setIsEnabled] = useState(false);
  const [groupInfo, setGroupInfo] = useState<GroupInfoDto | null>(null);
  const [pendingPlaybackCommand, setPendingPlaybackCommand] = useState<
    "Unpause" | "Pause" | null
  >(null);

  // While in a SyncPlay group, hold a keep-alive token on the global
  // WebSocket so backgrounding the app does NOT cleanly close the
  // socket. A clean close is interpreted by the Jellyfin server as
  // leaving the group and is broadcast to every other member as
  // "<user> has left the group". Keeping the socket open across a
  // short suspend lets us stay in the group while quickly switching
  // apps; if the OS eventually tears the TCP connection down anyway,
  // the app-foreground rejoin effect below will pull us back in.
  useKeepWebSocketAlive(isEnabled);

  const [osdAction, setOsdAction] = useState<SyncPlayOsdAction | null>(null);
  const osdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Set the OSD overlay action.
   *
   * `transient` mirrors jellyfin-web's `iconVisibilityTime = 1500` for the
   * Unpause / Pause / Seek command-confirmation flashes. Persistent actions
   * (schedule-play, buffering, wait-*) stay until cleared by a state
   * transition or a subsequent call with `null`.
   */
  const showOsd = useCallback(
    (action: SyncPlayOsdAction | null, transient = false) => {
      if (osdTimeoutRef.current) {
        clearTimeout(osdTimeoutRef.current);
        osdTimeoutRef.current = null;
      }
      setOsdAction(action);
      if (transient && action !== null) {
        osdTimeoutRef.current = setTimeout(() => {
          osdTimeoutRef.current = null;
          setOsdAction((cur) => (cur === action ? null : cur));
        }, 1500);
      }
    },
    [],
  );

  // Pending play/pause tap → optimistic schedule-play overlay (unless another
  // overlay reason has already taken precedence).
  useEffect(() => {
    if (pendingPlaybackCommand) {
      setOsdAction((cur) => cur ?? "schedule-play");
    } else {
      setOsdAction((cur) => (cur === "schedule-play" ? null : cur));
    }
  }, [pendingPlaybackCommand]);

  // Clear the OSD auto-expire timeout on unmount.
  useEffect(() => {
    return () => {
      if (osdTimeoutRef.current) {
        clearTimeout(osdTimeoutRef.current);
        osdTimeoutRef.current = null;
      }
    };
  }, []);

  const canJoinGroups = useMemo(() => {
    const access = user?.Policy?.SyncPlayAccess;
    return access !== "None" && access !== undefined;
  }, [user?.Policy?.SyncPlayAccess]);

  const canCreateGroups = useMemo(
    () => user?.Policy?.SyncPlayAccess === "CreateAndJoinGroups",
    [user?.Policy?.SyncPlayAccess],
  );

  // ---------------------------------------------------------------------------
  // Navigation to the player screen
  // ---------------------------------------------------------------------------

  /*
   * Shared native/React player navigation, used by every code path
   * that needs to (re-)open the player while in a SyncPlay group:
   *  - localPlay (group's leader started a new queue / we just joined)
   *  - localSetCurrentPlaylistItem (group advanced to next episode)
   *  - resumeGroupPlayback (user tapped "Resume playback" in the menu)
   *
   * Both jellyfin-web's playbackManager.play and its setCurrentPlaylistItem
   * collapse to "point the player at this item / position" — RN is the
   * same shape, using native presentation or a React route.
   *
   * Note: no "joining playback" toast here — the `GroupJoined`
   * WebSocket event already triggers a "Joined group" toast via
   * `Manager.ts`, and showing both on a fresh join was redundant.
   */
  const navigateToPlayer = useCallback(
    async (itemId: string, startPositionTicks: number) => {
      const requestId = ++navigationRequestRef.current;

      // Opportunistic local playback: if we have a downloaded copy of
      // the target item, use it instead of streaming. Matters most when
      // the group advances to an episode you've downloaded — the local
      // file starts instantly and survives spotty wifi. SyncPlay's
      // position/pause/seek commands keep flowing normally; only the
      // source changes.
      const isDownloaded = !!getDownloadedItemById(itemId);
      const request: PlayRequest = {
        itemId,
        playbackPositionTicks: startPositionTicks,
        syncPlay: true,
        offline: isDownloaded,
      };
      try {
        await presentationGuardRef.current?.();
        if (requestId !== navigationRequestRef.current) return;
        console.debug("SyncPlay: presenting player", {
          itemId,
          nativeNavigator: !!playbackNavigatorRef.current,
        });
        const onPlayerScreen =
          pathnameRef.current?.startsWith("/player/direct-player") ?? false;
        const handled =
          !onPlayerScreen && (await playbackNavigatorRef.current?.(request));
        console.debug("SyncPlay: presentation result", { itemId, handled });
        if (handled || requestId !== navigationRequestRef.current) return;
        const queryParams = toDirectPlayerQuery(request);
        if (onPlayerScreen) {
          router.replace(`/player/direct-player?${queryParams}`);
        } else {
          router.push(`/player/direct-player?${queryParams}`);
        }
      } catch (error) {
        if (requestId !== navigationRequestRef.current) {
          console.debug(
            "SyncPlay: superseded presentation failed; keeping the newer request",
          );
          return;
        }
        logAndCaptureError("SyncPlay player navigation failed", error);
        throw error;
      }
    },
    [router],
  );

  // ---------------------------------------------------------------------------
  // Manager lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!api) return;

    const mgr = new SyncPlayManager(api, () => userRef.current);
    mgr.init();
    setManager(mgr);

    const playerWrapper = mgr.getPlayerWrapper();

    // Server playback chooses native presentation or a syncPlay=true route.
    playerWrapper.setLocalPlayHandler((options) => {
      const itemId = options.ids[options.startIndex];
      if (!itemId) {
        throw new Error(
          `SyncPlay selected index ${options.startIndex} has no item`,
        );
      }
      return navigateToPlayer(itemId, options.startPositionTicks ?? 0);
    });

    // localSetCurrentPlaylistItem → navigate to the new playlist item
    playerWrapper.setLocalSetCurrentItemHandler((playlistItemId) => {
      if (!playlistItemId) return;
      const queueCore = mgr.getQueueCore();
      const target = queueCore
        .getPlaylist()
        .find((i) => i.PlaylistItemId === playlistItemId);
      const itemId = target?.ItemId;
      if (!itemId) {
        console.warn(
          "SyncPlay: localSetCurrentPlaylistItem — item not in playlist",
          playlistItemId,
        );
        return;
      }
      void navigateToPlayer(itemId, queueCore.getStartPositionTicks()).catch(
        (error) => {
          mgr.notifyPlaybackError(error);
        },
      );
    });

    mgr.on("enabled", (...args: unknown[]) => {
      const enabled = args[0] as boolean;
      setIsEnabled(enabled);
      if (!enabled) {
        navigationRequestRef.current++;
        setGroupInfo(null);
        showOsd(null);
      }
    });

    mgr.on("group-update", (...args: unknown[]) => {
      setGroupInfo((args[0] as GroupInfoDto | null | undefined) ?? null);
    });

    mgr.on("pending-playback-change", (...args: unknown[]) => {
      setPendingPlaybackCommand(args[0] as "Unpause" | "Pause" | null);
    });

    // StateUpdate drives presentation only. Transport follows SendCommand,
    // otherwise Waiting/Seek pauses the decoder before its ready handshake.
    mgr.on("group-state-change", (...args: unknown[]) => {
      const state = args[0] as string | undefined;
      const reason = args[2] as string | undefined;
      const wrapper = mgr.getPlayerWrapper();
      if (!wrapper.isPlaybackActive()) return;
      // Drive the persistent OSD overlay from (state, reason).
      // Mirrors jellyfin-web's `group-state-update` → `showIcon` mapping.
      if (state === "Waiting") {
        if (reason === "Buffer") showOsd("buffering");
        else if (reason === "Unpause") showOsd("wait-unpause");
        else if (reason === "Pause") showOsd("wait-pause");
        else if (reason === "Seek") showOsd("seek");
      } else if (
        state === "Playing" &&
        (reason === "Unpause" || reason === "Ready")
      ) {
        showOsd("schedule-play");
      } else if (state === "Paused" && reason === "Pause") {
        showOsd("pause", true);
      } else if (state === "Paused" && reason === "Ready") {
        showOsd(null);
      }
    });

    // PlaybackCore-emitted OSD events. Transient ones auto-expire in 1.5s.
    mgr.on("osd", (...args: unknown[]) => {
      const action = args[0] as SyncPlayOsdAction;
      const transient =
        action === "unpause" || action === "pause" || action === "seek";
      showOsd(action, transient);
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
      navigationRequestRef.current++;
      mgr.destroy();
      rejoinRef.current?.dispose();
      setIsEnabled(false);
      setGroupInfo(null);
      setPendingPlaybackCommand(null);
      showOsd(null);
      setManager(null);
    };
  }, [api, navigateToPlayer, showOsd]);

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
      throw error;
    }
  }, [api]);

  const joinGroup = useCallback(
    async (groupId: string): Promise<void> => {
      if (!api) return;
      rejoinRef.current?.dispose();
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
    rejoinRef.current?.dispose();
    try {
      await getSyncPlayApi(api).syncPlayLeaveGroup();
    } catch (error) {
      console.error("SyncPlay: failed to leave group", error);
      throw error;
    }
  }, [api]);

  /*
   * Resume playback: re-follow the group's command stream and jump
   * the local player to the group's current item + position. This is
   * the only entry point a user needs from the menu — there is no
   * separate "halt" UI; the player exit/back already detaches us.
   */
  const resumeGroupPlayback = useCallback(async (): Promise<void> => {
    if (!api || !manager) return;
    await manager.followGroupPlayback(api);
    const queueCore = manager.getQueueCore();
    const index = queueCore.getCurrentPlaylistIndex();
    const itemId =
      index >= 0 ? (queueCore.getPlaylist()[index]?.ItemId ?? null) : null;
    if (!itemId) {
      console.warn("SyncPlay: resumeGroupPlayback — no current group item");
      return;
    }
    await navigateToPlayer(itemId, queueCore.getStartPositionTicks());
  }, [api, manager, navigateToPlayer]);

  useEffect(() => {
    if (!api) return;
    const tracker = createGroupRejoin((groupId, signal) => {
      return getSyncPlayApi(api).syncPlayJoinGroup(
        { joinGroupRequestDto: { GroupId: groupId } },
        { signal },
      );
    });
    rejoinRef.current = tracker;
    return () => {
      tracker.dispose();
      if (rejoinRef.current === tracker) rejoinRef.current = null;
    };
  }, [api]);

  useEffect(() => {
    rejoinRef.current?.update(
      isEnabled ? (groupInfo?.GroupId ?? null) : null,
      ws,
      isWsConnected && ws?.readyState === WebSocket.OPEN,
    );
  }, [api, isEnabled, groupInfo?.GroupId, ws, isWsConnected]);

  // ---------------------------------------------------------------------------
  // Player attach bridges
  // ---------------------------------------------------------------------------

  const setPlayerControls = useCallback(
    (controls: PlayerControls | null) => {
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
    },
    [manager],
  );

  const notifyPlaybackStart = useCallback(() => {
    manager?.notifyPlaybackStart();
  }, [manager]);

  const notifyPlaybackState = useCallback(
    (playing: boolean) => {
      manager?.notifyPlaybackState(playing);
    },
    [manager],
  );

  const notifyPlaybackError = useCallback(
    (error: unknown) => {
      manager?.notifyPlaybackError(error);
    },
    [manager],
  );

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
      resumeGroupPlayback,
      registerPlaybackNavigator,
      registerPlaybackPresentationGuard,
      controller: manager?.getController() ?? null,
      setPlayerControls,
      notifyReady,
      notifyBuffering,
      notifyPlaybackStart,
      notifyPlaybackState,
      notifyPlaybackError,
      pendingPlaybackCommand,
      osdAction,
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
      resumeGroupPlayback,
      registerPlaybackNavigator,
      registerPlaybackPresentationGuard,
      manager,
      setPlayerControls,
      notifyReady,
      notifyBuffering,
      notifyPlaybackStart,
      notifyPlaybackState,
      notifyPlaybackError,
      pendingPlaybackCommand,
      osdAction,
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
