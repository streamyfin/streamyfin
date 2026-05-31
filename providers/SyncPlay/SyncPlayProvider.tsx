/**
 * SyncPlayProvider
 *
 * React context provider for SyncPlay functionality.
 * Manages the SyncPlay manager and exposes hooks for components.
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
import { SyncPlayController } from "./Controller";
import { ticksToMs } from "./Helper";
import { SyncPlayManager } from "./Manager";
import { PlaybackCore } from "./PlaybackCore";
import { QueueCore } from "./QueueCore";
import type {
  GroupInfoDto,
  PlayerControls,
  PlayQueueUpdate,
  SendCommand,
  SyncPlayOsdAction,
  SyncPlayStats,
} from "./types";
import { useSyncPlayWebSocket } from "./useSyncPlayWebSocket";

// ============================================================================
// Context Types
// ============================================================================

interface SyncPlayContextValue {
  // State
  isEnabled: boolean;
  isReady: boolean;
  groupInfo: GroupInfoDto | null;
  canJoinGroups: boolean;
  canCreateGroups: boolean;

  // Group management
  joinGroup: (groupId: string) => Promise<void>;
  createGroup: (groupName?: string) => Promise<void>;
  leaveGroup: () => Promise<void>;
  getGroups: () => Promise<GroupInfoDto[]>;

  // Playback control delegation
  controller: SyncPlayController | null;

  // Player integration
  setPlayerControls: (controls: PlayerControls | null) => void;
  notifyReady: () => void;
  notifyBuffering: () => void;

  // Stats
  getStats: () => SyncPlayStats;

  // OSD state
  osdAction: SyncPlayOsdAction | null;
  isSyncing: boolean;
  syncMethod: string;
  /** In-flight Unpause/Pause request, before the server has echoed back. */
  pendingPlaybackCommand: "Unpause" | "Pause" | null;
}

const SyncPlayContext = createContext<SyncPlayContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface SyncPlayProviderProps {
  children: ReactNode;
}

export function SyncPlayProvider({ children }: SyncPlayProviderProps) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const router = useAppRouter();

  // Core modules - use state for manager so WebSocket hook re-runs when ready
  const [manager, setManager] = useState<SyncPlayManager | null>(null);
  const playbackCoreRef = useRef<PlaybackCore | null>(null);
  const queueCoreRef = useRef<QueueCore | null>(null);
  const controllerRef = useRef<SyncPlayController | null>(null);

  // Track if we're already on the player page to avoid duplicate navigations
  const isNavigatingToPlayerRef = useRef(false);

  // State
  const [isEnabled, setIsEnabled] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [groupInfo, setGroupInfoDto] = useState<GroupInfoDto | null>(null);
  const [osdAction, setOsdAction] = useState<SyncPlayOsdAction | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMethod, setSyncMethod] = useState("None");
  const [pendingPlaybackCommand, setPendingPlaybackCommand] = useState<
    "Unpause" | "Pause" | null
  >(null);

  // Permission checks
  const canJoinGroups = useMemo(() => {
    const access = user?.Policy?.SyncPlayAccess;
    return access !== "None" && access !== undefined;
  }, [user?.Policy?.SyncPlayAccess]);

  const canCreateGroups = useMemo(() => {
    return user?.Policy?.SyncPlayAccess === "CreateAndJoinGroups";
  }, [user?.Policy?.SyncPlayAccess]);

  // Initialize manager
  useEffect(() => {
    if (!api) return;

    // Create manager and cores
    const manager = new SyncPlayManager(api);
    const playbackCore = new PlaybackCore(api, manager.getTimeSyncCore());
    const queueCore = new QueueCore();
    const controller = new SyncPlayController(api, manager, queueCore);

    setManager(manager);
    playbackCoreRef.current = playbackCore;
    queueCoreRef.current = queueCore;
    controllerRef.current = controller;

    // Wire up manager callbacks
    manager.setPlaybackCommandHandler((command: SendCommand) => {
      playbackCore.applyCommand(command);
    });

    manager.setQueueUpdateHandler((update: PlayQueueUpdate) => {
      queueCore.updatePlayQueue(update);
    });

    manager.setPlaylistItemIdGetter(() => {
      return queueCore.getCurrentPlaylistItemId();
    });

    // When SyncPlay is disabled, flush PlaybackCore's scheduled commands and
    // cached state so we don't carry ghost commands into the next group.
    manager.setDisableHandler(() => {
      playbackCore.reset();
    });

    // Also clear the cached PlayQueue snapshot on disable. If we don't, then
    // when the user later re-joins the same group, the server's first
    // PlayQueue echo (which can carry the same LastUpdate as the snapshot we
    // saw last session) gets dropped by QueueCore's stale-update guard, and
    // the receiver never auto-navigates to the group's content.
    manager.setQueueClearHandler(() => {
      queueCore.clear();
    });

    // Wire up playback core callbacks
    playbackCore.setPlaylistItemIdGetter(() => {
      return queueCore.getCurrentPlaylistItemId();
    });

    playbackCore.setOsdHandler((action) => {
      setOsdAction(action);
      // Clear after display
      setTimeout(() => setOsdAction(null), 1500);
    });

    // Wire up queue core
    queueCore.setTicksEstimator((ticks, when) => {
      return playbackCore.estimateCurrentTicks(ticks, when);
    });

    // Navigate to player when group starts playing new content
    queueCore.setStartPlaybackHandler(async () => {
      const itemId = queueCore.getCurrentItemId();
      const startPositionTicks = queueCore.getStartPositionTicks();

      if (!itemId) {
        console.warn("SyncPlay: new playlist but no current item ID");
        return;
      }

      // Avoid duplicate navigations
      if (isNavigatingToPlayerRef.current) {
        console.debug("SyncPlay: already navigating to player");
        return;
      }

      console.log("SyncPlay: navigating to player for item", itemId);
      isNavigatingToPlayerRef.current = true;

      // Mirror jellyfin-web's `QueueCore.startPlayback` ordering:
      //   1. followGroupPlayback (IgnoreWait:false)            — tell server we follow
      //   2. scheduleReadyRequestOnPlaybackStart                — arm initial pause
      //   3. playerWrapper.localPlay (== our router navigation) — start loading
      // The arm-then-navigate order matters: scheduling must happen BEFORE
      // navigation so the flag is set when the player attaches and fires
      // its first `notifyReady`. Otherwise we race the player and the
      // initial SyncPlayReady reports `IsPlaying:true`, defeating the
      // server's "hold the group until everyone is parked" semantics.
      await manager.followGroupPlayback();
      playbackCore.scheduleReadyRequestOnPlaybackStart();

      // Show toast notification
      toast(i18n.t("syncplay.joining_playback"));

      // Navigate to the player with the item. Use `replace` so repeated
      // queue updates don't stack player screens on the history.
      const queryParams = new URLSearchParams({
        itemId: itemId,
        playbackPosition: startPositionTicks.toString(),
        syncPlay: "true", // Mark this as a SyncPlay-initiated playback
      }).toString();

      router.push(`/player/direct-player?${queryParams}` as any);

      // Reset navigation flag after a short delay
      setTimeout(() => {
        isNavigatingToPlayerRef.current = false;
      }, 2000);
    });

    // Also handle item changes (next/previous in playlist)
    queueCore.on("item-change", () => {
      const newItemId = queueCore.getCurrentItemId();
      const startPositionTicks = queueCore.getStartPositionTicks();

      if (!newItemId) {
        console.warn("SyncPlay: item change but no current item ID");
        return;
      }

      // Avoid duplicate navigations
      if (isNavigatingToPlayerRef.current) {
        return;
      }

      console.log("SyncPlay: item changed, navigating to", newItemId);
      isNavigatingToPlayerRef.current = true;

      // Same pause-before-ready dance as NewPlaylist — the new item's
      // player needs to park at the start position and report
      // IsPlaying:false so the server holds the group until everyone is
      // ready for the next Unpause. Mirrors jellyfin-web's
      // `QueueCore.setCurrentPlaylistItem`.
      playbackCore.scheduleReadyRequestOnPlaybackStart();

      const queryParams = new URLSearchParams({
        itemId: newItemId,
        playbackPosition: startPositionTicks.toString(),
        syncPlay: "true",
      }).toString();

      router.push(`/player/direct-player?${queryParams}`);

      setTimeout(() => {
        isNavigatingToPlayerRef.current = false;
      }, 2000);
    });

    // Handle seek events from other devices - pause first, then seek (like Jellyfin-web)
    queueCore.on("seek", (...args: unknown[]) => {
      const positionTicks = args[0] as number;
      const positionMs = ticksToMs(positionTicks);
      console.log(
        "SyncPlay: seek event received, pausing then seeking to",
        positionMs,
        "ms",
      );
      const playerControls = manager.getPlayerControls();
      if (playerControls) {
        playerControls.pause();
        playerControls.seekTo(positionMs);
      }
    });

    // Subscribe to manager events
    manager.on("enabled", (...args: unknown[]) => {
      const enabled = args[0] as boolean;
      setIsEnabled(enabled);
      if (!enabled) {
        setIsReady(false);
        setGroupInfoDto(null);
      }
    });

    manager.on("syncing", (...args: unknown[]) => {
      const syncing = args[0] as boolean;
      const method = args[1] as string;
      setIsSyncing(syncing);
      setSyncMethod(method);
    });

    // Keep React-side groupInfo in sync with Manager mutations. Without this,
    // CenterControls' `groupInfo.State === 'Waiting'` check is stale because
    // Manager mutates the existing object reference rather than emitting a
    // fresh one.
    manager.on("group-info-change", (...args: unknown[]) => {
      setGroupInfoDto(args[0] as GroupInfoDto);
    });

    // Expose pending Unpause/Pause to consumers (e.g. CenterControls renders
    // a spinner instead of the play/pause button while a request is in
    // flight — mirrors jellyfin-web's "schedule-play" indicator).
    manager.on("pending-playback-change", (...args: unknown[]) => {
      setPendingPlaybackCommand(args[0] as "Unpause" | "Pause" | null);
    });

    // When entering Waiting state, report ready through PlaybackCore
    manager.on("waiting-for-ready", () => {
      console.log(
        "SyncPlay: waiting-for-ready event, calling PlaybackCore.onReady()",
      );
      playbackCore.onReady();
    });

    // Handle seek from StateUpdate (when SyncPlayCommand doesn't include seek)
    manager.on("seek-from-state-update", (...args: unknown[]) => {
      const positionTicks = args[0] as number;
      const positionMs = ticksToMs(positionTicks);
      console.log(
        "SyncPlay: seek from StateUpdate, seeking to",
        positionMs,
        "ms",
      );
      const playerControls = manager.getPlayerControls();
      if (playerControls) {
        playerControls.pause();
        playerControls.seekTo(positionMs);
      }
    });

    // Initialize
    manager.init();

    return () => {
      manager.destroy();
      playbackCore.destroy();
      queueCore.destroy();
      setManager(null);
      playbackCoreRef.current = null;
      queueCoreRef.current = null;
      controllerRef.current = null;
    };
  }, [api]);

  // Update group info when enabled
  useEffect(() => {
    if (isEnabled && manager) {
      setGroupInfoDto(manager.getGroupInfo());
      setIsReady(manager.isSyncPlayReady());
    }
  }, [isEnabled, manager]);

  // Connect to WebSocket messages - manager is now state so hook re-runs when ready
  useSyncPlayWebSocket(manager);

  // ============================================================================
  // Group Management
  // ============================================================================

  const getGroups = useCallback(async (): Promise<GroupInfoDto[]> => {
    if (!api) return [];

    try {
      const syncPlayApi = getSyncPlayApi(api);
      const response = await syncPlayApi.syncPlayGetGroups();
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
        const syncPlayApi = getSyncPlayApi(api);
        await syncPlayApi.syncPlayJoinGroup({
          joinGroupRequestDto: {
            GroupId: groupId,
          },
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
        const syncPlayApi = getSyncPlayApi(api);
        await syncPlayApi.syncPlayCreateGroup({
          newGroupRequestDto: {
            GroupName: name,
          },
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
      const syncPlayApi = getSyncPlayApi(api);
      await syncPlayApi.syncPlayLeaveGroup();
    } catch (error) {
      console.error("SyncPlay: failed to leave group", error);
      throw error;
    }
  }, [api]);

  // Re-join the SyncPlay group when the app returns from background.
  //
  // Backgrounding tears down our WebSocket (see WebSocketProvider) and the
  // server may drop us from the group after its inactivity timeout. Even
  // when it doesn't, we likely missed any commands/state-updates broadcast
  // while we were suspended. Re-issuing the join is idempotent on the
  // server and gets us a fresh GroupJoined snapshot.
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

      // Give the WebSocket a moment to reconnect (handled by
      // WebSocketProvider on the same 'active' transition) so the
      // server's GroupJoined broadcast actually reaches us.
      setTimeout(() => {
        console.log(`SyncPlay: app foregrounded, rejoining group ${groupId}`);
        getSyncPlayApi(api)
          .syncPlayJoinGroup({ joinGroupRequestDto: { GroupId: groupId } })
          .catch((error) => {
            console.error("SyncPlay: failed to rejoin group", error);
          });
      }, 1000);
    });

    return () => {
      subscription.remove();
    };
  }, [api]);

  // ============================================================================
  // Player Integration
  // ============================================================================

  const setPlayerControls = useCallback(
    (controls: PlayerControls | null) => {
      manager?.setPlayerControls(controls);
      playbackCoreRef.current?.setPlayerControls(controls);
    },
    [manager],
  );

  const notifyReady = useCallback(() => {
    console.log("SyncPlay: notifyReady called");
    playbackCoreRef.current?.onReady();
  }, []);

  const notifyBuffering = useCallback(() => {
    console.log("SyncPlay: notifyBuffering called");
    playbackCoreRef.current?.onBuffering();
  }, []);

  // ============================================================================
  // Stats
  // ============================================================================

  const getStats = useCallback((): SyncPlayStats => {
    return (
      manager?.getStats() ?? {
        timeSyncDevice: "None",
        timeSyncOffset: "0.00",
        playbackDiff: "0.00",
        syncMethod: "None",
      }
    );
  }, [manager]);

  // ============================================================================
  // Context Value
  // ============================================================================

  const contextValue: SyncPlayContextValue = useMemo(
    () => ({
      isEnabled,
      isReady,
      groupInfo,
      canJoinGroups,
      canCreateGroups,
      joinGroup,
      createGroup,
      leaveGroup,
      getGroups,
      controller: controllerRef.current,
      setPlayerControls,
      notifyReady,
      notifyBuffering,
      getStats,
      osdAction,
      isSyncing,
      syncMethod,
      pendingPlaybackCommand,
    }),
    [
      isEnabled,
      isReady,
      groupInfo,
      canJoinGroups,
      canCreateGroups,
      joinGroup,
      createGroup,
      leaveGroup,
      getGroups,
      setPlayerControls,
      notifyReady,
      notifyBuffering,
      getStats,
      osdAction,
      isSyncing,
      syncMethod,
      pendingPlaybackCommand,
    ],
  );

  return (
    <SyncPlayContext.Provider value={contextValue}>
      {children}
    </SyncPlayContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to access SyncPlay state and actions
 */
export function useSyncPlay(): SyncPlayContextValue {
  const context = useContext(SyncPlayContext);
  if (!context) {
    throw new Error("useSyncPlay must be used within a SyncPlayProvider");
  }
  return context;
}

/**
 * Hook to access the SyncPlay controller
 */
export function useSyncPlayController(): SyncPlayController | null {
  const { controller } = useSyncPlay();
  return controller;
}
