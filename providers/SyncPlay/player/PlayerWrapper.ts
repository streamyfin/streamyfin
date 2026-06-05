/**
 * PlayerWrapper — adapter between jellyfin's tick-based playerWrapper API
 * and our millisecond-based `PlayerControls`. Methods that have no RN
 * analog (queue mutation hooks) delegate to provider-supplied handlers
 * which navigate to the player screen.
 */

import { TicksPerMillisecond } from "../constants";
import type { PlayerControls } from "../types";

/** Options passed to `playerWrapper.localPlay` — provider navigates to the player screen. */
export interface LocalPlayOptions {
  ids: (string | undefined)[];
  startPositionTicks: number;
  startIndex: number;
  serverId?: string;
}

export class PlayerWrapper {
  private controls: PlayerControls | null = null;
  private localPlayHandler: ((options: LocalPlayOptions) => void) | null = null;
  private setCurrentItemHandler:
    | ((playlistItemId: string | null) => void)
    | null = null;

  /** Attach / detach the underlying player. */
  bindToControls(controls: PlayerControls | null): void {
    this.controls = controls;
  }

  /** Provider wires this to navigate to the player screen. */
  setLocalPlayHandler(handler: ((options: LocalPlayOptions) => void) | null) {
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

  /** RN: pause instead of teardown — leaving the player screen is the navigator's job. */
  localStop(): void {
    this.controls?.pause();
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

  /** RN never runs as a remote-managed player. */
  isRemote(): boolean {
    return false;
  }

  localPlay(options: LocalPlayOptions): Promise<void> {
    this.localPlayHandler?.(options);
    return Promise.resolve();
  }

  localSetCurrentPlaylistItem(playlistItemId: string | null): void {
    this.setCurrentItemHandler?.(playlistItemId);
  }
}
