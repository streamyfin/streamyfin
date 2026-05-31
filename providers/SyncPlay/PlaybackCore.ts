/**
 * PlaybackCore
 *
 * Manages synchronized playback for SyncPlay.
 * Handles scheduling commands at precise times and sync correction.
 *
 * Based on jellyfin-web's PlaybackCore.js
 */

import type { Api } from "@jellyfin/sdk";
import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api";
import { EventEmitter, msToTicks, ticksToMs, waitForOwnEvent } from "./Helper";
import type { TimeSyncCore } from "./TimeSyncCore";
import type {
  PlayerControls,
  SendCommand,
  SyncPlayOsdAction,
  SyncPlaySettings,
} from "./types";
import { TicksPerMillisecond } from "./types";

// Random offset added when re-issuing a duplicate Seek to force the player
// off-position so the next sync correction has something to chew on. Matches
// jellyfin-web's behavior (server tolerates a range, so we deliberately land
// just outside it).
const SEEK_FORCE_RANGE_MS = 100;
// Timeout for waiting on the local player's "ready" event after seek.
// Matches jellyfin-web's Helper.WaitForEventDefaultTimeout.
const WAIT_FOR_READY_TIMEOUT_MS = 30000;
// How close player position must be to command position to consider it
// already in the correct place (fuzz to account for player imprecision).
const POSITION_MATCH_TOLERANCE_MS = 500;

/**
 * PlaybackCore - Handles synchronized playback
 */
export class PlaybackCore extends EventEmitter {
  private api: Api;
  private timeSyncCore: TimeSyncCore;
  private playerControls: PlayerControls | null = null;

  // Sync state
  private syncEnabled = false;
  private playbackDiffMillis = 0;
  private syncAttempts = 0;
  private lastSyncTime = new Date();
  private playerIsBuffering = false;

  // Command tracking
  private lastCommand: SendCommand | null = null;
  private scheduledCommandTimeout: ReturnType<typeof setTimeout> | null = null;
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;

  // Last buffering state we reported to the server. Used to dedupe
  // sendBufferingRequest so we only send on actual transitions —
  // jellyfin-web gets this for free from the HTML5 `waiting`/`canplay`
  // events, but our player exposes state, not events, and the React
  // effect that drives notifyReady/notifyBuffering can re-run many times
  // per second during normal playback. Without this guard we flood the
  // server with redundant Ready/Buffering requests.
  private lastBufferingSent: boolean | null = null;
  private inflightBufferingRequest: Promise<void> | null = null;

  // Debounce buffering notifications, matching jellyfin-web's
  // `minBufferingThresholdMillis = 3000` in HtmlVideoPlayer.js. A short
  // re-buffer blip (<3s) shouldn't notify the server at all — there's no
  // reason to pause the whole group for a hiccup that resolves itself.
  // Going Ready cancels any pending buffering notification.
  private notifyBufferingTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly minBufferingThresholdMillis = 3000;

  // Set to true by `scheduleReadyRequestOnPlaybackStart` whenever a new
  // SyncPlay queue starts loading (NewPlaylist / SetCurrentItem / NextItem
  // / PreviousItem). On the next `onReady` we pause the player BEFORE
  // sending SyncPlayReady so the server sees us as `IsPlaying:false`,
  // parked at the start position, awaiting an Unpause command. Mirrors
  // jellyfin-web's `QueueCore.scheduleReadyRequestOnPlaybackStart` which
  // registers a one-shot `playbackstart` listener that does the same.
  // Without this the receiver's player auto-plays the moment it loads and
  // the group's Unpause command arrives to an already-playing player —
  // which leaves the receiver subtly out of sync with the sender (or, on
  // slower devices, stuck on a blank loading screen because the early
  // play attempt races the media load and never recovers).
  private pendingInitialPause = false;

  // Settings
  private minDelaySpeedToSync = 60.0;
  private maxDelaySpeedToSync = 3000.0;
  private speedToSyncDuration = 1000.0;
  private minDelaySkipToSync = 400.0;
  private useSpeedToSync = true;
  private useSkipToSync = true;
  private enableSyncCorrection = false;

  // Callbacks
  private onNotifyOsd: ((action: SyncPlayOsdAction) => void) | null = null;
  private getCurrentPlaylistItemId: (() => string | null) | null = null;

  constructor(api: Api, timeSyncCore: TimeSyncCore) {
    super();
    this.api = api;
    this.timeSyncCore = timeSyncCore;
  }

  /**
   * Set player controls
   */
  setPlayerControls(controls: PlayerControls | null): void {
    this.playerControls = controls;
    // A new (or detached) player means the server's view of our ready
    // state is stale — drop the dedupe latch so the next notifyReady /
    // notifyBuffering actually reaches the server.
    this.lastBufferingSent = null;
  }

  /**
   * Set OSD notification handler
   */
  setOsdHandler(handler: ((action: SyncPlayOsdAction) => void) | null): void {
    this.onNotifyOsd = handler;
  }

  /**
   * Set playlist item ID getter
   */
  setPlaylistItemIdGetter(getter: (() => string | null) | null): void {
    this.getCurrentPlaylistItemId = getter;
  }

  /**
   * Load settings
   */
  loadSettings(settings: Partial<SyncPlaySettings>): void {
    if (settings.minDelaySpeedToSync !== undefined) {
      this.minDelaySpeedToSync = settings.minDelaySpeedToSync;
    }
    if (settings.maxDelaySpeedToSync !== undefined) {
      this.maxDelaySpeedToSync = settings.maxDelaySpeedToSync;
    }
    if (settings.speedToSyncDuration !== undefined) {
      this.speedToSyncDuration = settings.speedToSyncDuration;
    }
    if (settings.minDelaySkipToSync !== undefined) {
      this.minDelaySkipToSync = settings.minDelaySkipToSync;
    }
    if (settings.useSpeedToSync !== undefined) {
      this.useSpeedToSync = settings.useSpeedToSync;
    }
    if (settings.useSkipToSync !== undefined) {
      this.useSkipToSync = settings.useSkipToSync;
    }
    if (settings.enableSyncCorrection !== undefined) {
      this.enableSyncCorrection = settings.enableSyncCorrection;
    }
  }

  // ============================================================================
  // Player Events
  // ============================================================================

  /**
   * Called when playback starts
   */
  onPlaybackStart(): void {
    this.emit("playbackstart");
  }

  /**
   * Called when playback stops
   */
  onPlaybackStop(): void {
    this.lastCommand = null;
    this.emit("playbackstop");
  }

  /**
   * Called when player is ready to play
   */
  onReady(): void {
    this.playerIsBuffering = false;
    // Cancel any pending buffering notification — we're ready before the
    // 3s threshold fired, so the server never needs to know we hiccupped.
    if (this.notifyBufferingTimeout) {
      clearTimeout(this.notifyBufferingTimeout);
      this.notifyBufferingTimeout = null;
    }
    // If we're handling the first ready event after a queue change,
    // pause the player BEFORE reporting ready. The subsequent
    // `sendBufferingRequest(false)` will then read `isPlaying() === false`
    // and the server will hold the group until we receive an Unpause.
    if (this.pendingInitialPause) {
      this.pendingInitialPause = false;
      if (this.playerControls?.isPlaying()) {
        console.log(
          "SyncPlay PlaybackCore: pausing on initial ready (awaiting group Unpause)",
        );
        this.playerControls.pause();
      }
    }
    this.sendBufferingRequest(false);
    this.emit("ready");
  }

  /**
   * Mark the next `onReady` call as the initial ready for a new queue
   * item. The player will be paused before SyncPlayReady is sent so the
   * server keeps the group in `Waiting` until our Unpause arrives.
   *
   * Mirrors jellyfin-web's `QueueCore.scheduleReadyRequestOnPlaybackStart`.
   * Called by the provider when a PlayQueue update is `NewPlaylist`,
   * `SetCurrentItem`, `NextItem`, or `PreviousItem`.
   */
  scheduleReadyRequestOnPlaybackStart(): void {
    this.pendingInitialPause = true;
  }

  /**
   * Called when player is buffering
   */
  onBuffering(): void {
    // Debounce: only flip into "buffering" state (and notify the server)
    // if the stall lasts longer than minBufferingThresholdMillis. Mirrors
    // jellyfin-web's HtmlVideoPlayer.js `_onWaiting` handler, which only
    // calls `onBuffering()` after the 3s timeout elapses. Keeping
    // playerIsBuffering=false during brief blips lets sync correction
    // continue to run normally.
    if (this.notifyBufferingTimeout) {
      clearTimeout(this.notifyBufferingTimeout);
    }
    this.notifyBufferingTimeout = setTimeout(() => {
      this.notifyBufferingTimeout = null;
      this.playerIsBuffering = true;
      this.sendBufferingRequest(true);
      this.emit("buffering");
    }, this.minBufferingThresholdMillis);
  }

  /**
   * Check if player is buffering
   */
  isBuffering(): boolean {
    return this.playerIsBuffering;
  }

  /**
   * Get playback difference in milliseconds
   */
  getPlaybackDiff(): number {
    return this.playbackDiffMillis;
  }

  // ============================================================================
  // Server Communication
  // ============================================================================

  /**
   * Send buffering/ready request to server.
   *
   * NOTE: This must work even before player controls are bound, so that we
   * can signal "I'm not ready yet, hold the group" while the video is still
   * loading. jellyfin-web's HTML5 player gets this for free via the
   * `waiting` event firing during initial buffering; we don't bind controls
   * until the video is loaded, so we synthesize a position=0 buffering
   * signal in the pre-bind window.
   */
  async sendBufferingRequest(isBuffering: boolean): Promise<void> {
    if (!this.api) {
      console.warn("SyncPlay PlaybackCore: no api for buffering request");
      return;
    }

    // Skip if the desired state matches what we last sent. Without this,
    // the React effect that drives notifyReady/notifyBuffering will flood
    // the server every time the video player's isBuffering momentarily
    // toggles during normal playback.
    if (this.lastBufferingSent === isBuffering) {
      return;
    }

    // Coalesce: if a request is already in flight, wait for it. This
    // prevents racing two requests when state flips rapidly.
    if (this.inflightBufferingRequest) {
      await this.inflightBufferingRequest;
      // Re-check after the in-flight request settled — the new state may
      // already match.
      if (this.lastBufferingSent === isBuffering) {
        return;
      }
    }

    const request = this.doSendBufferingRequest(isBuffering);
    this.inflightBufferingRequest = request;
    try {
      await request;
      this.lastBufferingSent = isBuffering;
    } finally {
      if (this.inflightBufferingRequest === request) {
        this.inflightBufferingRequest = null;
      }
    }
  }

  private async doSendBufferingRequest(isBuffering: boolean): Promise<void> {
    if (!this.api) return;

    try {
      const currentPosition = this.playerControls?.getCurrentPosition() ?? 0;
      const currentPositionTicks = msToTicks(currentPosition);
      const isPlaying = this.playerControls?.isPlaying() ?? false;

      const now = this.timeSyncCore.localDateToRemote(new Date());
      const playlistItemId = this.getCurrentPlaylistItemId?.() ?? null;

      const syncPlayApi = getSyncPlayApi(this.api);

      console.log(
        `SyncPlay PlaybackCore: sending ${isBuffering ? "BUFFERING" : "READY"} to server`,
        {
          position: currentPositionTicks,
          playlistItemId,
          hasPlayerControls: !!this.playerControls,
        },
      );

      if (isBuffering) {
        await syncPlayApi.syncPlayBuffering({
          bufferRequestDto: {
            When: now.toISOString(),
            PositionTicks: currentPositionTicks,
            IsPlaying: isPlaying,
            PlaylistItemId: playlistItemId ?? undefined,
          },
        });
      } else {
        await syncPlayApi.syncPlayReady({
          readyRequestDto: {
            When: now.toISOString(),
            PositionTicks: currentPositionTicks,
            IsPlaying: isPlaying,
            PlaylistItemId: playlistItemId ?? undefined,
          },
        });
      }

      console.log(
        `SyncPlay PlaybackCore: ${isBuffering ? "BUFFERING" : "READY"} sent successfully`,
      );
    } catch (error) {
      console.error("SyncPlay: failed to send buffering request", error);
      // On failure, clear the dedupe latch so the next attempt actually
      // re-sends rather than getting stuck thinking the server knows.
      throw error;
    }
  }

  // ============================================================================
  // Command Handling
  // ============================================================================

  /**
   * Apply a playback command
   */
  async applyCommand(command: SendCommand): Promise<void> {
    console.log(`SyncPlay PlaybackCore: applyCommand - ${command.Command}`);

    // Parse the When time from string
    const commandWhen = command.When ? new Date(command.When) : new Date();
    const positionTicks = command.PositionTicks ?? 0;

    // Duplicate command handling — don't blindly skip. Match jellyfin-web:
    // if the duplicate's scheduled time has already passed and local player
    // state doesn't match, re-apply (with a force-offset for seek). This
    // self-heals after a missed broadcast, reconnect, or local drift.
    if (this.lastCommand?.When) {
      const lastWhen = new Date(this.lastCommand.When);
      if (
        lastWhen.getTime() === commandWhen.getTime() &&
        this.lastCommand.PositionTicks === command.PositionTicks &&
        this.lastCommand.Command === command.Command &&
        this.lastCommand.PlaylistItemId === command.PlaylistItemId
      ) {
        const whenLocal = this.timeSyncCore.remoteDateToLocal(commandWhen);
        if (whenLocal > new Date()) {
          // Still in the future — already scheduled, nothing to do.
          console.debug(
            "SyncPlay PlaybackCore: duplicate (still scheduled), skipping",
          );
          return;
        }

        if (!this.playerControls) {
          console.debug(
            "SyncPlay PlaybackCore: duplicate past command but no player",
          );
          return;
        }

        const currentPositionMs = this.playerControls.getCurrentPosition();
        const isPlaying = this.playerControls.isPlaying();
        const targetMs = ticksToMs(positionTicks);
        const positionMatches =
          Math.abs(currentPositionMs - targetMs) <= POSITION_MATCH_TOLERANCE_MS;

        switch (command.Command) {
          case "Unpause":
            if (!isPlaying) {
              console.debug("SyncPlay PlaybackCore: dup Unpause — reconciling");
              await this.scheduleUnpause(commandWhen, positionTicks);
            }
            return;
          case "Pause":
            if (isPlaying || !positionMatches) {
              console.debug("SyncPlay PlaybackCore: dup Pause — reconciling");
              this.schedulePause(commandWhen, positionTicks);
            }
            return;
          case "Stop":
            if (isPlaying) {
              console.debug("SyncPlay PlaybackCore: dup Stop — reconciling");
              this.scheduleStop(commandWhen);
            }
            return;
          case "Seek": {
            if (!isPlaying && positionMatches) {
              // Already paused at target — just confirm ready.
              this.sendBufferingRequest(false);
              return;
            }
            // Force a re-seek with a small random offset so the player
            // actually moves (server tolerates a range).
            const randomOffsetTicks =
              Math.round((Math.random() - 0.5) * SEEK_FORCE_RANGE_MS) *
              TicksPerMillisecond;
            console.debug(
              `SyncPlay PlaybackCore: dup Seek — reconciling with offset ${randomOffsetTicks} ticks`,
            );
            this.scheduleSeek(commandWhen, positionTicks + randomOffsetTicks);
            return;
          }
          default:
            console.error(
              "SyncPlay PlaybackCore: unrecognized duplicate command",
              command,
            );
            return;
        }
      }
    }

    this.lastCommand = command;

    if (!this.playerControls) {
      console.error("SyncPlay PlaybackCore: NO PLAYER CONTROLS!");
      return;
    }

    console.log(
      `SyncPlay PlaybackCore: executing ${command.Command} scheduled for ${commandWhen.toISOString()}`,
    );

    switch (command.Command) {
      case "Unpause":
        await this.scheduleUnpause(commandWhen, positionTicks);
        break;
      case "Pause":
        this.schedulePause(commandWhen, positionTicks);
        break;
      case "Stop":
        this.scheduleStop(commandWhen);
        break;
      case "Seek":
        this.scheduleSeek(commandWhen, positionTicks);
        break;
      default:
        console.error("SyncPlay PlaybackCore: unrecognized command", command);
    }
  }

  /**
   * Schedule an unpause at a specific time
   */
  private async scheduleUnpause(
    playAtTime: Date,
    positionTicks: number,
  ): Promise<void> {
    this.clearScheduledCommand();

    const currentTime = new Date();
    const playAtTimeLocal = this.timeSyncCore.remoteDateToLocal(playAtTime);
    const positionMs = ticksToMs(positionTicks);

    if (playAtTimeLocal > currentTime) {
      // Future command - schedule it
      const playTimeout = playAtTimeLocal.getTime() - currentTime.getTime();

      // Pre-seek only when we're AHEAD of the target by more than the skip
      // threshold. If we're behind, the unpause itself plays forward and
      // SkipToSync/SpeedToSync will catch us up — forward-seeking now would
      // just cause needless buffering. (Matches jellyfin-web.)
      const currentPositionMs = this.playerControls?.getCurrentPosition() ?? 0;
      const aheadByMs = currentPositionMs - positionMs;
      console.log(
        `SyncPlay: pre-seek check - current=${currentPositionMs}ms, target=${positionMs}ms, aheadBy=${aheadByMs}ms, threshold=${this.minDelaySkipToSync}ms`,
      );
      if (aheadByMs > this.minDelaySkipToSync) {
        console.log(`SyncPlay: PRE-SEEKING back to ${positionMs}ms`);
        this.localSeek(positionMs);
      }

      this.scheduledCommandTimeout = setTimeout(() => {
        this.localUnpause();
        this.onNotifyOsd?.("unpause");

        // Enable sync after a delay
        this.syncTimeout = setTimeout(() => {
          this.syncEnabled = true;
        }, this.maxDelaySpeedToSync / 2);
      }, playTimeout);

      console.debug(`SyncPlay: scheduled unpause in ${playTimeout}ms`);
    } else {
      // Past command - play immediately and seek to estimated position
      const elapsed = currentTime.getTime() - playAtTimeLocal.getTime();
      const serverPositionTicks = positionTicks + elapsed * TicksPerMillisecond;
      const serverPositionMs = ticksToMs(serverPositionTicks);

      this.localUnpause();
      this.localSeek(serverPositionMs);

      setTimeout(() => {
        this.onNotifyOsd?.("unpause");
      }, 100);

      this.syncTimeout = setTimeout(() => {
        this.syncEnabled = true;
      }, this.maxDelaySpeedToSync / 2);

      console.debug(`SyncPlay: immediate unpause at ${serverPositionMs}ms`);
    }
  }

  /**
   * Schedule a pause at a specific time
   */
  private schedulePause(pauseAtTime: Date, positionTicks: number): void {
    console.log("SyncPlay PlaybackCore: schedulePause called");
    this.clearScheduledCommand();

    const currentTime = new Date();
    const pauseAtTimeLocal = this.timeSyncCore.remoteDateToLocal(pauseAtTime);
    const positionMs = ticksToMs(positionTicks);

    const callback = () => {
      console.log("SyncPlay PlaybackCore: EXECUTING PAUSE NOW");

      // If we're already paused at the target position, do nothing.
      // jellyfin-web gets this for free because HTML5 video's seekTo is a
      // no-op when the target equals currentTime, and pause() is a no-op
      // when already paused. Our PlayerControls.seekTo always actually
      // seeks, which triggers waiting→canplay and a notifyBuffering →
      // notifyReady cycle. The server reacts by re-sending Pause, which
      // re-enters this callback → infinite feedback loop. Guarding here
      // breaks the loop while preserving normal pause behaviour.
      if (this.playerControls) {
        const isPlaying = this.playerControls.isPlaying();
        const currentPositionMs = this.playerControls.getCurrentPosition();
        const positionMatches =
          positionMs <= 100 ||
          Math.abs(currentPositionMs - positionMs) <=
            POSITION_MATCH_TOLERANCE_MS;
        if (!isPlaying && positionMatches) {
          console.debug(
            "SyncPlay PlaybackCore: already paused at target position, skipping",
          );
          this.onNotifyOsd?.("pause");
          return;
        }
      }

      this.localPause();
      // Only seek if we have a valid position (not 0 or very small)
      if (positionMs > 100) {
        this.localSeek(positionMs);
      } else {
        console.log("SyncPlay PlaybackCore: skipping seek (no valid position)");
      }
      this.onNotifyOsd?.("pause");
    };

    if (pauseAtTimeLocal > currentTime) {
      const pauseTimeout = pauseAtTimeLocal.getTime() - currentTime.getTime();
      this.scheduledCommandTimeout = setTimeout(callback, pauseTimeout);
      console.log(
        `SyncPlay PlaybackCore: scheduled pause in ${pauseTimeout}ms`,
      );
    } else {
      console.log("SyncPlay PlaybackCore: immediate pause (past time)");
      callback();
    }
  }

  /**
   * Schedule a stop at a specific time
   */
  private scheduleStop(stopAtTime: Date): void {
    this.clearScheduledCommand();

    const currentTime = new Date();
    const stopAtTimeLocal = this.timeSyncCore.remoteDateToLocal(stopAtTime);

    const callback = () => {
      this.localStop();
    };

    if (stopAtTimeLocal > currentTime) {
      const stopTimeout = stopAtTimeLocal.getTime() - currentTime.getTime();
      this.scheduledCommandTimeout = setTimeout(callback, stopTimeout);
      console.debug(`SyncPlay: scheduled stop in ${stopTimeout}ms`);
    } else {
      callback();
      console.debug("SyncPlay: immediate stop");
    }
  }

  /**
   * Schedule a seek at a specific time.
   *
   * Flow (matches jellyfin-web): unpause -> seek -> wait for local "ready"
   * (player finished buffering at the new position) -> pause and report ready
   * to the server so the group can resume. This handles the common case
   * where the player must rebuffer after the seek.
   */
  private scheduleSeek(seekAtTime: Date, positionTicks: number): void {
    this.clearScheduledCommand();

    const currentTime = new Date();
    const seekAtTimeLocal = this.timeSyncCore.remoteDateToLocal(seekAtTime);
    const positionMs = ticksToMs(positionTicks);

    const callback = () => {
      this.localUnpause();
      this.localSeek(positionMs);
      this.onNotifyOsd?.("seek");

      // Wait for the local player to report ready ("onReady" fires this),
      // then pause and tell the server we're ready at the new position.
      waitForOwnEvent(this, "ready", WAIT_FOR_READY_TIMEOUT_MS)
        .then(() => {
          this.localPause();
          this.sendBufferingRequest(false);
        })
        .catch((error) => {
          console.warn(
            `SyncPlay: seek ready-wait timed out, seeking to ${positionMs}ms anyway`,
            error,
          );
          this.localSeek(positionMs);
        });
    };

    if (seekAtTimeLocal > currentTime) {
      const seekTimeout = seekAtTimeLocal.getTime() - currentTime.getTime();
      this.scheduledCommandTimeout = setTimeout(callback, seekTimeout);
      console.debug(`SyncPlay: scheduled seek in ${seekTimeout}ms`);
    } else {
      callback();
      console.debug("SyncPlay: immediate seek");
    }
  }

  /**
   * Clear scheduled command
   */
  private clearScheduledCommand(): void {
    if (this.scheduledCommandTimeout) {
      clearTimeout(this.scheduledCommandTimeout);
      this.scheduledCommandTimeout = null;
    }
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    this.syncEnabled = false;

    // Reset playback rate
    if (this.playerControls && this.playerControls.getSpeed() !== 1.0) {
      this.playerControls.setSpeed(1.0);
    }

    this.emit("syncing", false, "None");
  }

  // ============================================================================
  // Local Playback Control
  // ============================================================================

  private localUnpause(): void {
    this.playerControls?.play();
  }

  private localPause(): void {
    this.playerControls?.pause();
  }

  private localSeek(positionMs: number): void {
    console.log(`SyncPlay PlaybackCore: localSeek to ${positionMs}ms`);
    if (this.playerControls) {
      this.playerControls.seekTo(positionMs);
      console.log("SyncPlay PlaybackCore: seekTo called on playerControls");
    } else {
      console.error("SyncPlay PlaybackCore: NO PLAYER CONTROLS for seek!");
    }
  }

  private localStop(): void {
    this.playerControls?.pause();
  }

  // ============================================================================
  // Time Sync
  // ============================================================================

  /**
   * Estimate current position ticks given a past state
   */
  estimateCurrentTicks(
    ticks: number,
    when: Date,
    currentTime: Date = new Date(),
  ): number {
    const remoteTime = this.timeSyncCore.localDateToRemote(currentTime);
    return (
      ticks + (remoteTime.getTime() - when.getTime()) * TicksPerMillisecond
    );
  }

  /**
   * Sync playback time during playback
   */
  syncPlaybackTime(currentPositionMs: number): void {
    if (!this.playerControls || !this.lastCommand) return;

    // Only sync during unpause
    if (this.lastCommand.Command !== "Unpause" || this.isBuffering()) return;

    // Don't apply sync corrections if the active player isn't on the same
    // playlist item that the group is playing (e.g. user switched item
    // locally, or queue update in flight). Prevents seeking the wrong item.
    const currentItemId = this.getCurrentPlaylistItemId?.();
    if (
      currentItemId &&
      this.lastCommand.PlaylistItemId &&
      this.lastCommand.PlaylistItemId !== currentItemId
    ) {
      return;
    }

    const currentTime = new Date();
    const currentPositionTicks = msToTicks(currentPositionMs);
    const lastCommandWhen = this.lastCommand.When
      ? new Date(this.lastCommand.When)
      : new Date();

    // Estimate server position
    const serverPositionTicks = this.estimateCurrentTicks(
      this.lastCommand.PositionTicks ?? 0,
      lastCommandWhen,
      currentTime,
    );

    // Calculate difference
    const diffMillis =
      (serverPositionTicks - currentPositionTicks) / TicksPerMillisecond;
    this.playbackDiffMillis = diffMillis;

    this.emit("playback-diff", diffMillis);

    // Rate-limit sync attempts
    const elapsed = currentTime.getTime() - this.lastSyncTime.getTime();
    if (elapsed < this.maxDelaySpeedToSync / 2) return;

    this.lastSyncTime = currentTime;

    if (!this.syncEnabled || !this.enableSyncCorrection) return;

    const absDiffMillis = Math.abs(diffMillis);

    // SpeedToSync
    if (
      this.useSpeedToSync &&
      absDiffMillis >= this.minDelaySpeedToSync &&
      absDiffMillis < this.maxDelaySpeedToSync
    ) {
      let speedToSyncTime = this.speedToSyncDuration;

      // Prevent negative speed
      const MinSpeed = 0.2;
      if (diffMillis <= -speedToSyncTime * MinSpeed) {
        speedToSyncTime = Math.abs(diffMillis) / (1.0 - MinSpeed);
      }

      const speed = 1 + diffMillis / speedToSyncTime;

      if (speed > 0) {
        this.playerControls.setSpeed(speed);
        this.syncEnabled = false;
        this.syncAttempts++;
        this.emit("syncing", true, `SpeedToSync (x${speed.toFixed(2)})`);

        this.syncTimeout = setTimeout(() => {
          this.playerControls?.setSpeed(1.0);
          this.syncEnabled = true;
          this.emit("syncing", false, "None");
        }, speedToSyncTime);

        console.debug(`SyncPlay: SpeedToSync x${speed.toFixed(2)}`);
      }
    }
    // SkipToSync
    else if (this.useSkipToSync && absDiffMillis >= this.minDelaySkipToSync) {
      const serverPositionMs = ticksToMs(serverPositionTicks);
      this.localSeek(serverPositionMs);
      this.syncEnabled = false;
      this.syncAttempts++;
      this.emit("syncing", true, `SkipToSync (${this.syncAttempts})`);

      this.syncTimeout = setTimeout(() => {
        this.syncEnabled = true;
        this.emit("syncing", false, "None");
      }, this.maxDelaySpeedToSync / 2);

      console.debug(`SyncPlay: SkipToSync to ${serverPositionMs}ms`);
    } else {
      // Synced
      if (this.syncAttempts > 0) {
        console.debug(`SyncPlay: synced after ${this.syncAttempts} attempts`);
      }
      this.syncAttempts = 0;
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Reset PlaybackCore state — used when SyncPlay is disabled so we don't
   * carry stale commands, scheduled timers, or sync state into the next
   * session.
   */
  reset(): void {
    this.clearScheduledCommand();
    this.lastCommand = null;
    this.lastSyncTime = new Date();
    this.syncAttempts = 0;
    this.playbackDiffMillis = 0;
    this.playerIsBuffering = false;
    // Forget what we last told the server so the next session starts fresh.
    this.lastBufferingSent = null;
    this.inflightBufferingRequest = null;
    if (this.notifyBufferingTimeout) {
      clearTimeout(this.notifyBufferingTimeout);
      this.notifyBufferingTimeout = null;
    }
    // Drop a pending pause-before-ready flag so it can't leak into the
    // next group.
    this.pendingInitialPause = false;
  }

  /**
   * Destroy the playback core
   */
  destroy(): void {
    this.clearScheduledCommand();
    this.removeAllListeners();
    this.playerControls = null;
    this.onNotifyOsd = null;
    this.getCurrentPlaylistItemId = null;
  }
}
