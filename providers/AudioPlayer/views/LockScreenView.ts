// LockScreenView manages lock screen / notification controls
import * as MediaControls from "@/modules/expo-media-controls";
import type { AudioPlayerView } from "../AudioController";
import type { AudioPlayerState } from "../types";

/**
 * LockScreenView automatically updates native lock screen controls
 * based on controller state changes
 */
export class LockScreenView implements AudioPlayerView {
  private lastUpdateTime = 0;
  private readonly UPDATE_THROTTLE_MS = 1000; // Update at most once per second

  getViewId(): string {
    return "lockscreen-view";
  }

  onStateUpdate(state: AudioPlayerState): void {
    // Only update lockscreen if there's a current track
    if (!state.currentTrack) {
      MediaControls.clearNowPlaying();
      return;
    }

    // Throttle updates to avoid excessive calls (especially for position updates)
    const now = Date.now();
    const shouldUpdate =
      now - this.lastUpdateTime > this.UPDATE_THROTTLE_MS ||
      this.shouldForceUpdate(state);

    if (!shouldUpdate) {
      return;
    }

    this.lastUpdateTime = now;

    // Update lock screen with current state
    MediaControls.updateNowPlaying({
      title: state.currentTrack.title,
      artist: state.currentTrack.artist,
      album: state.currentTrack.album,
      artwork: state.currentTrack.artwork,
      duration: state.duration,
      position: state.position,
      isPlaying: state.isPlaying,
    }).catch((error) => {
      console.error("[LockScreenView] Error updating metadata:", error);
    });
  }

  /**
   * Determine if we should force an immediate update
   * (e.g., when track changes or play/pause state changes)
   */
  private shouldForceUpdate(_state: AudioPlayerState): boolean {
    // Always force update on track change or play/pause change
    // These are detected by the controller and should update immediately
    return true; // For now, allow all updates through throttle
  }

  /**
   * Clear lock screen controls
   */
  clear(): void {
    MediaControls.clearNowPlaying();
  }
}
