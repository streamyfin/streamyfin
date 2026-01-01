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

  // Track previous state for comparison
  private lastTrackId: string | null = null;
  private lastIsPlaying: boolean = false;

  getViewId(): string {
    return "lockscreen-view";
  }

  onStateUpdate(state: AudioPlayerState): void {
    // Only update lockscreen if there's a current track
    if (!state.currentTrack) {
      this.lastTrackId = null;
      this.lastIsPlaying = false;
      MediaControls.clearNowPlaying();
      return;
    }

    // Check if we should force update (track changed or play/pause changed)
    const forceUpdate = this.shouldForceUpdate(state);

    // Throttle updates to avoid excessive calls (especially for position updates)
    const now = Date.now();
    const shouldUpdate =
      now - this.lastUpdateTime > this.UPDATE_THROTTLE_MS || forceUpdate;

    if (!shouldUpdate) {
      return;
    }

    this.lastUpdateTime = now;

    // Update tracked state
    this.lastTrackId = state.currentTrack.id;
    this.lastIsPlaying = state.isPlaying;

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
  private shouldForceUpdate(state: AudioPlayerState): boolean {
    const currentTrackId = state.currentTrack?.id ?? null;

    // Force update on track change
    if (currentTrackId !== this.lastTrackId) {
      return true;
    }

    // Force update on play/pause state change
    if (state.isPlaying !== this.lastIsPlaying) {
      return true;
    }

    return false;
  }

  /**
   * Clear lock screen controls
   */
  clear(): void {
    this.lastTrackId = null;
    this.lastIsPlaying = false;
    MediaControls.clearNowPlaying();
  }
}
