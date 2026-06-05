/**
 * SyncPlayManager — central orchestrator for a SyncPlay session.
 *
 * Owns the three "cores" (TimeSync, PlaybackCore, QueueCore) and the
 * PlayerWrapper, and routes WebSocket events between them.
 *
 * Lifecycle:
 *   constructor → init() → (joinGroup → group-state-change "Idle"+) →
 *   group-state-change "Playing" → group-state-change "Paused" → ...
 *   → (leaveGroup) → destroy()
 *
 * Events emitted (provider listens):
 *   - `group-info-update`     `(GroupInfoDto | null)`
 *   - `group-state-change`    `(state: string, oldState: string)`
 *   - `enabled`               `(isEnabled: boolean)`
 *   - `play-state-change`     `(isFollowing: boolean)`
 *   - `playbackstart` / `playbackerror` — from PlayerWrapper hooks
 *   - `osd`                   `(action: SyncPlayOsdAction)`
 *   - `toast`                 `(messageKey: string)`
 *
 * The manager exposes a per-instance `EventEmitter` rather than upstream
 * `Events.on(manager, ...)` — replaces the global Events bus pattern.
 */

import type { Api } from "@jellyfin/sdk";
import { Controller } from "./Controller";
import { PlaybackCore } from "./cores/PlaybackCore";
import { QueueCore } from "./cores/QueueCore";
import { TimeSync } from "./cores/TimeSync";
import { EventEmitter } from "./EventEmitter";
import { PendingPlaybackTracker } from "./player/PendingPlaybackTracker";
import { PlayerWrapper } from "./player/PlayerWrapper";
import { reconcileToGroupOnAttach } from "./player/reconcileToGroupOnAttach";
import type {
  GroupInfoDto,
  GroupUpdate,
  PlayerControls,
  PlayQueueUpdate,
  SendCommand,
} from "./types";

/** Raw WebSocket message data shapes (already unwrapped by the hook). */

export class SyncPlayManager extends EventEmitter {
  private apiClient: Api;
  private playerWrapper: PlayerWrapper;
  private timeSync: TimeSync;
  private playbackCore: PlaybackCore;
  private queueCore: QueueCore;
  private pendingPlaybackTracker: PendingPlaybackTracker;
  private controller: Controller;

  /** Current group info. `null` when not in a group. */
  private groupInfo: GroupInfoDto | null = null;
  /** Is SyncPlay actively enabled (i.e., we're in a group)? */
  private syncPlayEnabledAtPlayer = false;
  /** Are we mirroring the group's commands locally? */
  private followingGroupPlayback = true;

  constructor(api: Api) {
    super();
    this.apiClient = api;
    this.playerWrapper = new PlayerWrapper();
    this.timeSync = new TimeSync(api);
    this.playbackCore = new PlaybackCore();
    this.queueCore = new QueueCore();
    this.pendingPlaybackTracker = new PendingPlaybackTracker();
    this.controller = new Controller();
  }

  /** Wire up cores. Called once after construction. */
  init(): void {
    this.playbackCore.init(this);
    this.queueCore.init(this);
    this.controller.init(this);

    // Forward PlaybackCore OSD events to provider listeners.
    this.playbackCore.on("osd", (...args) => {
      this.emit("osd", ...args);
    });

    // Bridge optimistic pending Pause/Unpause → React state.
    this.pendingPlaybackTracker.setChangeHandler((cmd) => {
      this.emit("pending-playback-change", cmd);
    });

    this.timeSync.startPing();
  }

  /** Public controller for callers. */
  getController(): Controller {
    return this.controller;
  }

  /** Called by SyncPlayProvider when the user switches Jellyfin servers. */
  updateApiClient(api: Api): void {
    this.apiClient = api;
    this.timeSync.updateApiClient(api);
  }

  getApiClient(): Api {
    return this.apiClient;
  }

  getPlayerWrapper(): PlayerWrapper {
    return this.playerWrapper;
  }

  getTimeSync(): TimeSync {
    return this.timeSync;
  }

  getPlaybackCore(): PlaybackCore {
    return this.playbackCore;
  }

  getQueueCore(): QueueCore {
    return this.queueCore;
  }

  getPendingPlaybackTracker(): PendingPlaybackTracker {
    return this.pendingPlaybackTracker;
  }

  // ===========================================================================
  // WebSocket message handlers (called by useSyncPlayWebSocket)
  // ===========================================================================

  /**
   * Handle a `SyncPlayGroupUpdate` WebSocket message.
   *
   * Cast: the SDK's `GroupUpdate.Type` union is narrower than what the
   * server actually emits (it omits `SyncPlayIsDisabled`, `GroupUpdate`,
   * `CreateGroupDenied`, `JoinGroupDenied`). Wire format is the source
   * of truth here.
   */
  processGroupUpdate(rawUpdate: GroupUpdate): void {
    if (!rawUpdate) {
      console.warn("SyncPlay processGroupUpdate: empty update");
      return;
    }
    const update = rawUpdate as unknown as {
      Type: string;
      Data: unknown;
    };

    switch (update.Type) {
      case "PlayQueue":
        this.queueCore.updatePlayQueue(
          this.apiClient,
          update.Data as unknown as PlayQueueUpdate,
        );
        break;

      case "UserJoined":
      case "UserLeft":
        // Group membership notifications — current group will follow
        // via GroupUpdate, but emit a toast for friendliness.
        this.emit("toast", `MessageSyncPlay${update.Type}`, update.Data);
        break;

      case "GroupJoined": {
        this.groupInfo = update.Data as GroupInfoDto;
        this.enableSyncPlay(this.groupInfo);
        this.emit("group-update", this.groupInfo);
        this.emit("toast", "MessageSyncPlayGroupJoined");
        break;
      }

      case "GroupLeft":
      case "NotInGroup":
      case "SyncPlayIsDisabled": {
        const previousState = this.groupInfo?.State;
        this.groupInfo = null;
        this.disableSyncPlay();
        this.emit("group-update", null);
        if (update.Type === "GroupLeft") {
          this.emit("toast", "MessageSyncPlayGroupLeft");
        }
        if (previousState) {
          this.emit("group-state-change", "Idle", previousState);
        }
        break;
      }

      case "GroupUpdate": {
        const previousState = this.groupInfo?.State;
        this.groupInfo = update.Data as GroupInfoDto;
        this.emit("group-update", this.groupInfo);
        const newState = this.groupInfo.State;
        if (newState && newState !== previousState) {
          this.emit("group-state-change", newState, previousState ?? "Idle");
        }
        break;
      }

      case "StateUpdate": {
        const stateData = update.Data as {
          State?: string;
          PreviousState?: string;
          Reason?: string;
        };
        const newState = stateData.State ?? "Idle";
        const previousState = stateData.PreviousState ?? "Idle";
        const reason = stateData.Reason;
        if (this.groupInfo) {
          this.groupInfo.State = newState as GroupInfoDto["State"];
          this.emit("group-update", this.groupInfo);
        }
        this.emit("group-state-change", newState, previousState, reason);
        // Server signals "Playing" or "Paused" → clear any in-flight
        // optimistic tap state.
        if (newState === "Playing" || newState === "Paused") {
          this.pendingPlaybackTracker.clear();
        }
        break;
      }

      case "CreateGroupDenied":
        this.emit("toast", "MessageSyncPlayCreateGroupDenied");
        break;
      case "JoinGroupDenied":
        this.emit("toast", "MessageSyncPlayJoinGroupDenied");
        break;
      case "LibraryAccessDenied":
        this.emit("toast", "MessageSyncPlayLibraryAccessDenied");
        break;
      case "GroupDoesNotExist":
        this.emit("toast", "MessageSyncPlayGroupDoesNotExist");
        break;

      default:
        console.warn("SyncPlay processGroupUpdate: unknown type", update.Type);
        break;
    }
  }

  /** Handle a `SyncPlayCommand` WebSocket message. */
  processCommand(command: SendCommand): void {
    if (!command) {
      console.warn("SyncPlay processCommand: empty command");
      return;
    }
    this.playbackCore.applyCommand(command);
    // Server told us the new playing state — clear optimistic UI.
    if (command.Command === "Unpause" || command.Command === "Pause") {
      this.pendingPlaybackTracker.clear();
    }
  }

  // ===========================================================================
  // Enable / disable SyncPlay
  // ===========================================================================

  private enableSyncPlay(_group: GroupInfoDto): void {
    if (this.syncPlayEnabledAtPlayer) return;
    this.syncPlayEnabledAtPlayer = true;
    this.followingGroupPlayback = true;
    this.timeSync.forceUpdate();
    this.emit("enabled", true);
    this.emit("play-state-change", true);
  }

  private disableSyncPlay(): void {
    if (!this.syncPlayEnabledAtPlayer) return;
    this.syncPlayEnabledAtPlayer = false;
    this.followingGroupPlayback = false;
    this.playbackCore.clearScheduledCommand();
    this.queueCore.clear();
    this.pendingPlaybackTracker.clear();
    this.emit("enabled", false);
    this.emit("play-state-change", false);
  }

  /**
   * Resume following group playback after the user temporarily took
   * local control (e.g. scrubbed the seek bar).
   */
  async followGroupPlayback(_api: Api): Promise<void> {
    this.followingGroupPlayback = true;
    this.emit("play-state-change", true);
  }

  /** Stop following group playback (e.g., user takes local control). */
  haltGroupPlayback(_api: Api): void {
    this.followingGroupPlayback = false;
    this.emit("play-state-change", false);
  }

  isFollowingGroupPlayback(): boolean {
    return this.followingGroupPlayback;
  }

  isSyncPlayEnabled(): boolean {
    return this.syncPlayEnabledAtPlayer;
  }

  // ===========================================================================
  // Player attach + provider bridges
  // ===========================================================================

  /**
   * Bind the RN player controls.
   * Called from the player screen's `useEffect`. Triggers a reconcile
   * if a group is active and the player is late-arriving.
   */
  setPlayerControls(controls: PlayerControls | null): void {
    this.playerWrapper.bindToControls(controls);
    if (controls && this.syncPlayEnabledAtPlayer) {
      const lastCommand = this.playbackCore.getLastCommand();
      reconcileToGroupOnAttach(controls, lastCommand, (local) =>
        this.timeSync.localDateToRemote(local),
      );
    }
  }

  /** Player-side notify hook: media is ready to play. */
  notifyReady(): void {
    this.emit("playbackstart");
    if (this.syncPlayEnabledAtPlayer) {
      this.playbackCore.onReady(this.apiClient);
    }
  }

  /** Player-side notify hook: buffering state changed. */
  notifyBuffering(isBuffering: boolean): void {
    if (!this.syncPlayEnabledAtPlayer) return;
    if (isBuffering) {
      this.playbackCore.onBuffering(this.apiClient);
    } else {
      this.playbackCore.onReady(this.apiClient);
    }
  }

  /** Player-side notify hook: local playback started. */
  notifyPlaybackStart(): void {
    this.emit("playbackstart");
    if (this.syncPlayEnabledAtPlayer) {
      this.playbackCore.onPlaybackStart(this.apiClient);
    }
  }

  // ===========================================================================
  // Pending playback (optimistic UI for play/pause taps)
  // ===========================================================================

  /** Called by Controller before sending an Unpause/Pause request. */
  markPendingPlaybackCommand(command: "Unpause" | "Pause"): void {
    this.pendingPlaybackTracker.mark(command);
  }

  /** Is the group currently playing? Used by Controller.playPause. */
  isPlaying(): boolean {
    const pending = this.pendingPlaybackTracker.get();
    if (pending === "Unpause") return true;
    if (pending === "Pause") return false;
    return this.groupInfo?.State === "Playing";
  }

  /** Group info for consumers. */
  getGroupInfo(): GroupInfoDto | null {
    return this.groupInfo;
  }

  /** Last playback command (for QueueCore.startPlayback resumption). */
  getLastPlaybackCommand(): SendCommand | null {
    return this.playbackCore.getLastCommand();
  }

  // ===========================================================================
  // Teardown
  // ===========================================================================

  destroy(): void {
    this.timeSync.destroy();
    this.playbackCore.destroy();
    this.queueCore.destroy();
    this.playerWrapper.bindToControls(null);
    this.removeAllListeners();
  }
}

export default SyncPlayManager;
