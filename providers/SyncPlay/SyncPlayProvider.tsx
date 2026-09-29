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
import { AppState, type AppStateStatus } from "react-native";
import { toast } from "sonner-native";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useKeepWebSocketAlive } from "@/hooks/useKeepWebSocketAlive";
import i18n from "@/i18n";
import { getDownloadedItemById } from "@/providers/Downloads";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import type { Controller as SyncPlayController } from "./Controller";
import { SyncPlayManager } from "./Manager";
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

  controller: SyncPlayController | null;

  setPlayerControls: (controls: PlayerControls | null) => void;
  notifyReady: () => void;
  notifyBuffering: (isBuffering: boolean) => void;
  notifyPlaybackStart: () => void;

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
  const router = useAppRouter();
  const { isConnected: isWsConnected } = useWebSocketContext();

  const [manager, setManager] = useState<SyncPlayManager | null>(null);
  const isNavigatingToPlayerRef = useRef(false);

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

  // Latch: `true` once we've fired the per-attach `playbackstart` event.
  const playbackStartFiredRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Navigation to the player screen
  // ---------------------------------------------------------------------------

  /*
   * Single navigate-to-direct-player helper, used by every code path
   * that needs to (re-)open the player while in a SyncPlay group:
   *  - localPlay (group's leader started a new queue / we just joined)
   *  - localSetCurrentPlaylistItem (group advanced to next episode)
   *  - resumeGroupPlayback (user tapped "Resume playback" in the menu)
   *
   * Both jellyfin-web's playbackManager.play and its setCurrentPlaylistItem
   * collapse to "point the player at this item / position" — RN is the
   * same shape, just a router navigation instead of an in-page DOM swap.
   *
   * Note: no "joining playback" toast here — the `GroupJoined`
   * WebSocket event already triggers a "Joined group" toast via
   * `Manager.ts`, and showing both on a fresh join was redundant.
   */
  const navigateToPlayer = useCallback(
    (itemId: string, startPositionTicks: number) => {
      if (isNavigatingToPlayerRef.current) {
        console.debug("SyncPlay: already navigating to player");
        return;
      }
      isNavigatingToPlayerRef.current = true;

      // Opportunistic local playback: if we have a downloaded copy of
      // the target item, use it instead of streaming. Matters most when
      // the group advances to an episode you've downloaded — the local
      // file starts instantly and survives spotty wifi. SyncPlay's
      // position/pause/seek commands keep flowing normally; only the
      // source changes.
      const isDownloaded = !!getDownloadedItemById(itemId);
      const queryParams = new URLSearchParams({
        itemId,
        playbackPosition: String(startPositionTicks),
        syncPlay: "true",
        ...(isDownloaded && { offline: "true" }),
      }).toString();
      // Use `replace` when we're already on the player screen so queue
      // advances don't stack a second player on the nav stack; `push`
      // otherwise so the user can back out to where they came from.
      const onPlayerScreen =
        pathnameRef.current?.startsWith("/player/direct-player") ?? false;
      if (onPlayerScreen) {
        router.replace(`/player/direct-player?${queryParams}`);
      } else {
        router.push(`/player/direct-player?${queryParams}`);
      }

      setTimeout(() => {
        isNavigatingToPlayerRef.current = false;
      }, 2000);
    },
    [router],
  );

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
      navigateToPlayer(itemId, options.startPositionTicks ?? 0);
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
      navigateToPlayer(itemId, queueCore.getStartPositionTicks());
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

    // group-state-change → on "Waiting", pause locally so we don't drift
    // ahead of the group while the server is reconciling buffering/seek
    // state. Position resync is *only* done from the explicit Pause /
    // Unpause / Seek SendCommands that follow (`PlaybackCore.applyCommand`
    // → `scheduleUnpause` etc.) — those commands carry the canonical
    // `PositionTicks` for the action's `When`. The old code here also
    // called `wrapper.localSeek(lastCommand.PositionTicks)`, but
    // `lastCommand` is the *previous* Pause/Unpause and can be many
    // seconds stale, so it rewound the user every time someone else
    // buffered. Don't put a seek back here.
    mgr.on("group-state-change", (...args: unknown[]) => {
      const state = args[0] as string | undefined;
      const reason = args[2] as string | undefined;
      const wrapper = mgr.getPlayerWrapper();
      if (!wrapper.isPlaybackActive()) return;
      if (state === "Waiting") {
        wrapper.localPause();
      }

      // Drive the persistent OSD overlay from (state, reason).
      // Mirrors jellyfin-web's `group-state-update` → `showIcon` mapping.
      if (state === "Waiting") {
        if (reason === "Buffer") showOsd("buffering");
        else if (reason === "Unpause") showOsd("wait-unpause");
        else if (reason === "Pause") showOsd("wait-pause");
        else if (reason === "Seek") showOsd("seek");
      } else if (state === "Playing" || state === "Paused") {
        // Stable state — clear any persistent overlay; transient flashes
        // come from the `osd` event below and self-expire.
        setOsdAction((cur) => {
          if (
            cur === "schedule-play" ||
            cur === "buffering" ||
            cur === "wait-pause" ||
            cur === "wait-unpause"
          ) {
            return null;
          }
          return cur;
        });
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
      mgr.destroy();
      setManager(null);
    };
  }, [api, navigateToPlayer]);

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
      index >= 0 ? (queueCore.getPlaylist()[index]?.Id ?? null) : null;
    if (!itemId) {
      console.warn("SyncPlay: resumeGroupPlayback — no current group item");
      return;
    }
    navigateToPlayer(itemId, queueCore.getStartPositionTicks());
  }, [api, manager, navigateToPlayer]);

  // ---------------------------------------------------------------------------
  // App foreground re-join (idempotent; gets us a fresh GroupJoined snapshot)
  // ---------------------------------------------------------------------------

  const lastGroupIdRef = useRef<string | null>(null);
  useEffect(() => {
    lastGroupIdRef.current = groupInfo?.GroupId ?? null;
  }, [groupInfo?.GroupId]);

  // Track whether the WebSocket got torn down while the app was
  // backgrounded. If it survived (keep-alive worked), the server
  // still has us in the group and we must NOT call JoinGroup again —
  // doing so would trigger a redundant "X joined the group" broadcast
  // to every other member every time we briefly leave the app.
  const wsClosedWhileBackgroundedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    if (!isWsConnected && appStateRef.current !== "active") {
      wsClosedWhileBackgroundedRef.current = true;
    }
  }, [isWsConnected]);

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

      // Happy path: keep-alive held the socket open across the
      // suspend. Server still considers us a member — nothing to do.
      if (!wsClosedWhileBackgroundedRef.current) {
        console.log(
          "SyncPlay: app foregrounded with WS still alive, skipping rejoin",
        );
        return;
      }
      wsClosedWhileBackgroundedRef.current = false;

      // Small delay so the WebSocket has a moment to reconnect.
      setTimeout(() => {
        console.log(
          `SyncPlay: app foregrounded after WS drop, rejoining group ${groupId}`,
        );
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
      resumeGroupPlayback,
      controller: manager?.getController() ?? null,
      setPlayerControls,
      notifyReady,
      notifyBuffering,
      notifyPlaybackStart,
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
      manager,
      setPlayerControls,
      notifyReady,
      notifyBuffering,
      notifyPlaybackStart,
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
