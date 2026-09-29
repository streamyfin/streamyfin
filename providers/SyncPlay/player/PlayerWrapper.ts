/**
 * PlayerWrapper — adapter between jellyfin's tick-based playerWrapper API
 * and our millisecond-based `PlayerControls`. Methods that have no RN
 * analog (queue mutation hooks) delegate to provider-supplied handlers
 * which navigate to the player screen.
 */

import { TicksPerMillisecond } from "../constants";
import type { PlayerControls } from "../types";
import { createBufferingDebouncer } from "./bufferingDebouncer";

/** Options passed to `playerWrapper.localPlay` — provider navigates to the player screen. */
export interface LocalPlayOptions {
  ids: (string | undefined)[];
  startPositionTicks: number;
  startIndex: number;
  serverId?: string;
}

export class PlayerWrapper {
  private controls: PlayerControls | null = null;
  private localPlayHandler:
    | ((options: LocalPlayOptions) => void | Promise<void>)
    | null = null;
  private setCurrentItemHandler:
    | ((playlistItemId: string | null) => void)
    | null = null;
  private bufferingEvents: ReturnType<typeof createBufferingDebouncer> | null =
    null;

  constructor(
    private readonly onBuffering: (buffering: boolean) => void = () => {},
  ) {}

  /** Attach / detach the underlying player. */
  bindToControls(controls: PlayerControls | null): void {
    if (this.controls === controls) return;
    this.bufferingEvents?.dispose();
    this.bufferingEvents = controls
      ? createBufferingDebouncer(this.onBuffering)
      : null;
    this.controls = controls;
  }

  notifyBuffering(buffering: boolean): void {
    this.bufferingEvents?.notify(buffering);
  }

  currentItemId(): string | null {
    return this.controls?.itemId ?? null;
  }

  isBuffering(): boolean {
    return this.controls?.isBuffering() ?? true;
  }

  /** Provider wires this to navigate to the player screen. */
  setLocalPlayHandler(
    handler: ((options: LocalPlayOptions) => void | Promise<void>) | null,
  ) {
    this.localPlayHandler = handler;
  }

  /** Provider wires this to navigate to a different queue item. */
  setLocalSetCurrentItemHandler(
    handler: ((playlistItemId: string | null) => void) | null,
  ) {
    this.setCurrentItemHandler = handler;
  }

  localUnpause(): void {
    this.controls?.play();
  }

  localPause(): void {
    this.controls?.pause();
  }

  /** Upstream takes ticks; RN's `seekTo` takes ms. */
  localSeek(positionTicks: number): void {
    this.controls?.seekTo(positionTicks / TicksPerMillisecond);
  }

  localStop(): void {
    this.controls?.stop();
  }

  /** Position in ms. */
  currentTime(): number {
    return this.controls?.getCurrentPosition() ?? 0;
  }

  isPlaying(): boolean {
    return this.controls?.isPlaying() ?? false;
  }

  isPlaybackActive(): boolean {
    return this.controls !== null;
  }

  localPlay(options: LocalPlayOptions): Promise<void> {
    const handler = this.localPlayHandler;
    if (!handler) {
      return Promise.reject(
        new Error("SyncPlay playback navigator is not registered"),
      );
    }
    return Promise.resolve().then(() => handler(options));
  }

  localSetCurrentPlaylistItem(playlistItemId: string | null): void {
    this.setCurrentItemHandler?.(playlistItemId);
  }
}
