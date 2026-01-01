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
  private pendingCommands: Array<() => Promise<void>> = [];

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
   */
  private queueCommand(command: () => Promise<void>): void {
    console.log(
      `[AudioController] Queuing command for after ${this.controllerState}`,
    );
    this.pendingCommands.push(command);
  }

  /**
   * Execute any pending commands
   */
  private async executePendingCommands(): Promise<void> {
    const commands = [...this.pendingCommands];
    this.pendingCommands = [];
    for (const cmd of commands) {
      await cmd();
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

      if (
        "setCallback" in this.currentPlayer &&
        typeof this.currentPlayer.setCallback === "function"
      ) {
        (this.currentPlayer as any).setCallback(
          this.handlePlaybackStatus.bind(this),
        );
      }

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
    const downloadedTrack =
      db.tracks[trackId] ||
      Object.values(db.albums)
        .map((album) => album.tracks[trackId])
        .find(Boolean);

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
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.play());
      return;
    }

    if (!this.canPerformOperation(["paused", "idle", "playing"], "play")) {
      return;
    }

    await this.currentPlayer.play();
    this.state.isPlaying = true;
    this.transition("playing");
    this.notifyViews();
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (this.controllerState === "switching") {
      this.queueCommand(() => this.pause());
      return;
    }

    if (!this.canPerformOperation(["playing"], "pause")) {
      return;
    }

    await this.currentPlayer.pause();
    this.state.isPlaying = false;
    this.transition("paused");
    this.notifyViews();
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

    await this.currentPlayer.stop();
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

    await this.currentPlayer.seekTo(position);
    this.state.position = position;
    this.notifyViews();
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
    if (this.state.queueIndex >= this.state.queue.length - 1) {
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
    } else if (this.state.queueIndex > 0) {
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
      this.queueCommand(() => this.skipToIndex(index));
      return;
    }

    // If already loading, queue this skip (handles rapid skipping)
    if (this.controllerState === "loading") {
      console.log(
        "[AudioController] Loading in progress, queuing skip to:",
        index,
      );
      // Replace any existing pending skip with this one (latest wins)
      this.pendingCommands = this.pendingCommands.filter(
        (cmd) => !cmd.toString().includes("skipToIndex"),
      );
      this.queueCommand(() => this.skipToIndex(index));
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
      const queue = [...this.state.queue];

      // Fisher-Yates shuffle starting from index 1
      for (let i = queue.length - 1; i > 0; i--) {
        const j = 1 + Math.floor(Math.random() * i);
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }

      this.state.queue = queue;
      this.state.queueIndex = 0;
      this.state.shuffleEnabled = true;
    } else {
      const currentTrack = this.state.currentTrack;
      this.state.queue = [...this.originalQueue];

      const originalIndex = this.originalQueue.findIndex(
        (t) => t.id === currentTrack?.id,
      );
      this.state.queueIndex = originalIndex >= 0 ? originalIndex : 0;
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
    return !!(
      db.tracks[trackId] ||
      Object.values(db.albums).some((album) => album.tracks[trackId])
    );
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
   * Cleanup
   */
  async destroy(): Promise<void> {
    await this.currentPlayer.destroy();
    this.views.clear();
  }
}
