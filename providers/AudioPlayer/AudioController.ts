// AudioController orchestrates audio playback, player lifecycle, and view updates
import type { Api } from "@jellyfin/sdk";
import { getAudioDownloadsDatabase, incrementPlayCount } from "./database";
import type { PlaybackStatus } from "./player.types";
import type { BaseAudioPlayer, PlayerType } from "./players/BaseAudioPlayer";
import { createPlayer, type PlayerConfig } from "./players/PlayerFactory";
import type { AudioPlayerState, AudioTrack, RepeatMode } from "./types";

/**
 * View interface for UI components
 * Views receive updates from the controller
 */
export interface AudioPlayerView {
  getViewId(): string;
  onStateUpdate(state: AudioPlayerState): void;
}

/**
 * Controller state machine states
 * - idle: No track loaded, player ready
 * - loading: Loading a track
 * - playing: Actively playing audio
 * - paused: Track loaded but paused
 * - switching: Switching between player types (streaming/local/remote)
 */
type ControllerState = "idle" | "loading" | "playing" | "paused" | "switching";

/**
 * AudioController manages the audio player lifecycle and coordinates view updates
 * Uses a state machine pattern to prevent race conditions and invalid states
 */
export class AudioController {
  private currentPlayer: BaseAudioPlayer;
  private playerType: PlayerType;
  private api: Api | null = null;

  // State machine
  private controllerState: ControllerState = "idle";
  private pendingCommands: Array<{
    command: () => Promise<void>;
    tag?: string;
  }> = [];

  // Playback state (exposed to views)
  private state: AudioPlayerState = {
    currentTrack: null,
    queue: [],
    queueIndex: 0,
    isPlaying: false,
    position: 0,
    duration: 0,
    bufferedPosition: 0,
    isBuffering: false,
    repeatMode: "off",
    shuffleEnabled: false,
    isReady: false,
    remoteSessionId: null,
  };

  private views: Map<string, AudioPlayerView> = new Map();
  private originalQueue: AudioTrack[] = []; // For shuffle/unshuffle

  constructor(api: Api | null) {
    this.api = api;
    this.playerType = "streaming";
    this.currentPlayer = createPlayer("streaming", { api: api || undefined });
  }

  // ==================== State Machine Helpers ====================

  /**
   * Check if an operation can be performed in current state
   */
  private canPerformOperation(
    allowedStates: ControllerState[],
    operation: string,
  ): boolean {
    if (allowedStates.includes(this.controllerState)) {
      return true;
    }
    console.log(
      `[AudioController] ${operation} blocked - current state: ${this.controllerState}`,
    );
    return false;
  }

  /**
   * Queue a command to be executed after current operation completes
   * @param command The command function to execute
   * @param tag Optional tag for filtering/replacing commands (e.g., "skipToIndex")
   */
  private queueCommand(command: () => Promise<void>, tag?: string): void {
    console.log(
      `[AudioController] Queuing command for after ${this.controllerState}${tag ? ` (tag: ${tag})` : ""}`,
    );
    this.pendingCommands.push({ command, tag });
  }

  /**
   * Remove pending commands with a specific tag
   */
  private removePendingCommandsByTag(tag: string): void {
    this.pendingCommands = this.pendingCommands.filter(
      (cmd) => cmd.tag !== tag,
    );
  }

  /**
   * Execute any pending commands
   */
  private async executePendingCommands(): Promise<void> {
    const commands = [...this.pendingCommands];
    this.pendingCommands = [];
    for (const cmd of commands) {
      await cmd.command();
    }
  }

  /**
   * Transition to a new state
   */
  private transition(newState: ControllerState): void {
    console.log(
      `[AudioController] State: ${this.controllerState} -> ${newState}`,
    );
    this.controllerState = newState;
  }

  // ==================== Initialization ====================

  /**
   * Initialize the controller and underlying player
   */
  async initialize(): Promise<void> {
    await this.currentPlayer.initialize();
    this.state.isReady = true;
    this.notifyViews();
  }

  // ==================== View Management ====================

  /**
   * Register a view to receive updates
   */
  registerView(view: AudioPlayerView): void {
    this.views.set(view.getViewId(), view);
    view.onStateUpdate(this.state);
  }

  /**
   * Unregister a view
   */
  unregisterView(viewId: string): void {
    this.views.delete(viewId);
  }

  /**
   * Notify all views of state update
   */
  private notifyViews(): void {
    const stateCopy = { ...this.state };
    this.views.forEach((view) => {
      view.onStateUpdate(stateCopy);
    });
  }

  // ==================== State Getters ====================

  getState(): AudioPlayerState {
    return { ...this.state };
  }

  getPlayerType(): PlayerType {
    return this.playerType;
  }

  getControllerState(): ControllerState {
    return this.controllerState;
  }

  // ==================== Player Switching ====================

  /**
   * Switch to a different player type
   */
  async switchPlayer(type: PlayerType, sessionId?: string): Promise<void> {
    if (this.controllerState === "switching") {
      console.warn("[AudioController] Already switching players");
      return;
    }

    this.transition("switching");

    try {
      console.log(
        `[AudioController] Switching player from ${this.playerType} to ${type}`,
      );

      const playerState = await this.currentPlayer.suspend();
      await this.currentPlayer.destroy();

      const config: PlayerConfig = {
        api: this.api || undefined,
        sessionId,
      };
      this.currentPlayer = createPlayer(type, config);
      this.playerType = type;

      await this.currentPlayer.initialize();

      // Set callback BEFORE resume to avoid race condition where player
      // starts polling/updating before callback is set
      if (
        "setCallback" in this.currentPlayer &&
        typeof this.currentPlayer.setCallback === "function"
      ) {
        (this.currentPlayer as any).setCallback(
          this.handlePlaybackStatus.bind(this),
        );
      }

      if (
        "updateQueue" in this.currentPlayer &&
        typeof this.currentPlayer.updateQueue === "function"
      ) {
        (this.currentPlayer as any).updateQueue(
          this.state.queue,
          this.state.queueIndex,
        );
      }

      await this.currentPlayer.resume(playerState);

      this.state.remoteSessionId = type === "remote" ? sessionId || null : null;
      this.notifyViews();
    } catch (error) {
      console.error("[AudioController] Error switching player:", error);
      throw error;
    } finally {
      // Restore to appropriate state based on what we were doing
      if (this.state.isPlaying) {
        this.transition("playing");
      } else if (this.state.currentTrack) {
        this.transition("paused");
      } else {
        this.transition("idle");
      }
      await this.executePendingCommands();
    }
  }

  /**
   * Auto-select the best player type based on track availability
   */
  private async autoSelectPlayer(): Promise<void> {
    if (this.playerType === "remote") {
      return; // Don't auto-switch away from remote
    }

    if (!this.state.currentTrack) {
      return;
    }

    const db = getAudioDownloadsDatabase();
    const trackId = this.state.currentTrack.jellyfinItem.Id || "";

    // Check if track is downloaded AND has a valid file path
    // This prevents switching to local player for incomplete downloads
    let downloadedTrack =
      db.tracks[trackId] ||
      Object.values(db.albums)
        .map((album) => album.tracks[trackId])
        .find(Boolean);

    // Also check artist album tracks
    if (!downloadedTrack) {
      for (const artist of Object.values(db.artists)) {
        for (const album of Object.values(artist.albums)) {
          if (album.tracks[trackId]) {
            downloadedTrack = album.tracks[trackId];
            break;
          }
        }
        if (downloadedTrack) break;
      }
    }

    const isDownloadedAndReady = !!downloadedTrack?.audioFilePath;

    const targetType: PlayerType = isDownloadedAndReady ? "local" : "streaming";

    if (this.playerType !== targetType) {
      console.log(
        `[AudioController] Auto-selecting ${targetType} player for track`,
      );
      await this.switchPlayer(targetType);
    }
  }

  // ==================== Playback Control ====================

  /**
   * Load and play a single track
   */
  async playTrack(track: AudioTrack): Promise<void> {
    await this.playTracks([track], 0);
  }

  /**
   * Load and play a queue of tracks
   */
  async playTracks(
    tracks: AudioTrack[],
    startIndex: number = 0,
  ): Promise<void> {
    // Queue if switching
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.playTracks(tracks, startIndex));
      return;
    }

    this.transition("loading");

    try {
      console.log(
        `[AudioController] Playing ${tracks.length} tracks starting at ${startIndex}`,
      );

      this.state.queue = tracks;
      this.state.queueIndex = startIndex;
      this.state.currentTrack = tracks[startIndex];
      this.originalQueue = [...tracks];

      await this.autoSelectPlayer();

      if (
        "updateQueue" in this.currentPlayer &&
        typeof this.currentPlayer.updateQueue === "function"
      ) {
        (this.currentPlayer as any).updateQueue(
          this.state.queue,
          this.state.queueIndex,
        );
      }

      await this.currentPlayer.loadTrack(
        this.state.currentTrack,
        this.handlePlaybackStatus.bind(this),
      );

      await this.currentPlayer.play();
      this.state.isPlaying = true;
      this.transition("playing");
      this.notifyViews();
    } catch (error) {
      console.error("[AudioController] Error playing tracks:", error);
      this.transition("idle");
      throw error;
    }
  }

  /**
   * Play (resume playback)
   */
  async play(): Promise<void> {
    if (
      this.controllerState === "switching" ||
      this.controllerState === "loading"
    ) {
      this.queueCommand(() => this.play());
      return;
    }

    if (!this.canPerformOperation(["paused", "idle", "playing"], "play")) {
      return;
    }

    try {
      await this.currentPlayer.play();
      this.state.isPlaying = true;
      this.transition("playing");
      this.notifyViews();
    } catch (error) {
      console.error("[AudioController] Error playing:", error);
      // Don't change state if play failed
      this.notifyViews();
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (
      this.controllerState === "switching" ||
      this.controllerState === "loading"
    ) {
      this.queueCommand(() => this.pause());
      return;
    }

    if (!this.canPerformOperation(["playing"], "pause")) {
      return;
    }

    try {
      await this.currentPlayer.pause();
      this.state.isPlaying = false;
      this.transition("paused");
      this.notifyViews();
    } catch (error) {
      console.error("[AudioController] Error pausing:", error);
      // Don't change state if pause failed
      this.notifyViews();
    }
  }

  /**
   * Toggle play/pause
   */
  async togglePlayPause(): Promise<void> {
    if (this.controllerState === "playing") {
      await this.pause();
    } else if (
      this.controllerState === "paused" ||
      this.controllerState === "idle"
    ) {
      await this.play();
    }
  }

  /**
   * Stop playback and clear current track
   */
  async stop(): Promise<void> {
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.stop());
      return;
    }

    try {
      await this.currentPlayer.stop();
    } catch (error) {
      console.error("[AudioController] Error stopping:", error);
      // Continue with state cleanup even if stop failed
    }
    this.state.isPlaying = false;
    this.state.currentTrack = null;
    this.transition("idle");
    this.notifyViews();
  }

  /**
   * Seek to position (seconds)
   */
  async seekTo(position: number): Promise<void> {
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.seekTo(position));
      return;
    }

    if (!this.canPerformOperation(["playing", "paused"], "seekTo")) {
      return;
    }

    try {
      await this.currentPlayer.seekTo(position);
      this.state.position = position;
      this.notifyViews();
    } catch (error) {
      console.error("[AudioController] Error seeking:", error);
      // Don't update position if seek failed
    }
  }

  /**
   * Skip forward by 15 seconds
   */
  async skipForward(): Promise<void> {
    await this.seekTo(this.state.position + 15);
  }

  /**
   * Skip backward by 15 seconds
   */
  async skipBackward(): Promise<void> {
    await this.seekTo(Math.max(0, this.state.position - 15));
  }

  // ==================== Track Navigation ====================

  /**
   * Skip to next track
   */
  async skipToNext(): Promise<void> {
    // For remote playback, use the player's native skip method if available
    // This is much faster than loadTrack() and doesn't block on waiting for track load
    if (
      this.playerType === "remote" &&
      "skipToNext" in this.currentPlayer &&
      typeof this.currentPlayer.skipToNext === "function"
    ) {
      try {
        await (this.currentPlayer as any).skipToNext();
        // The polling will detect the track change and update state
        return;
      } catch (error) {
        console.error(
          "[AudioController] Remote skip failed, falling back to skipToIndex:",
          error,
        );
        // Fall through to regular skipToIndex
      }
    }

    if (this.state.repeatMode === "album") {
      // Album repeat: find next track from same album, or loop to first album track
      const currentAlbumId = this.state.currentTrack?.jellyfinItem.AlbumId;
      if (currentAlbumId) {
        // Find all indices of tracks from this album
        const albumTrackIndices = this.state.queue
          .map((track, index) =>
            track.jellyfinItem.AlbumId === currentAlbumId ? index : -1,
          )
          .filter((index) => index !== -1);

        if (albumTrackIndices.length > 0) {
          // Find current position within album tracks
          const currentAlbumPosition = albumTrackIndices.indexOf(
            this.state.queueIndex,
          );

          if (
            currentAlbumPosition >= 0 &&
            currentAlbumPosition < albumTrackIndices.length - 1
          ) {
            // Go to next album track
            await this.skipToIndex(albumTrackIndices[currentAlbumPosition + 1]);
            return;
          } else {
            // Loop to first album track
            await this.skipToIndex(albumTrackIndices[0]);
            return;
          }
        }
      }
      // Fallback: treat like "all" repeat if no album info
      if (this.state.queueIndex >= this.state.queue.length - 1) {
        await this.skipToIndex(0);
      } else {
        await this.skipToIndex(this.state.queueIndex + 1);
      }
    } else if (this.state.queueIndex >= this.state.queue.length - 1) {
      if (this.state.repeatMode === "all") {
        await this.skipToIndex(0);
      } else {
        await this.stop();
      }
    } else {
      await this.skipToIndex(this.state.queueIndex + 1);
    }
  }

  /**
   * Skip to previous track (or restart if > 3 seconds in)
   */
  async skipToPrevious(): Promise<void> {
    if (this.state.position > 3) {
      await this.seekTo(0);
      return;
    }

    // For remote playback, use the player's native skip method if available
    // This is much faster than loadTrack() and doesn't block on waiting for track load
    if (
      this.playerType === "remote" &&
      "skipToPrevious" in this.currentPlayer &&
      typeof this.currentPlayer.skipToPrevious === "function"
    ) {
      try {
        await (this.currentPlayer as any).skipToPrevious();
        // The polling will detect the track change and update state
        return;
      } catch (error) {
        console.error(
          "[AudioController] Remote skip previous failed, falling back to skipToIndex:",
          error,
        );
        // Fall through to regular skipToIndex
      }
    }

    if (this.state.repeatMode === "album") {
      // Album repeat: find previous track from same album, or loop to last album track
      const currentAlbumId = this.state.currentTrack?.jellyfinItem.AlbumId;
      if (currentAlbumId) {
        // Find all indices of tracks from this album
        const albumTrackIndices = this.state.queue
          .map((track, index) =>
            track.jellyfinItem.AlbumId === currentAlbumId ? index : -1,
          )
          .filter((index) => index !== -1);

        if (albumTrackIndices.length > 0) {
          // Find current position within album tracks
          const currentAlbumPosition = albumTrackIndices.indexOf(
            this.state.queueIndex,
          );

          if (currentAlbumPosition > 0) {
            // Go to previous album track
            await this.skipToIndex(albumTrackIndices[currentAlbumPosition - 1]);
            return;
          } else {
            // Loop to last album track
            await this.skipToIndex(
              albumTrackIndices[albumTrackIndices.length - 1],
            );
            return;
          }
        }
      }
    }

    // Default behavior
    if (this.state.queueIndex > 0) {
      await this.skipToIndex(this.state.queueIndex - 1);
    } else {
      await this.seekTo(0);
    }
  }

  /**
   * Skip to specific index in queue
   */
  async skipToIndex(index: number): Promise<void> {
    if (index < 0 || index >= this.state.queue.length) {
      console.warn("[AudioController] Invalid queue index:", index);
      return;
    }

    // Queue if switching
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.skipToIndex(index), "skipToIndex");
      return;
    }

    // If already loading, queue this skip (handles rapid skipping)
    if (this.controllerState === "loading") {
      console.log(
        "[AudioController] Loading in progress, queuing skip to:",
        index,
      );
      // Replace any existing pending skip with this one (latest wins)
      this.removePendingCommandsByTag("skipToIndex");
      this.queueCommand(() => this.skipToIndex(index), "skipToIndex");
      return;
    }

    const wasPlaying =
      this.controllerState === "playing" || this.state.isPlaying;
    this.transition("loading");

    try {
      this.state.queueIndex = index;
      this.state.currentTrack = this.state.queue[index];

      await this.autoSelectPlayer();

      if (
        "updateQueue" in this.currentPlayer &&
        typeof this.currentPlayer.updateQueue === "function"
      ) {
        (this.currentPlayer as any).updateQueue(
          this.state.queue,
          this.state.queueIndex,
        );
      }

      await this.currentPlayer.loadTrack(
        this.state.currentTrack,
        this.handlePlaybackStatus.bind(this),
      );

      if (wasPlaying) {
        await this.currentPlayer.play();
        this.state.isPlaying = true;
        this.transition("playing");
      } else {
        this.state.isPlaying = false;
        this.transition("paused");
      }

      this.notifyViews();
    } catch (error) {
      console.error("[AudioController] Error skipping to index:", error);
      this.transition("idle");
    } finally {
      await this.executePendingCommands();
    }
  }

  // ==================== Playback Status Handling ====================

  /**
   * Handle playback status updates from player
   */
  private handlePlaybackStatus(status: PlaybackStatus): void {
    if (!status.isLoaded) {
      console.error("[AudioController] Playback error:", status.error);
      this.state.isBuffering = false;
      this.notifyViews();
      return;
    }

    // Handle track change from remote player
    if (status.trackChanged && status.newQueueIndex !== undefined) {
      console.log(
        "[AudioController] Track changed from remote:",
        status.trackChanged.title,
      );
      this.state.currentTrack = status.trackChanged;
      this.state.queueIndex = status.newQueueIndex;
    }

    // Sync controllerState with isPlaying to keep state machine in sync
    // This is critical for remote playback where the remote device can change state
    if (
      this.controllerState !== "switching" &&
      this.controllerState !== "loading"
    ) {
      const previousIsPlaying = this.state.isPlaying;
      if (status.isPlaying !== previousIsPlaying) {
        if (status.isPlaying && this.controllerState !== "playing") {
          this.transition("playing");
        } else if (!status.isPlaying && this.controllerState === "playing") {
          this.transition("paused");
        }
      }
    }

    this.state.isPlaying = status.isPlaying;
    this.state.position = status.position;
    this.state.duration = status.duration;
    this.state.bufferedPosition = status.bufferedPosition;
    this.state.isBuffering = status.isBuffering;

    // Update player state trackers
    if (
      "updatePosition" in this.currentPlayer &&
      typeof this.currentPlayer.updatePosition === "function"
    ) {
      (this.currentPlayer as any).updatePosition(status.position);
    }
    if (
      "updateIsPlaying" in this.currentPlayer &&
      typeof this.currentPlayer.updateIsPlaying === "function"
    ) {
      (this.currentPlayer as any).updateIsPlaying(status.isPlaying);
    }

    // Handle track finishing
    if (status.didJustFinish) {
      void this.handleTrackFinished().catch((error) => {
        console.error(
          "[AudioController] Error handling track finished:",
          error,
        );
      });
    }

    this.notifyViews();
  }

  /**
   * Handle when a track finishes playing
   */
  private async handleTrackFinished(): Promise<void> {
    // Don't process track finished during switching - queue the action instead
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.handleTrackFinished());
      return;
    }

    // Increment play count for the finished track
    const trackId = this.state.currentTrack?.jellyfinItem.Id;
    if (trackId) {
      incrementPlayCount(trackId);
    }

    if (this.state.repeatMode === "one") {
      await this.seekTo(0);
      await this.play();
    } else {
      await this.skipToNext();
      // If we didn't stop (end of queue), ensure playback continues
      if (this.state.currentTrack && this.controllerState !== "idle") {
        if (!this.state.isPlaying) {
          await this.play();
        }
      }
    }
  }

  // ==================== Queue Management ====================

  /**
   * Add track to end of queue
   */
  async addToQueue(track: AudioTrack): Promise<void> {
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.addToQueue(track));
      return;
    }

    this.state.queue.push(track);
    this.originalQueue.push(track);

    if (
      "updateQueue" in this.currentPlayer &&
      typeof this.currentPlayer.updateQueue === "function"
    ) {
      (this.currentPlayer as any).updateQueue(
        this.state.queue,
        this.state.queueIndex,
      );
    }

    this.notifyViews();
  }

  /**
   * Add multiple tracks to end of queue
   * More efficient than calling addToQueue repeatedly
   */
  async addTracksToQueue(tracks: AudioTrack[]): Promise<void> {
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.addTracksToQueue(tracks));
      return;
    }

    if (tracks.length === 0) return;

    this.state.queue.push(...tracks);
    this.originalQueue.push(...tracks);

    if (
      "updateQueue" in this.currentPlayer &&
      typeof this.currentPlayer.updateQueue === "function"
    ) {
      (this.currentPlayer as any).updateQueue(
        this.state.queue,
        this.state.queueIndex,
      );
    }

    this.notifyViews();
  }

  /**
   * Remove track from queue at specified index
   */
  async removeFromQueue(index: number): Promise<void> {
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.removeFromQueue(index));
      return;
    }

    // Validate index
    if (index < 0 || index >= this.state.queue.length) {
      console.warn(
        `[AudioController] Cannot remove: index ${index} out of bounds (queue length: ${this.state.queue.length})`,
      );
      return;
    }

    // Don't allow removing the currently playing track
    if (index === this.state.queueIndex) {
      console.warn(
        "[AudioController] Cannot remove currently playing track from queue",
      );
      return;
    }

    // Remove from queue
    const removedTrack = this.state.queue[index];
    this.state.queue.splice(index, 1);

    // Also remove from originalQueue (for shuffle restore)
    const originalIndex = this.originalQueue.findIndex(
      (t) => t.id === removedTrack.id,
    );
    if (originalIndex !== -1) {
      this.originalQueue.splice(originalIndex, 1);
    }

    // Adjust queueIndex if removed track was before current
    if (index < this.state.queueIndex) {
      this.state.queueIndex--;
    }

    // Sync with player
    if (
      "updateQueue" in this.currentPlayer &&
      typeof this.currentPlayer.updateQueue === "function"
    ) {
      (this.currentPlayer as any).updateQueue(
        this.state.queue,
        this.state.queueIndex,
      );
    }

    this.notifyViews();
  }

  /**
   * Clear the queue
   */
  async clearQueue(): Promise<void> {
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.clearQueue());
      return;
    }

    await this.stop();
    this.state.queue = [];
    this.state.queueIndex = 0;
    this.state.currentTrack = null;
    this.originalQueue = [];
    this.notifyViews();
  }

  // ==================== Playback Options ====================

  /**
   * Set repeat mode
   */
  async setRepeatMode(mode: RepeatMode): Promise<void> {
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.setRepeatMode(mode));
      return;
    }

    this.state.repeatMode = mode;
    await this.currentPlayer.setRepeatMode(mode);

    if (
      "updateQueue" in this.currentPlayer &&
      typeof this.currentPlayer.updateQueue === "function"
    ) {
      (this.currentPlayer as any).updateQueue(
        this.state.queue,
        this.state.queueIndex,
      );
    }

    this.notifyViews();
  }

  /**
   * Toggle shuffle
   */
  async toggleShuffle(): Promise<void> {
    if (!this.state.shuffleEnabled) {
      const currentTrack = this.state.currentTrack;
      const queue = [...this.state.queue];

      // Remove current track from queue temporarily
      const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);
      let currentTrackItem: AudioTrack | undefined;
      if (currentIndex >= 0) {
        currentTrackItem = queue.splice(currentIndex, 1)[0];
      }

      // Fisher-Yates shuffle the remaining tracks
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }

      // Put current track at the beginning
      if (currentTrackItem) {
        queue.unshift(currentTrackItem);
      }

      this.state.queue = queue;
      this.state.queueIndex = 0;
      this.state.currentTrack = queue[0] || null;
      this.state.shuffleEnabled = true;
    } else {
      const currentTrack = this.state.currentTrack;
      this.state.queue = [...this.originalQueue];

      const originalIndex = this.originalQueue.findIndex(
        (t) => t.id === currentTrack?.id,
      );
      this.state.queueIndex = originalIndex >= 0 ? originalIndex : 0;
      this.state.currentTrack = this.state.queue[this.state.queueIndex] || null;
      this.state.shuffleEnabled = false;
    }

    if (
      "updateQueue" in this.currentPlayer &&
      typeof this.currentPlayer.updateQueue === "function"
    ) {
      (this.currentPlayer as any).updateQueue(
        this.state.queue,
        this.state.queueIndex,
      );
    }
    if (
      "updateShuffleEnabled" in this.currentPlayer &&
      typeof this.currentPlayer.updateShuffleEnabled === "function"
    ) {
      (this.currentPlayer as any).updateShuffleEnabled(
        this.state.shuffleEnabled,
      );
    }

    this.notifyViews();
  }

  // ==================== Remote/Cast ====================

  /**
   * Cast to Jellyfin remote session
   */
  async castToSession(sessionId: string): Promise<void> {
    await this.switchPlayer("remote", sessionId);
  }

  /**
   * Disconnect from remote session
   */
  async disconnectFromRemote(): Promise<void> {
    if (this.playerType !== "remote") {
      console.warn("[AudioController] Not currently casting");
      return;
    }

    const track = this.state.currentTrack;
    const targetType: PlayerType =
      track && this.isTrackDownloaded(track) ? "local" : "streaming";

    await this.switchPlayer(targetType);
  }

  /**
   * Set volume (for remote playback)
   */
  async setVolume(volume: number): Promise<void> {
    console.log(
      `[AudioController] setVolume called: ${volume}, playerType: ${this.playerType}`,
    );
    if (this.currentPlayer.setVolume) {
      await this.currentPlayer.setVolume(volume);
    } else {
      console.warn(
        "[AudioController] Current player does not support setVolume",
      );
    }
  }

  // ==================== Helpers ====================

  /**
   * Check if a track is downloaded
   */
  private isTrackDownloaded(track: AudioTrack): boolean {
    const db = getAudioDownloadsDatabase();
    const trackId = track.jellyfinItem.Id || "";

    // Check standalone tracks
    if (db.tracks[trackId]) {
      return true;
    }

    // Check album tracks
    if (Object.values(db.albums).some((album) => album.tracks[trackId])) {
      return true;
    }

    // Check artist album tracks
    if (
      Object.values(db.artists).some((artist) =>
        Object.values(artist.albums).some((album) => album.tracks[trackId]),
      )
    ) {
      return true;
    }

    return false;
  }

  /**
   * Handle download completion (called externally)
   */
  async handleDownloadComplete(track: AudioTrack): Promise<void> {
    if (
      this.state.currentTrack?.id === track.id &&
      this.playerType === "streaming"
    ) {
      console.log(
        "[AudioController] Download completed, switching to local playback",
      );
      await this.switchPlayer("local");
    }
  }

  /**
   * Get all registered view IDs (for debugging)
   */
  getRegisteredViewIds(): string[] {
    return Array.from(this.views.keys());
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    // Warn about views that weren't properly unregistered
    if (this.views.size > 0) {
      console.warn(
        `[AudioController] Destroying with ${this.views.size} registered views still active:`,
        this.getRegisteredViewIds(),
      );
    }

    await this.currentPlayer.destroy();
    this.views.clear();
    this.pendingCommands = [];
  }
}
