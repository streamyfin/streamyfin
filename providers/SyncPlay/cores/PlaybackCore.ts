import type { ReadyRequestDto } from "@jellyfin/sdk/lib/generated-client";
import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api";
import { SYNC_PLAY_TUNING } from "@/constants/SyncPlay";
import { msToTicks, ticksToMs } from "../constants";
import {
  EventEmitter,
  EventWaitTimeoutError,
  throwIfAborted,
  waitForEventOnce,
} from "../EventEmitter";
import type { SyncPlayManager } from "../Manager";
import type { PlaybackCommand } from "../types";

/**
 * Implements jellyfin-web's command/event contract, not browser workarounds:
 * Pause waits for pause, Seek waits for ready then pauses, and Unpause uses
 * server time. Every continuation belongs to a cancellable command.
 * Continuous drift correction stays off, matching upstream's default.
 */
export class PlaybackCore extends EventEmitter {
  private manager!: SyncPlayManager;
  private lastCommand: PlaybackCommand | null = null;
  private operation: AbortController | null = null;
  private seeking = false;
  private requestedPlaying: boolean | null = null;

  init(manager: SyncPlayManager): void {
    this.manager = manager;
  }

  onPlaybackStart(): void {
    this.manager.emit("playbackstart");
  }

  onPause(): void {
    this.manager.emit("pause");
  }

  onUnpause(): void {
    this.manager.emit("unpause");
  }

  onReady(): void {
    this.manager.emit("ready");
    // The Seek handshake reports readiness after its final pause, not
    // while the decoder is briefly running to finish the seek.
    if (!this.seeking && !this.manager.isPreparingPlayback()) {
      this.sendReport(false);
    }
  }

  onBuffering(): void {
    this.manager.emit("buffering");
    this.sendReport(true);
  }

  private sendReport(buffering: boolean): void {
    void this.reportBuffering(buffering).catch((error) => {
      console.error("SyncPlay readiness report failed", error);
    });
  }

  async reportBuffering(isBuffering: boolean): Promise<void> {
    if (!this.manager.canControlCurrentItem()) return;
    const player = this.manager.getPlayerWrapper();
    const request: ReadyRequestDto = {
      When: this.manager
        .getTimeSync()
        .localDateToRemote(new Date())
        .toISOString(),
      PositionTicks: msToTicks(player.currentTime()),
      IsPlaying: player.isPlaying(),
      PlaylistItemId:
        this.manager.getQueueCore().getCurrentPlaylistItemId() ?? undefined,
    };
    const api = getSyncPlayApi(this.manager.getApiClient());
    if (isBuffering) {
      await api.syncPlayBuffering({ bufferRequestDto: request });
    } else {
      await api.syncPlayReady({ readyRequestDto: request });
    }
  }

  /** Queue startup owns its own pause/Ready handshake, once per media load. */
  async preparePlayback(signal: AbortSignal): Promise<void> {
    await this.changePlaying(false, signal);
    throwIfAborted(signal);
    await this.reportBuffering(false);
  }

  applyCommand(command: PlaybackCommand): void {
    const positionTicks = command.PositionTicks ?? 0;
    const duplicate =
      this.lastCommand?.Command === command.Command &&
      Date.parse(this.lastCommand.When) === Date.parse(command.When) &&
      this.lastCommand.PositionTicks === command.PositionTicks &&
      this.lastCommand.PlaylistItemId === command.PlaylistItemId;
    const player = this.manager.getPlayerWrapper();

    if (duplicate) {
      if (this.operation) return;
      const atTarget =
        Math.abs(player.currentTime() - ticksToMs(positionTicks)) <=
        SYNC_PLAY_TUNING.commandPositionToleranceMs;
      if (command.Command === "Unpause" && player.isPlaying()) return;
      if (command.Command === "Pause" && !player.isPlaying() && atTarget)
        return;
      if (
        command.Command === "Seek" &&
        !player.isPlaying() &&
        atTarget &&
        !player.isBuffering()
      ) {
        // A duplicate Seek may be the server retrying an unacknowledged Ready.
        this.sendReport(false);
        return;
      }
    }

    this.lastCommand = command;
    this.clearScheduledCommand();
    const operation = new AbortController();
    this.operation = operation;
    void this.execute(command, operation.signal)
      .catch((error) => {
        if (operation.signal.aborted) return;
        console.error(`SyncPlay ${command.Command} failed`, error);
        this.manager.emit("toast", "MessageSyncPlayErrorMedia");
      })
      .finally(() => {
        if (this.operation !== operation) return;
        this.operation = null;
        this.seeking = false;
      });
  }

  private async execute(
    command: PlaybackCommand,
    signal: AbortSignal,
  ): Promise<void> {
    const when = new Date(command.When);
    const positionTicks = command.PositionTicks ?? 0;
    const localWhen = this.manager.getTimeSync().remoteDateToLocal(when);
    const player = this.manager.getPlayerWrapper();
    const future = localWhen.getTime() > Date.now();

    if (command.Command === "Unpause" && future) {
      // Do not seek on every scheduled resume: MPV reports loading for seeks.
      if (
        Math.abs(player.currentTime() - ticksToMs(positionTicks)) >
        SYNC_PLAY_TUNING.minDelaySkipToSync
      ) {
        player.localSeek(positionTicks);
      }
      this.emit("osd", "schedule-play");
    } else if (command.Command === "Pause" && future) {
      this.emit("osd", "wait-pause");
    }

    await this.waitUntil(localWhen, signal);
    throwIfAborted(signal);
    switch (command.Command) {
      case "Unpause":
        await this.changePlaying(true, signal);
        if (!future) {
          const target = this.estimateCurrentTicks(positionTicks, when);
          if (
            Math.abs(player.currentTime() - ticksToMs(target)) >
            SYNC_PLAY_TUNING.minDelaySkipToSync
          ) {
            player.localSeek(target);
          }
        }
        this.emit("osd", "unpause");
        break;
      case "Pause":
        await this.changePlaying(false, signal);
        throwIfAborted(signal);
        player.localSeek(positionTicks);
        this.emit("osd", "pause");
        break;
      case "Seek": {
        this.seeking = true;
        this.emit("osd", "seek");
        await this.changePlaying(true, signal);
        throwIfAborted(signal);
        const ready = waitForEventOnce(
          this.manager,
          "ready",
          SYNC_PLAY_TUNING.seekReadyTimeoutMs,
          ["playbackerror"],
          signal,
        );
        player.localSeek(positionTicks);
        await ready;
        throwIfAborted(signal);
        await this.changePlaying(false, signal);
        throwIfAborted(signal);
        await this.reportBuffering(false);
        this.emit("osd", "pause");
        break;
      }
      case "Stop":
        player.localStop();
        break;
    }
  }

  private async changePlaying(
    playing: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    const player = this.manager.getPlayerWrapper();
    // A superseded native command may still be queued on the main thread.
    // Send the new intent even when the last event snapshot already matches.
    if (player.isPlaying() === playing && this.requestedPlaying === null)
      return;
    const event = playing ? "unpause" : "pause";
    const changed = waitForEventOnce(
      this.manager,
      event,
      SYNC_PLAY_TUNING.playerEventTimeoutMs,
      ["playbackerror"],
      signal,
    );
    this.requestedPlaying = playing;
    if (playing) player.localUnpause();
    else player.localPause();
    try {
      await changed;
    } catch (error) {
      // Native can already be in the requested state without another edge.
      if (
        !(error instanceof EventWaitTimeoutError) ||
        player.isPlaying() !== playing
      ) {
        throw error;
      }
    }
    throwIfAborted(signal);
    if (this.requestedPlaying === playing) this.requestedPlaying = null;
  }

  private waitUntil(when: Date, signal: AbortSignal): Promise<void> {
    const delay = when.getTime() - Date.now();
    if (delay <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("SyncPlay operation cancelled"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, delay);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  clearScheduledCommand(): void {
    this.operation?.abort();
    this.operation = null;
    this.seeking = false;
  }

  reset(): void {
    this.clearScheduledCommand();
    this.lastCommand = null;
    this.requestedPlaying = null;
  }

  estimateCurrentTicks(positionTicks: number, when: Date): number {
    const remoteNow = this.manager.getTimeSync().localDateToRemote(new Date());
    return Math.max(
      0,
      positionTicks + msToTicks(remoteNow.getTime() - when.getTime()),
    );
  }

  destroy(): void {
    this.reset();
    this.removeAllListeners();
  }
}

export default PlaybackCore;
