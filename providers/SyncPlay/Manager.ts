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
import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api";
import { Controller } from "./Controller";
import { PlaybackCore } from "./cores/PlaybackCore";
import { QueueCore } from "./cores/QueueCore";
import { TimeSync } from "./cores/TimeSync";
import { EventEmitter } from "./EventEmitter";
import { PendingPlaybackTracker } from "./player/PendingPlaybackTracker";
import { PlayerWrapper } from "./player/PlayerWrapper";
import type {
  GroupInfoDto,
  GroupUpdate,
  PlaybackCommand,
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
  private clockReady = false;
  private joinedAt = 0;
  private queuedCommand: PlaybackCommand | null = null;
  private lastPlaybackCommand: PlaybackCommand | null = null;
  private playbackStarted = false;
  private preparingPlayback = false;
  private boundControls: PlayerControls | null = null;

  constructor(api: Api) {
    super();
    this.apiClient = api;
    this.playerWrapper = new PlayerWrapper((buffering) => {
      if (!this.canControlCurrentItem()) return;
      if (buffering) this.playbackCore.onBuffering();
      else this.playbackCore.onReady();
    });
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

    this.timeSync.on("update", (_offset, ping) => {
      if (!this.isSyncPlayEnabled()) return;
      if (typeof ping !== "number" || !Number.isFinite(ping)) return;
      this.clockReady = true;
      void getSyncPlayApi(this.apiClient)
        .syncPlayPing({
          // Jellyfin's DTO is Int64, although the TS SDK only says number.
          pingRequestDto: { Ping: Math.max(0, Math.round(ping)) },
        })
        .catch((error) => console.error("SyncPlay ping report failed", error));
      this.applyQueuedCommand();
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
        this.enableSyncPlay(update.Data as GroupInfoDto);
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
        if (!this.isSyncPlayEnabled()) return;
        const stateData = update.Data as {
          State?: string;
          PreviousState?: string;
          Reason?: string;
        };
        const newState = stateData.State ?? "Idle";
        const previousState = stateData.PreviousState ?? "Idle";
        const reason = stateData.Reason;
        if (this.groupInfo) {
          this.groupInfo = {
            ...this.groupInfo,
            State: newState as GroupInfoDto["State"],
          };
          this.emit("group-update", this.groupInfo);
        }
        this.emit("group-state-change", newState, previousState, reason);
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
    if (!this.isSyncPlayEnabled()) return;
    if (command.GroupId && command.GroupId !== this.groupInfo?.GroupId) {
      console.debug("SyncPlay: ignoring command for another group");
      return;
    }
    const when = new Date(command.When ?? "");
    const emittedAt = new Date(command.EmittedAt ?? "");
    if (
      !command.Command ||
      !["Unpause", "Pause", "Seek", "Stop"].includes(command.Command) ||
      !Number.isFinite(when.getTime()) ||
      !Number.isFinite(emittedAt.getTime()) ||
      (command.Command !== "Stop" &&
        (!command.PlaylistItemId ||
          !Number.isFinite(command.PositionTicks) ||
          (command.PositionTicks ?? -1) < 0))
    ) {
      console.error("SyncPlay: invalid playback command", command);
      return;
    }
    if (
      emittedAt.getTime() < this.joinedAt ||
      (this.lastPlaybackCommand &&
        emittedAt < this.lastPlaybackCommand.EmittedAt)
    ) {
      console.debug("SyncPlay: ignoring stale playback command");
      return;
    }
    const normalized: PlaybackCommand = {
      Command: command.Command,
      When: when,
      EmittedAt: emittedAt,
      PositionTicks: command.PositionTicks ?? 0,
      PlaylistItemId: command.PlaylistItemId ?? null,
    };
    this.lastPlaybackCommand = normalized;
    this.queuedCommand = normalized;
    if (normalized.Command === "Unpause" || normalized.Command === "Pause") {
      this.pendingPlaybackTracker.clear();
    }
    this.applyQueuedCommand();
  }

  applyQueuedCommand(): void {
    const command = this.queuedCommand;
    if (
      !command ||
      !this.clockReady ||
      !this.isSyncPlayEnabled() ||
      !this.followingGroupPlayback ||
      !this.playerWrapper.isPlaybackActive()
    )
      return;
    if (command.Command === "Stop") {
      this.queueCore.cancelPlaybackPreparation();
      this.preparingPlayback = false;
    } else if (
      !this.playbackStarted ||
      this.preparingPlayback ||
      !this.canControlCurrentItem()
    ) {
      return;
    }
    if (
      command.Command !== "Stop" &&
      command.PlaylistItemId !== this.queueCore.getCurrentPlaylistItemId()
    ) {
      console.debug("SyncPlay: waiting for the command's playlist item");
      return;
    }
    this.queuedCommand = null;
    this.playbackCore.applyCommand(command);
  }

  canControlCurrentItem(): boolean {
    return (
      this.isSyncPlayEnabled() &&
      this.followingGroupPlayback &&
      this.playerWrapper.isPlaybackActive() &&
      this.playerWrapper.currentItemId() === this.queueCore.getCurrentItemId()
    );
  }

  beginPlaybackPreparation(): void {
    this.playbackCore.reset();
    this.preparingPlayback = true;
    this.playbackStarted = false;
  }

  completePlaybackPreparation(): void {
    this.preparingPlayback = false;
    this.applyQueuedCommand();
  }

  isPreparingPlayback(): boolean {
    return this.preparingPlayback;
  }

  // ===========================================================================
  // Enable / disable SyncPlay
  // ===========================================================================

  private enableSyncPlay(group: GroupInfoDto): void {
    if (
      this.syncPlayEnabledAtPlayer &&
      group.GroupId === this.groupInfo?.GroupId
    )
      return;
    if (this.syncPlayEnabledAtPlayer) this.disableSyncPlay();
    const joinedAt = Date.parse(group.LastUpdatedAt ?? "");
    if (!group.GroupId || !Number.isFinite(joinedAt)) {
      console.error("SyncPlay: invalid GroupJoined payload", group);
      return;
    }
    this.groupInfo = group;
    this.joinedAt = joinedAt;
    this.clockReady = false;
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
    this.playbackCore.reset();
    this.queuedCommand = null;
    this.lastPlaybackCommand = null;
    this.clockReady = false;
    this.playbackStarted = false;
    this.preparingPlayback = false;
    this.playerWrapper.bindToControls(null);
    this.boundControls = null;
    this.queueCore.clear();
    this.pendingPlaybackTracker.clear();
    this.emit("enabled", false);
    this.emit("play-state-change", false);
  }

  /**
   * Resume following group playback after the user temporarily took
   * local control (e.g. scrubbed the seek bar).
   */
  async followGroupPlayback(api: Api): Promise<void> {
    await getSyncPlayApi(api).syncPlaySetIgnoreWait({
      ignoreWaitRequestDto: { IgnoreWait: false },
    });
    this.followingGroupPlayback = true;
    this.emit("play-state-change", true);
  }

  /** Stop following group playback (e.g., user takes local control). */
  haltGroupPlayback(api: Api): void {
    this.followingGroupPlayback = false;
    this.playbackCore.reset();
    this.queueCore.cancelPlaybackPreparation();
    this.preparingPlayback = false;
    this.playerWrapper.localStop();
    void getSyncPlayApi(api)
      .syncPlaySetIgnoreWait({
        ignoreWaitRequestDto: { IgnoreWait: true },
      })
      .catch((error) => console.error("SyncPlay ignore-wait failed", error));
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
   * Bind once per media session, not on every pause/loading React render.
   */
  setPlayerControls(controls: PlayerControls | null): void {
    if (this.boundControls === controls) return;
    this.boundControls = controls;
    this.playbackCore.reset();
    this.playbackStarted = false;
    this.playerWrapper.bindToControls(controls);
    this.queueCore.cancelActivePreparation();
  }

  /** Player-side notify hook: media is ready to play. */
  notifyReady(): void {
    this.notifyBuffering(false);
  }

  /** Player-side notify hook: buffering state changed. */
  notifyBuffering(isBuffering: boolean): void {
    if (!this.canControlCurrentItem()) return;
    this.playerWrapper.notifyBuffering(isBuffering);
  }

  /** Player-side notify hook: local playback started. */
  notifyPlaybackStart(): void {
    if (!this.canControlCurrentItem()) {
      console.debug("SyncPlay: ignoring player start", {
        enabled: this.isSyncPlayEnabled(),
        following: this.followingGroupPlayback,
        playerItemId: this.playerWrapper.currentItemId(),
        queueItemId: this.queueCore.getCurrentItemId(),
      });
      return;
    }
    if (this.playbackStarted) return;
    this.playbackStarted = true;
    this.playbackCore.onPlaybackStart();
    this.applyQueuedCommand();
  }

  notifyPlaybackState(playing: boolean): void {
    if (!this.canControlCurrentItem()) return;
    if (playing) this.playbackCore.onUnpause();
    else this.playbackCore.onPause();
  }

  notifyPlaybackError(error: unknown): void {
    this.emit("playbackerror", error);
    this.playbackCore.clearScheduledCommand();
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
    return this.lastPlaybackCommand?.Command === "Unpause";
  }

  /** Group info for consumers. */
  getGroupInfo(): GroupInfoDto | null {
    return this.groupInfo;
  }

  /** Last playback command (for QueueCore.startPlayback resumption). */
  getLastPlaybackCommand(): PlaybackCommand | null {
    return this.lastPlaybackCommand;
  }

  // ===========================================================================
  // Teardown
  // ===========================================================================

  destroy(): void {
    this.queueCore.cancelPlaybackPreparation();
    this.pendingPlaybackTracker.clear();
    this.timeSync.destroy();
    this.playbackCore.destroy();
    this.queueCore.destroy();
    this.playerWrapper.bindToControls(null);
    this.removeAllListeners();
  }
}

export default SyncPlayManager;
