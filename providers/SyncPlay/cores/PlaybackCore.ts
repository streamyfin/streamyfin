/**
 * SyncPlay PlaybackCore — schedules unpauses/pauses/seeks/stops to fire
 * at the precise group-wide moment and keeps the player drift-corrected.
 *
 * Design choices that diverge from jellyfin-web:
 *  - **No SpeedToSync**. Our RN players' `setPlaybackSpeed` is unreliable
 *    across platforms (mpv/VLC/expo-video each behave differently for
 *    fractional speeds). We always seek to catch up.
 *  - **No `MessageSyncPlayDuplicateMedia` detection**. Web's detection
 *    used HTML element identity; on RN we don't have a stable handle
 *    and the false-positive rate would be much higher than the value.
 *  - **No syncMethod / showSyncIcon**. We don't surface the sync
 *    technique to the UI.
 */

import type { Api } from "@jellyfin/sdk";
import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api";
import {
  TicksPerMillisecond,
  ticksToMs,
  WaitForPlayerEventTimeout,
} from "../constants";
import { EventEmitter, waitForEventOnce } from "../EventEmitter";
import type { SyncPlayManager } from "../Manager";
import { type SendCommand, SYNC_PLAY_TUNING } from "../types";

export class PlaybackCore extends EventEmitter {
  private manager!: SyncPlayManager;
  private lastCommand: SendCommand | null = null;
  private scheduledCommand: ReturnType<typeof setTimeout> | null = null;

  init(manager: SyncPlayManager): void {
    this.manager = manager;
  }

  /** Local "playback started" hook — fires the initial Ready request. */
  onPlaybackStart(apiClient: Api): void {
    try {
      const playerWrapper = this.manager.getPlayerWrapper();
      const positionMs = playerWrapper.currentTime();
      const positionTicks = Math.round(positionMs * TicksPerMillisecond);
      const isPlaying = playerWrapper.isPlaying();
      const playlistItemId =
        this.manager.getQueueCore().getCurrentPlaylistItemId() ?? undefined;
      const now = this.manager.getTimeSync().localDateToRemote(new Date());

      getSyncPlayApi(apiClient).syncPlayReady({
        readyRequestDto: {
          When: now.toISOString(),
          PositionTicks: positionTicks,
          IsPlaying: isPlaying,
          PlaylistItemId: playlistItemId,
        },
      });
    } catch (error) {
      console.error("SyncPlay onPlaybackStart:", error);
    }
  }

  /** Local pause → tell the server. */
  onPause(apiClient: Api): void {
    try {
      getSyncPlayApi(apiClient).syncPlayPause();
    } catch (error) {
      console.error("SyncPlay onPause:", error);
    }
  }

  /** Local unpause → tell the server. */
  onUnpause(apiClient: Api): void {
    try {
      getSyncPlayApi(apiClient).syncPlayUnpause();
    } catch (error) {
      console.error("SyncPlay onUnpause:", error);
    }
  }

  /** Local "ready" hook — server uses this to know we've finished buffering. */
  onReady(apiClient: Api): void {
    this.sendBufferingRequest(apiClient, false);
  }

  /** Local "buffering" hook — server uses this to (optionally) pause the group. */
  onBuffering(apiClient: Api): void {
    this.sendBufferingRequest(apiClient, true);
  }

  /** Send a Ready or Buffering request. */
  sendBufferingRequest(apiClient: Api, isBuffering: boolean): void {
    const playerWrapper = this.manager.getPlayerWrapper();
    const positionMs = playerWrapper.currentTime();
    const positionTicks = Math.round(positionMs * TicksPerMillisecond);
    const isPlaying = playerWrapper.isPlaying();
    const playlistItemId =
      this.manager.getQueueCore().getCurrentPlaylistItemId() ?? undefined;
    const now = this.manager.getTimeSync().localDateToRemote(new Date());

    try {
      if (isBuffering) {
        getSyncPlayApi(apiClient).syncPlayBuffering({
          bufferRequestDto: {
            When: now.toISOString(),
            PositionTicks: positionTicks,
            IsPlaying: isPlaying,
            PlaylistItemId: playlistItemId,
          },
        });
      } else {
        getSyncPlayApi(apiClient).syncPlayReady({
          readyRequestDto: {
            When: now.toISOString(),
            PositionTicks: positionTicks,
            IsPlaying: isPlaying,
            PlaylistItemId: playlistItemId,
          },
        });
      }
    } catch (error) {
      console.error("SyncPlay sendBufferingRequest:", error);
    }
  }

  /**
   * Apply a group command (Unpause, Pause, Stop, Seek). Times the
   * execution to fire at the group-wide instant the server selected.
   */
  applyCommand(command: SendCommand): void {
    (command as unknown as { EmittedAt: Date }).EmittedAt = new Date(
      command.EmittedAt as unknown as string,
    );
    (command as unknown as { When: Date }).When = new Date(
      command.When as unknown as string,
    );

    if (
      this.lastCommand &&
      ((
        this.lastCommand as unknown as { EmittedAt: Date }
      ).EmittedAt.getTime() >
        (command as unknown as { EmittedAt: Date }).EmittedAt.getTime() ||
        (this.lastCommand as unknown as { When: Date }).When.getTime() >
          (command as unknown as { When: Date }).When.getTime())
    ) {
      // NOTE: strict `>` (not `>=`) on EmittedAt — Jellyfin's server timestamps
      // commands at sub-ms precision but JS `Date` truncates to ms, so two
      // commands emitted within the same millisecond would otherwise be
      // rejected as "outdated" and silently dropped. This produced an
      // unbreakable pause/unpause loop where every fresh command was
      // discarded. Matches jellyfin-web's check in
      // `web/src/plugins/syncPlay/core/Manager.js`.
      console.debug(
        "SyncPlay applyCommand: dropping outdated command",
        command,
      );
      return;
    }

    this.lastCommand = command;
    if (!this.manager.isFollowingGroupPlayback()) {
      console.debug(
        "SyncPlay applyCommand: dropping command (not following playback)",
        command,
      );
      return;
    }

    const playerWrapper = this.manager.getPlayerWrapper();
    if (!playerWrapper.isPlaybackActive()) {
      console.debug(
        "SyncPlay applyCommand: dropping command (playback not active)",
        command,
      );
      return;
    }

    const enqueuedAt = new Date();
    const remoteEnqueuedAt = this.manager
      .getTimeSync()
      .localDateToRemote(enqueuedAt);
    const localCommandWhen = this.manager
      .getTimeSync()
      .remoteDateToLocal(command.When as unknown as Date);

    switch (command.Command) {
      case "Unpause":
        this.scheduleUnpause(localCommandWhen, command.PositionTicks ?? 0);
        this.emit("osd", "unpause");
        break;
      case "Pause":
        this.schedulePause(localCommandWhen, command.PositionTicks ?? 0);
        this.emit("osd", "pause");
        break;
      case "Stop":
        this.scheduleStop(localCommandWhen);
        break;
      case "Seek":
        this.scheduleSeek(localCommandWhen, command.PositionTicks ?? 0);
        this.emit("osd", "seek");
        break;
      default:
        console.warn("SyncPlay applyCommand: unknown command", command);
        break;
    }

    if (
      (command as unknown as { When: Date }).When.getTime() <
      remoteEnqueuedAt.getTime()
    ) {
      console.debug(
        "SyncPlay applyCommand: command was scheduled for the past",
        command,
      );
    }
  }

  /** Pre-Unpause hook: emit a wait OSD while we wait for the moment. */
  scheduleUnpause(when: Date, positionTicks: number): void {
    this.clearScheduledCommand();
    const now = Date.now();
    const playAtTime = when.getTime();
    const currentPositionMs = this.manager.getPlayerWrapper().currentTime();
    const currentPositionTicks = Math.round(
      currentPositionMs * TicksPerMillisecond,
    );

    if (playAtTime > now) {
      // Future: seek now, then play at the right moment.
      this.localSeek(positionTicks);
      this.scheduledCommand = setTimeout(() => {
        this.localUnpause();
        // After playback resumes, the player position will need a
        // small bump to land on the group target. waitForPlayerEvent
        // is best-effort.
        waitForEventOnce(
          this.manager,
          "unpause",
          WaitForPlayerEventTimeout,
        ).catch(() => undefined);
      }, playAtTime - now);
      this.emit("osd", "wait-unpause");
    } else {
      // Past: catch up now.
      const targetMs = ticksToMs(positionTicks);
      const delayMs = now - playAtTime;
      this.localSeek(Math.round((targetMs + delayMs) * TicksPerMillisecond));
      this.localUnpause();
      void currentPositionTicks;
    }
  }

  schedulePause(when: Date, positionTicks: number): void {
    this.clearScheduledCommand();
    const now = Date.now();
    const pauseAtTime = when.getTime();

    const callback = () => {
      this.localUnpause();
      this.localSeek(positionTicks);
      this.localPause();
    };

    if (pauseAtTime > now) {
      this.scheduledCommand = setTimeout(callback, pauseAtTime - now);
      this.emit("osd", "wait-pause");
    } else {
      callback();
    }
  }

  scheduleStop(when: Date): void {
    this.clearScheduledCommand();
    const now = Date.now();
    const stopAtTime = when.getTime();
    if (stopAtTime > now) {
      this.scheduledCommand = setTimeout(() => {
        this.localStop();
      }, stopAtTime - now);
    } else {
      this.localStop();
    }
  }

  scheduleSeek(when: Date, positionTicks: number): void {
    this.applyCommand({
      ...this.lastCommand!,
      Command: "Pause",
      PositionTicks: positionTicks,
      When: when as unknown as string,
      EmittedAt: new Date().toISOString(),
    });
  }

  clearScheduledCommand(): void {
    if (this.scheduledCommand) {
      clearTimeout(this.scheduledCommand);
      this.scheduledCommand = null;
    }
  }

  // -- local player ops ------------------------------------------------------

  localUnpause(): void {
    this.manager.getPlayerWrapper().localUnpause();
  }

  localPause(): void {
    this.manager.getPlayerWrapper().localPause();
  }

  localSeek(positionTicks: number): void {
    this.manager.getPlayerWrapper().localSeek(positionTicks);
  }

  localStop(): void {
    this.manager.getPlayerWrapper().localStop();
  }

  // -- queries ---------------------------------------------------------------

  getLastCommand(): SendCommand | null {
    return this.lastCommand;
  }

  /**
   * Estimate where the group should be in ticks, given a known
   * starting position and the time the position was valid at.
   */
  estimateCurrentTicks(positionTicks: number, when: Date): number {
    const lastCommand = this.lastCommand;
    if (!lastCommand) return positionTicks;
    const remoteNow = this.manager.getTimeSync().localDateToRemote(new Date());
    const elapsedMs = remoteNow.getTime() - when.getTime();
    if (lastCommand.Command === "Unpause") {
      return positionTicks + elapsedMs * TicksPerMillisecond;
    }
    return positionTicks;
  }

  /**
   * Drift correction tick — called on every player time update. Skips
   * to the group's expected position if drift exceeds the threshold.
   * SpeedToSync is intentionally not implemented (see file header).
   */
  syncPlaybackTime(): void {
    const lastCommand = this.lastCommand;
    if (lastCommand?.Command !== "Unpause") return;

    const playerWrapper = this.manager.getPlayerWrapper();
    if (!playerWrapper.isPlaying()) return;

    const currentMs = playerWrapper.currentTime();
    const expectedTicks = this.estimateCurrentTicks(
      lastCommand.PositionTicks ?? 0,
      lastCommand.When as unknown as Date,
    );
    const expectedMs = ticksToMs(expectedTicks);
    const driftMs = Math.abs(currentMs - expectedMs);

    if (driftMs > SYNC_PLAY_TUNING.minDelaySkipToSync) {
      console.log(
        `SyncPlay syncPlaybackTime: drift ${driftMs.toFixed(
          0,
        )}ms exceeds threshold, seeking to ${expectedMs.toFixed(0)}ms`,
      );
      this.localSeek(expectedTicks);
    }
  }

  // -- teardown --------------------------------------------------------------

  destroy(): void {
    this.clearScheduledCommand();
    this.lastCommand = null;
    this.removeAllListeners();
  }
}

export default PlaybackCore;
