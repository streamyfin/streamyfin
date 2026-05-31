/**
 * SyncPlay Manager
 *
 * Main orchestrator for SyncPlay functionality.
 * Manages group state, coordinates time sync, playback, and queue.
 *
 * Based on jellyfin-web's Manager.js
 */

import type { Api } from "@jellyfin/sdk";
import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api";
import { toast } from "sonner-native";
import i18n from "@/i18n";
import { EventEmitter, msToTicks } from "./Helper";
import { TimeSyncCore } from "./TimeSyncCore";
import type {
  GroupInfoDto,
  PlayerControls,
  PlayQueueUpdate,
  SendCommand,
  SyncPlayStats,
} from "./types";

/**
 * SyncPlay Manager - Main orchestrator
 */
export class SyncPlayManager extends EventEmitter {
  private api: Api;
  private timeSyncCore: TimeSyncCore;

  // Group state
  private groupInfo: GroupInfoDto | null = null;
  private syncPlayEnabledAt: Date | null = null;
  private syncPlayReady = false;
  private queuedCommand: SendCommand | null = null;
  private followingGroupPlayback = true;
  private lastPlaybackCommand: SendCommand | null = null;

  // Pending play/pause request awaiting server broadcast.
  // Used to (1) ignore duplicate rapid taps and (2) treat the server's
  // upcoming state as the source of truth while a request is in flight.
  private pendingPlaybackCommand: "Unpause" | "Pause" | null = null;
  private pendingPlaybackTimeout: ReturnType<typeof setTimeout> | null = null;
  // Safety: drop the pending guard after this long if no broadcast arrives.
  private static readonly PENDING_PLAYBACK_TIMEOUT_MS = 1500;

  // Player state
  private playerControls: PlayerControls | null = null;
  private syncMethod = "None";

  // Callbacks
  private onPlaybackCoreCommand: ((command: SendCommand) => void) | null = null;
  private onQueueUpdate: ((update: PlayQueueUpdate) => void) | null = null;
  private onGetPlaylistItemId: (() => string | null) | null = null;
  // Fired when SyncPlay is disabled — PlaybackCore wires up here to reset its
  // own scheduled timers / cached command so we don't carry stale state into
  // the next group.
  private onDisable: (() => void) | null = null;
  // Fired when SyncPlay is disabled — QueueCore wires up here to clear its
  // last PlayQueue snapshot. Without this, re-joining the same group later
  // causes the first PlayQueue echo (which can have a `LastUpdate` equal to
  // or older than the snapshot we cached before the disable) to be dropped
  // by the stale-update guard in `QueueCore.updatePlayQueue`.
  private onQueueClear: (() => void) | null = null;

  constructor(api: Api) {
    super();
    this.api = api;
    this.timeSyncCore = new TimeSyncCore(api);

    // Listen for time sync updates
    this.timeSyncCore.onUpdate((error, timeOffset, ping) => {
      if (error) {
        console.debug("SyncPlay Manager: time sync error", error);
        return;
      }

      this.emit("time-sync-update", timeOffset, ping);

      // Report ping to server when enabled
      if (this.isSyncPlayEnabled() && ping !== null) {
        this.sendPing(ping);
      }
    });
  }

  /**
   * Initialize the manager
   */
  init(): void {
    this.timeSyncCore.startPing();
  }

  /**
   * Update the API client
   */
  updateApiClient(api: Api): void {
    this.api = api;
  }

  /**
   * Get the API client
   */
  getApiClient(): Api {
    return this.api;
  }

  /**
   * Get the time sync core
   */
  getTimeSyncCore(): TimeSyncCore {
    return this.timeSyncCore;
  }

  /**
   * Set player controls for playback management
   */
  setPlayerControls(controls: PlayerControls | null): void {
    this.playerControls = controls;

    // When player controls are connected and SyncPlay is active, sync to group state
    if (controls && this.isSyncPlayEnabled() && this.syncPlayReady) {
      const state = this.groupInfo?.State;
      console.log(
        `SyncPlay: player controls connected, group state is ${state}`,
      );

      // CRITICAL: Tell server we're following group playback
      // This ensures the server sends us SyncPlayCommand messages
      this.followGroupPlayback();

      // Reconcile position: if we know the last command and group is playing,
      // estimate where the group is *now* and seek there before resuming. This
      // fixes the case where the player attaches mid-stream and would
      // otherwise resume from 0 or the last-known local position.
      const last = this.lastPlaybackCommand;
      if (
        last &&
        (last.Command === "Unpause" || last.Command === "Pause") &&
        last.When &&
        last.PositionTicks != null
      ) {
        try {
          const commandWhen = new Date(last.When);
          let targetTicks = last.PositionTicks;
          if (last.Command === "Unpause") {
            const remoteNow = this.timeSyncCore.localDateToRemote(new Date());
            targetTicks +=
              (remoteNow.getTime() - commandWhen.getTime()) * 10000;
          }
          const targetMs = Math.max(0, targetTicks / 10000);
          const currentMs = controls.getCurrentPosition();
          if (Math.abs(currentMs - targetMs) > 500) {
            console.log(
              `SyncPlay: player attached — seeking to estimated group position ${targetMs}ms (was ${currentMs}ms)`,
            );
            controls.seekTo(targetMs);
          }
        } catch (error) {
          console.warn(
            "SyncPlay: failed to estimate group position on attach",
            error,
          );
        }
      }

      if (state === "Playing" && !controls.isPlaying()) {
        console.log("SyncPlay: starting playback to match group");
        controls.play();
      } else if (state === "Paused" && controls.isPlaying()) {
        console.log("SyncPlay: pausing to match group");
        controls.pause();
      }
    }
  }

  /**
   * Get current player controls
   */
  getPlayerControls(): PlayerControls | null {
    return this.playerControls;
  }

  /**
   * Set callback for playback commands
   */
  setPlaybackCommandHandler(
    handler: ((command: SendCommand) => void) | null,
  ): void {
    this.onPlaybackCoreCommand = handler;
  }

  /**
   * Set callback for queue updates
   */
  setQueueUpdateHandler(
    handler: ((update: PlayQueueUpdate) => void) | null,
  ): void {
    this.onQueueUpdate = handler;
  }

  /**
   * Set callback for getting current playlist item ID
   */
  setPlaylistItemIdGetter(getter: (() => string | null) | null): void {
    this.onGetPlaylistItemId = getter;
  }

  /**
   * Set a callback invoked when SyncPlay is disabled. PlaybackCore registers
   * here so it can flush scheduled commands and stale state.
   */
  setDisableHandler(handler: (() => void) | null): void {
    this.onDisable = handler;
  }

  /**
   * Set a callback invoked when SyncPlay is disabled. QueueCore registers
   * here so it can drop the cached PlayQueue snapshot and treat the next
   * server update as fresh.
   */
  setQueueClearHandler(handler: (() => void) | null): void {
    this.onQueueClear = handler;
  }

  // ============================================================================
  // Group Management
  // ============================================================================

  /**
   * Check if SyncPlay is enabled (user is in a group)
   */
  isSyncPlayEnabled(): boolean {
    return this.syncPlayEnabledAt !== null;
  }

  /**
   * Check if SyncPlay is ready (time sync complete)
   */
  isSyncPlayReady(): boolean {
    return this.syncPlayReady;
  }

  /**
   * Get current group info
   */
  getGroupInfo(): GroupInfoDto | null {
    return this.groupInfo;
  }

  /**
   * Get the last playback command
   */
  getLastPlaybackCommand(): SendCommand | null {
    return this.lastPlaybackCommand;
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    // First check actual player state
    if (this.playerControls) {
      return this.playerControls.isPlaying();
    }
    // Fall back to group state
    if (this.groupInfo?.State) {
      return this.groupInfo.State === "Playing";
    }
    // Last resort: check last command
    return this.lastPlaybackCommand?.Command === "Unpause";
  }

  /**
   * Effective play state for SyncPlay routing decisions.
   *
   * Prefers (1) a pending in-flight command we just sent, (2) the server's
   * group state, and only falls back to the local player. This avoids the
   * race where a rapid second tap reads the local player (which hasn't
   * applied the scheduled command yet) and sends a duplicate request that
   * either re-broadcasts with a new `When` or flips the group the wrong way.
   */
  getEffectivePlayState(): "Playing" | "Paused" {
    if (this.pendingPlaybackCommand === "Unpause") return "Playing";
    if (this.pendingPlaybackCommand === "Pause") return "Paused";
    if (this.groupInfo?.State === "Playing") return "Playing";
    if (this.groupInfo?.State === "Paused") return "Paused";
    return this.playerControls?.isPlaying() ? "Playing" : "Paused";
  }

  /**
   * Returns the in-flight play/pause request, if any.
   */
  getPendingPlaybackCommand(): "Unpause" | "Pause" | null {
    return this.pendingPlaybackCommand;
  }

  /**
   * Mark a play/pause request as in flight. Auto-clears on a safety timeout
   * in case the server broadcast is missed.
   */
  markPendingPlaybackCommand(command: "Unpause" | "Pause"): void {
    this.pendingPlaybackCommand = command;
    if (this.pendingPlaybackTimeout) {
      clearTimeout(this.pendingPlaybackTimeout);
    }
    this.pendingPlaybackTimeout = setTimeout(() => {
      console.debug(
        "SyncPlay Manager: pending playback command timed out",
        command,
      );
      this.pendingPlaybackCommand = null;
      this.pendingPlaybackTimeout = null;
      this.emit("pending-playback-change", null);
    }, SyncPlayManager.PENDING_PLAYBACK_TIMEOUT_MS);
    this.emit("pending-playback-change", command);
  }

  private clearPendingPlaybackCommand(): void {
    if (this.pendingPlaybackTimeout) {
      clearTimeout(this.pendingPlaybackTimeout);
      this.pendingPlaybackTimeout = null;
    }
    if (this.pendingPlaybackCommand !== null) {
      this.pendingPlaybackCommand = null;
      this.emit("pending-playback-change", null);
    }
  }

  /**
   * Check if following group playback
   */
  isFollowingGroupPlayback(): boolean {
    return this.followingGroupPlayback;
  }

  /**
   * Enable SyncPlay (join a group)
   */
  enableSyncPlay(groupInfo: GroupInfoDto, showMessage = false): void {
    if (this.isSyncPlayEnabled()) {
      if (groupInfo.GroupId === this.groupInfo?.GroupId) {
        console.debug(
          `SyncPlay: group ${this.groupInfo?.GroupId} already joined.`,
        );
        return;
      }
      console.warn(
        `SyncPlay: switching from group ${this.groupInfo?.GroupId} to ${groupInfo.GroupId}`,
      );
      this.disableSyncPlay(false);
    }

    this.groupInfo = groupInfo;
    this.syncPlayEnabledAt = groupInfo.LastUpdatedAt
      ? new Date(groupInfo.LastUpdatedAt)
      : new Date();
    this.followingGroupPlayback = true;
    this.syncPlayReady = false;

    console.log(`SyncPlay: enableSyncPlay - group state is ${groupInfo.State}`);

    this.emit("enabled", true);

    // Wait for time sync to be ready
    const checkReady = () => {
      if (this.timeSyncCore.isReady()) {
        this.syncPlayReady = true;

        // CRITICAL: Tell server we're following group playback
        // This ensures the server sends us SyncPlayCommand messages
        this.followGroupPlayback();

        if (this.queuedCommand) {
          this.processCommand(this.queuedCommand);
          this.queuedCommand = null;
        }

        // Act on initial group state if player is connected
        if (this.playerControls && groupInfo.State) {
          console.log(`SyncPlay: applying initial state ${groupInfo.State}`);
          if (groupInfo.State === "Playing") {
            this.playerControls.play();
          } else if (groupInfo.State === "Paused") {
            this.playerControls.pause();
          }
        }
      } else {
        setTimeout(checkReady, 100);
      }
    };

    this.timeSyncCore.forceUpdate();
    checkReady();

    if (showMessage) {
      toast(i18n.t("syncplay.enabled"));
    }
  }

  /**
   * Disable SyncPlay (leave group)
   */
  disableSyncPlay(showMessage = false): void {
    this.syncPlayEnabledAt = null;
    this.syncPlayReady = false;
    this.followingGroupPlayback = true;
    this.lastPlaybackCommand = null;
    this.queuedCommand = null;
    this.groupInfo = null;
    this.clearPendingPlaybackCommand();

    // Tell PlaybackCore (or whoever subscribed) to flush any scheduled
    // commands / cached state so a future re-enable starts clean.
    try {
      this.onDisable?.();
    } catch (error) {
      console.warn("SyncPlay: onDisable handler threw", error);
    }

    // Drop the cached PlayQueue snapshot so a future re-join doesn't get
    // its first PlayQueue update silently dropped as "older than what we
    // already have".
    try {
      this.onQueueClear?.();
    } catch (error) {
      console.warn("SyncPlay: onQueueClear handler threw", error);
    }

    this.emit("enabled", false);

    if (showMessage) {
      toast(i18n.t("syncplay.disabled"));
    }
  }

  // ============================================================================
  // Server Communication
  // ============================================================================

  /**
   * Send ping to server
   */
  private async sendPing(ping: number): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlayPing({
        pingRequestDto: { Ping: Math.round(ping) },
      });
    } catch (error) {
      console.debug("SyncPlay: failed to send ping", error);
    }
  }

  /**
   * Report that we're ready (not buffering)
   */
  async reportReady(): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      const now = new Date();
      const currentPosition = this.playerControls?.getCurrentPosition() ?? 0;
      const currentPositionTicks = msToTicks(currentPosition);

      console.log(
        "SyncPlay Manager: reporting READY at position",
        currentPositionTicks,
      );

      await syncPlayApi.syncPlayReady({
        readyRequestDto: {
          When: now.toISOString(),
          PositionTicks: currentPositionTicks,
          IsPlaying: this.playerControls?.isPlaying() ?? false,
          PlaylistItemId:
            this.onGetPlaylistItemId?.() ??
            "00000000-0000-0000-0000-000000000000",
        },
      });
      console.log("SyncPlay Manager: READY sent successfully");
    } catch (error) {
      console.error("SyncPlay Manager: failed to report ready", error);
    }
  }

  /**
   * Follow group playback
   */
  async followGroupPlayback(): Promise<void> {
    this.followingGroupPlayback = true;

    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlaySetIgnoreWait({
        ignoreWaitRequestDto: { IgnoreWait: false },
      });
    } catch (error) {
      console.error("SyncPlay: failed to follow group playback", error);
    }
  }

  /**
   * Halt group playback (stop following)
   */
  async haltGroupPlayback(): Promise<void> {
    this.followingGroupPlayback = false;

    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlaySetIgnoreWait({
        ignoreWaitRequestDto: { IgnoreWait: true },
      });

      // Stop local playback
      this.playerControls?.pause();
    } catch (error) {
      console.error("SyncPlay: failed to halt group playback", error);
    }
  }

  // ============================================================================
  // Message Processing
  // ============================================================================

  /**
   * Process a group update from the server
   * Uses generic type to handle all possible update types from server
   */
  processGroupUpdate(update: { Type?: string; Data?: unknown }): void {
    const { Type, Data } = update;

    switch (Type) {
      case "PlayQueue": {
        const playQueueData = Data as PlayQueueUpdate;
        console.log(
          "SyncPlay: received PlayQueue update - position:",
          playQueueData.StartPositionTicks,
          "reason:",
          playQueueData.Reason,
        );
        this.onQueueUpdate?.(playQueueData);
        break;
      }

      case "UserJoined":
        toast(i18n.t("syncplay.user_joined", { username: Data }));
        if (this.groupInfo) {
          if (!this.groupInfo.Participants) {
            this.groupInfo.Participants = [Data as string];
          } else {
            this.groupInfo.Participants.push(Data as string);
          }
        }
        break;

      case "UserLeft":
        toast(i18n.t("syncplay.user_left", { username: Data }));
        if (this.groupInfo?.Participants) {
          this.groupInfo.Participants = this.groupInfo.Participants.filter(
            (user: string) => user !== Data,
          );
        }
        break;

      case "GroupJoined": {
        const groupData = Data as GroupInfoDto;
        this.enableSyncPlay(groupData, true);
        break;
      }

      case "SyncPlayIsDisabled":
        toast(i18n.t("syncplay.permission_required"));
        break;

      case "NotInGroup":
      case "GroupLeft":
        this.disableSyncPlay(true);
        break;

      case "GroupUpdate": {
        const updatedData = Data as GroupInfoDto;
        this.groupInfo = updatedData;
        this.emit("group-info-change", updatedData);
        break;
      }

      case "StateUpdate": {
        // Log full state data to see if position is included
        console.log("SyncPlay: StateUpdate full data:", JSON.stringify(Data));
        const stateData = Data as {
          State: string;
          Reason: string;
          PositionTicks?: number;
        };

        // CRITICAL: Update the stored group state so subsequent checks use the correct value
        if (this.groupInfo) {
          this.groupInfo.State = stateData.State as any;
          // Emit a fresh object so React state subscribers re-render —
          // mutating in place would not trigger re-renders.
          this.emit("group-info-change", { ...this.groupInfo });
        }

        this.emit("group-state-update", stateData.State, stateData.Reason);
        console.log(
          `SyncPlay: state changed to ${stateData.State} because ${stateData.Reason}`,
        );

        // Handle seek from StateUpdate if position is included
        if (stateData.Reason === "Seek" && stateData.PositionTicks != null) {
          console.log(
            "SyncPlay: StateUpdate contains seek position:",
            stateData.PositionTicks,
          );
          this.emit("seek-from-state-update", stateData.PositionTicks);
        }

        // Use StateUpdate as a fallback to control playback when SyncPlayCommand isn't received
        // This ensures we stay in sync even if the server doesn't send commands
        if (this.playerControls) {
          const currentlyPlaying = this.playerControls.isPlaying();
          console.log(
            `SyncPlay: StateUpdate handler - state=${stateData.State}, currentlyPlaying=${currentlyPlaying}`,
          );

          if (stateData.State === "Paused" && currentlyPlaying) {
            console.log("SyncPlay: StateUpdate -> PAUSING player");
            this.playerControls.pause();
          } else if (stateData.State === "Playing" && !currentlyPlaying) {
            console.log("SyncPlay: StateUpdate -> PLAYING");
            this.playerControls.play();
          } else if (stateData.State === "Waiting") {
            console.log("SyncPlay: StateUpdate -> Waiting for other members");
            // Pause player when waiting
            if (currentlyPlaying) {
              this.playerControls.pause();
            }
            // Emit event so PlaybackCore can report ready
            this.emit("waiting-for-ready");
          }
        } else {
          console.warn("SyncPlay: StateUpdate but no playerControls!");
        }
        break;
      }

      case "GroupDoesNotExist":
        toast(i18n.t("syncplay.group_does_not_exist"));
        break;

      case "CreateGroupDenied":
        toast(i18n.t("syncplay.create_denied"));
        break;

      case "JoinGroupDenied":
        toast(i18n.t("syncplay.join_denied"));
        break;

      case "LibraryAccessDenied":
        toast(i18n.t("syncplay.library_access_denied"));
        break;

      default:
        console.warn(`SyncPlay: unrecognized group update type: ${Type}`);
    }
  }

  /**
   * Process a playback command from the server
   */
  processCommand(command: SendCommand): void {
    console.log(`SyncPlay Manager: processCommand called - ${command.Command}`);

    if (!this.isSyncPlayEnabled()) {
      console.warn(
        "SyncPlay Manager: not enabled, ignoring command",
        command.Command,
      );
      return;
    }

    const emittedAt = command.EmittedAt ? new Date(command.EmittedAt) : null;
    if (this.syncPlayEnabledAt && emittedAt) {
      if (emittedAt.getTime() < this.syncPlayEnabledAt.getTime()) {
        console.debug("SyncPlay Manager: ignoring old command", command);
        return;
      }
    }

    // Reject commands targeted at a different playlist item than the one we
    // currently have loaded. Stop is always honored (it may be a teardown
    // before a queue swap). This prevents (e.g.) seeking the wrong episode
    // when a queue change is racing a command.
    if (command.Command !== "Stop" && command.PlaylistItemId) {
      const currentItemId = this.onGetPlaylistItemId?.();
      if (currentItemId && currentItemId !== command.PlaylistItemId) {
        console.debug(
          `SyncPlay Manager: ignoring command for playlist item ${command.PlaylistItemId} (current is ${currentItemId})`,
        );
        return;
      }
    }

    if (!this.syncPlayReady) {
      console.log(
        "SyncPlay Manager: not ready, queuing command",
        command.Command,
      );
      this.queuedCommand = command;
      return;
    }

    // Remember the command even if we can't act on it yet. When the player
    // attaches (setPlayerControls), the reconcile-on-attach path uses
    // `lastPlaybackCommand` to seek to the estimated group position and
    // resume/pause to match the group. Without this assignment, a command
    // that arrives during the join→navigate→load window is lost.
    this.lastPlaybackCommand = command;

    // Clear pending guard once the matching broadcast arrives. We treat any
    // Unpause/Pause arrival as satisfying the pending request (the server
    // may coalesce or override our intent — either way we trust its decision).
    if (command.Command === "Unpause" || command.Command === "Pause") {
      this.clearPendingPlaybackCommand();
    }

    if (!this.playerControls) {
      // Expected when a command arrives between joining the group and the
      // player finishing its initial load. The reconciliation in
      // setPlayerControls will replay this command from `lastPlaybackCommand`
      // once controls attach.
      console.debug(
        `SyncPlay Manager: ${command.Command} stored for replay (player not attached yet)`,
      );
      return;
    }

    console.log(
      `SyncPlay Manager: delegating ${command.Command} to playback core`,
    );

    // Delegate to playback handler
    if (this.onPlaybackCoreCommand) {
      this.onPlaybackCoreCommand(command);
    } else {
      console.error("SyncPlay Manager: no playback command handler set!");
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  /**
   * Get SyncPlay stats for display
   */
  getStats(): SyncPlayStats {
    return {
      timeSyncDevice: this.timeSyncCore.getActiveDeviceName(),
      timeSyncOffset: this.timeSyncCore.getTimeOffset().toFixed(2),
      playbackDiff: "0.00",
      syncMethod: this.syncMethod,
    };
  }

  /**
   * Show sync icon
   */
  showSyncIcon(method: string): void {
    this.syncMethod = method;
    this.emit("syncing", true, method);
  }

  /**
   * Clear sync icon
   */
  clearSyncIcon(): void {
    this.syncMethod = "None";
    this.emit("syncing", false, "None");
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Destroy the manager
   */
  destroy(): void {
    this.timeSyncCore.destroy();
    this.disableSyncPlay(false);
    this.removeAllListeners();
    this.playerControls = null;
    this.onPlaybackCoreCommand = null;
    this.onQueueUpdate = null;
  }
}
