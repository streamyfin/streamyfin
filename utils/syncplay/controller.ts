import type {
  SyncPlayCommand,
  SyncPlayGroup,
  SyncPlayLauncher,
  SyncPlayPlayerAdapter,
  SyncPlayQueue,
  SyncPlayQueueMode,
  SyncPlayReadyRequest,
  SyncPlayRepeatMode,
  SyncPlayShuffleMode,
  SyncPlaySnapshot,
  SyncPlayTransport,
} from "./types";

const TICKS_PER_MS = 10_000;
const READY_TOLERANCE_TICKS = 5_000_000;
const SEEK_TOLERANCE_TICKS = 1_000_000;

const time = (value: unknown): number =>
  typeof value === "string" ? Date.parse(value) : Number.NaN;
const ticks = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;

export const initialSyncPlaySnapshot = (): SyncPlaySnapshot => ({
  group: null,
  groups: [],
  connected: false,
  busy: false,
  error: null,
  groupState: null,
  playlist: [],
  playingItemIndex: -1,
  currentPlaylistItemId: null,
  repeatMode: "RepeatNone",
  shuffleMode: "Sorted",
  ignoreWait: false,
  hasNext: false,
  hasPrevious: false,
  clockOffsetMs: 0,
  pingMs: 0,
});

/**
 * Jellyfin's server owns the queue and playback state. Only explicit user
 * requests write that state; player events report readiness and local drift.
 * Protocol reference: jellyfin/jellyfin-web v10.11.7 plugins/syncPlay/core.
 */
export class SyncPlayController {
  private snapshot = initialSyncPlaySnapshot();
  private player: SyncPlayPlayerAdapter | null = null;
  private launcher: SyncPlayLauncher | null = null;
  private queue: SyncPlayQueue | null = null;
  private command: SyncPlayCommand | null = null;
  private pendingCommand: SyncPlayCommand | null = null;
  private expectedGroupId: string | null = null;
  private joinedAt = 0;
  private generation = 0;
  private queueGeneration = 0;
  private playbackQueueUpdatedAt = 0;
  private connected = false;
  private disposed = false;
  private clockReady = false;
  private measurements: { offset: number; delay: number }[] = [];
  private pingCount = 0;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  private nativeScheduled: SyncPlayCommand | null = null;
  private clockTimer: ReturnType<typeof setTimeout> | null = null;
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private loadingPlaylistId: string | null = null;
  private launchedPlaylistId: string | null = null;
  private readyPlaylistId: string | null = null;
  private endedPlaylistId: string | null = null;
  private expectedSeek: number | null = null;
  private reportedBuffering = false;
  private lastCorrectionAt = 0;
  private commandAppliedAt = 0;
  private readyPending = false;
  private readyReportPending = false;
  private readyReportId = 0;
  private readinessReports: Promise<void> = Promise.resolve();
  private playbackRequests: Promise<void> = Promise.resolve();
  private stopped = false;
  private pendingOperations = 0;

  constructor(
    private readonly transport: SyncPlayTransport,
    private readonly onChange: (snapshot: SyncPlaySnapshot) => void,
  ) {}

  getSnapshot = (): SyncPlaySnapshot => this.snapshot;

  private update(patch: Partial<SyncPlaySnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.onChange(this.snapshot);
  }

  clearError = () => this.update({ error: null });

  private fail(key: string) {
    this.update({ error: key });
  }

  private assertConnected() {
    if (this.disposed || !this.connected) {
      this.fail("disconnected");
      throw new Error("SyncPlay disconnected");
    }
  }

  private async operation<T>(work: () => Promise<T>): Promise<T> {
    this.assertConnected();
    const generation = this.generation;
    this.pendingOperations++;
    this.update({ busy: true, error: null });
    try {
      return await work();
    } catch (error) {
      if (generation === this.generation) this.fail("request_failed");
      throw error;
    } finally {
      if (generation === this.generation) {
        this.pendingOperations = Math.max(0, this.pendingOperations - 1);
        this.update({
          busy: this.pendingOperations > 0 || !!this.expectedGroupId,
        });
      }
    }
  }

  setConnected = (connected: boolean) => {
    if (this.connected === connected || this.disposed) return;
    this.connected = connected;
    this.update({ connected });
    if (!connected) {
      const wasJoined = !!this.snapshot.group || !!this.expectedGroupId;
      this.resetGroup(true);
      if (wasJoined) {
        this.fail("disconnected");
        // Session disconnect does not always remove the server-side member
        // immediately. A best-effort leave avoids leaving others waiting.
        void this.transport.leaveGroup().catch(() => {});
      }
    }
  };

  refreshGroups = async () => {
    const generation = this.generation;
    await this.operation(async () => {
      const groups = await this.transport.listGroups();
      if (generation === this.generation) this.update({ groups });
    });
  };

  getGroup = (groupId: string): Promise<SyncPlayGroup | undefined> => {
    if (!groupId) return Promise.reject(new Error("Invalid SyncPlay group id"));
    const generation = this.generation;
    const current = this.snapshot.group;
    return this.operation(async () => {
      const group = await this.transport.getGroup(groupId);
      // Refresh current info, but never replace a newer websocket update or
      // join another group just because its information was requested.
      if (
        generation === this.generation &&
        group?.GroupId === groupId &&
        current?.GroupId === groupId &&
        current === this.snapshot.group
      )
        this.update({
          group,
          groupState: group.State ?? this.snapshot.groupState,
        });
      return group;
    });
  };

  private beginJoin(groupId: string) {
    if (this.snapshot.group || this.expectedGroupId) {
      throw new Error("Already in a SyncPlay group");
    }
    this.expectedGroupId = groupId;
    this.joinTimer = setTimeout(() => {
      if (!this.expectedGroupId) return;
      this.resetGroup(true);
      this.fail("timeout");
      void this.transport.leaveGroup().catch(() => {});
    }, 15_000);
  }

  createGroup = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 64) {
      this.fail("invalid_name");
      throw new Error("Invalid SyncPlay group name");
    }
    await this.operation(async () => {
      this.beginJoin("*");
      const generation = this.generation;
      try {
        const group = await this.transport.createGroup(trimmed);
        // New servers return the group; older ones reply 204 and send only
        // GroupJoined over the websocket. Both use the same enable path.
        if (generation === this.generation && group && this.expectedGroupId) {
          this.handleGroupUpdate({
            Type: "GroupJoined",
            Data: group,
            GroupId: group.GroupId,
          });
        }
      } catch (error) {
        if (generation === this.generation) this.cancelJoin();
        throw error;
      }
    });
  };

  joinGroup = async (groupId: string) => {
    await this.operation(async () => {
      this.beginJoin(groupId);
      const generation = this.generation;
      try {
        await this.transport.joinGroup(groupId);
      } catch (error) {
        if (generation === this.generation) this.cancelJoin();
        throw error;
      }
    });
  };

  leaveGroup = async () => {
    this.assertConnected();
    this.resetGroup(false);
    await this.operation(() => this.transport.leaveGroup());
  };

  private cancelJoin() {
    this.expectedGroupId = null;
    if (this.joinTimer) clearTimeout(this.joinTimer);
    this.joinTimer = null;
    this.update({ busy: this.pendingOperations > 0 });
  }

  private resetGroup(pause: boolean) {
    this.cancelScheduledCommand();
    this.generation++;
    // Old in-flight HTTP work no longer belongs to this membership and must
    // neither hold its controls busy nor decrement a later group's counter.
    this.pendingOperations = 0;
    this.queueGeneration++;
    this.cancelJoin();
    if (this.scheduled) clearTimeout(this.scheduled);
    if (this.clockTimer) clearTimeout(this.clockTimer);
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.scheduled = this.clockTimer = this.readyTimer = null;
    this.queue = null;
    this.playbackQueueUpdatedAt = 0;
    this.command = this.pendingCommand = null;
    this.loadingPlaylistId = this.readyPlaylistId = null;
    this.launchedPlaylistId = null;
    this.endedPlaylistId = null;
    this.expectedSeek = null;
    this.readyPending = this.reportedBuffering = false;
    this.readyReportPending = false;
    this.readyReportId++;
    // A timed-out HTTP request from a departed group must not hold a new
    // membership's readiness queue. Old queued callbacks retain their guards.
    this.readinessReports = Promise.resolve();
    this.playbackRequests = Promise.resolve();
    this.stopped = false;
    this.clockReady = false;
    this.measurements = [];
    this.pingCount = 0;
    this.joinedAt = 0;
    if (pause && this.player)
      void Promise.resolve(this.player.pause()).catch(() => {});
    this.update({
      group: null,
      groupState: null,
      playlist: [],
      playingItemIndex: -1,
      currentPlaylistItemId: null,
      repeatMode: "RepeatNone",
      shuffleMode: "Sorted",
      ignoreWait: false,
      hasNext: false,
      hasPrevious: false,
      clockOffsetMs: 0,
      pingMs: 0,
    });
  }

  registerLauncher = (launcher: SyncPlayLauncher) => {
    this.launcher = launcher;
    void this.loadCurrentItem();
    return () => {
      if (this.launcher === launcher) this.launcher = null;
    };
  };

  registerPlayer = (player: SyncPlayPlayerAdapter) => {
    this.cancelScheduledCommand();
    this.player = player;
    const item = this.currentItem();
    if (this.snapshot.group && item) {
      // Quality/track changes replace the decoder without changing the group
      // playlist. Its new paused source must report Ready again so Jellyfin
      // resends the current group command to this participant.
      if (this.readyPlaylistId === item.PlaylistItemId)
        this.expectedSeek = null;
      this.readyPlaylistId = null;
      this.readyPending = true;
      this.readyReportPending = false;
      this.startReadyTimeout();
      this.notifyBuffering(true);
    }
    this.flushCommand();
    return () => {
      if (this.player !== player) return;
      this.cancelScheduledCommand();
      this.player = null;
    };
  };

  private currentItem() {
    return this.queue?.Playlist[this.queue.PlayingItemIndex] ?? null;
  }

  handleGroupUpdate = (value: unknown) => {
    if (this.disposed || !this.connected || !value || typeof value !== "object")
      return;
    const update = value as { Type?: string; GroupId?: string; Data?: unknown };
    const data = update.Data;
    // Request errors use Guid.Empty when Jellyfin cannot resolve a group.
    const unscoped =
      !update.GroupId || /^0+$/.test(update.GroupId.replaceAll("-", ""));
    if (update.Type === "GroupJoined") {
      if (!data || typeof data !== "object") return;
      const group = data as SyncPlayGroup;
      if (
        !group.GroupId ||
        (update.GroupId && update.GroupId !== group.GroupId)
      )
        return;
      if (this.snapshot.group?.GroupId === group.GroupId) return;
      if (
        !this.expectedGroupId ||
        (this.expectedGroupId !== "*" && this.expectedGroupId !== group.GroupId)
      )
        return;
      this.resetGroup(false);
      this.joinedAt = Number.isFinite(time(group.LastUpdatedAt))
        ? time(group.LastUpdatedAt)
        : 0;
      this.update({
        group: { ...group, Participants: group.Participants ?? [] },
        groupState: group.State ?? null,
      });
      void this.syncClock();
      return;
    }

    const errors: Record<string, string> = {
      CreateGroupDenied: "create_denied",
      JoinGroupDenied: "join_denied",
      GroupDoesNotExist: "group_missing",
      LibraryAccessDenied: "library_denied",
      SyncPlayIsDisabled: "disabled",
    };
    if (update.Type && errors[update.Type]) {
      if (
        !unscoped &&
        this.expectedGroupId !== "*" &&
        update.GroupId !== this.expectedGroupId &&
        update.GroupId !== this.snapshot.group?.GroupId
      )
        return;
      this.cancelJoin();
      this.fail(errors[update.Type]);
      return;
    }
    const group = this.snapshot.group;
    if (
      update.Type === "NotInGroup" &&
      unscoped &&
      (group || this.expectedGroupId)
    ) {
      this.resetGroup(true);
      return;
    }
    if (!group || !update.GroupId || update.GroupId !== group.GroupId) return;
    switch (update.Type) {
      case "GroupLeft":
      case "NotInGroup":
        this.resetGroup(false);
        break;
      case "GroupUpdate": {
        const next = data as SyncPlayGroup;
        if (next?.GroupId === group.GroupId)
          this.update({
            group: { ...next, Participants: next.Participants ?? [] },
            groupState: next.State ?? this.snapshot.groupState,
          });
        break;
      }
      case "UserJoined":
        if (typeof data === "string")
          this.update({
            group: { ...group, Participants: [...group.Participants, data] },
          });
        break;
      case "UserLeft":
        if (typeof data === "string") {
          // A user can have several sessions in the same group. Remove one.
          const participants = [...group.Participants];
          const index = participants.indexOf(data);
          if (index >= 0) participants.splice(index, 1);
          this.update({ group: { ...group, Participants: participants } });
        }
        break;
      case "StateUpdate": {
        const state = (data as { State?: string } | undefined)?.State;
        if (state)
          this.update({ groupState: state, group: { ...group, State: state } });
        break;
      }
      case "PlayQueue":
        this.handleQueue(data);
        break;
    }
  };

  private handleQueue(data: unknown) {
    if (!data || typeof data !== "object") return;
    const queue = data as SyncPlayQueue;
    if (
      !Array.isArray(queue.Playlist) ||
      !Number.isInteger(queue.PlayingItemIndex) ||
      queue.PlayingItemIndex < -1 ||
      queue.PlayingItemIndex >= queue.Playlist.length ||
      (queue.RepeatMode !== undefined &&
        !["RepeatNone", "RepeatOne", "RepeatAll"].includes(queue.RepeatMode)) ||
      (queue.ShuffleMode !== undefined &&
        !["Sorted", "Shuffle"].includes(queue.ShuffleMode)) ||
      !Number.isFinite(time(queue.LastUpdate))
    )
      return;
    if (this.queue && time(queue.LastUpdate) < time(this.queue.LastUpdate))
      return;
    if (this.queue && JSON.stringify(this.queue) === JSON.stringify(queue))
      return;
    if (queue.Playlist.some((item) => !item?.ItemId || !item.PlaylistItemId))
      return;
    if (
      new Set(queue.Playlist.map((item) => item.PlaylistItemId)).size !==
      queue.Playlist.length
    )
      return;
    const previous = this.currentItem()?.PlaylistItemId;
    const firstQueue = !this.queue;
    this.queue = queue;
    const current = this.currentItem();
    const restartsPlayback =
      previous !== current?.PlaylistItemId ||
      ["NewPlaylist", "NextItem", "PreviousItem", "SetCurrentItem"].includes(
        queue.Reason ?? "",
      );
    // Appending, reordering or changing modes advances LastUpdate but keeps
    // the current decoder and already scheduled playback command valid.
    if (firstQueue || restartsPlayback)
      this.playbackQueueUpdatedAt = time(queue.LastUpdate);
    // A command can arrive while clock sync or the decoder is still loading.
    // Advancing the queue invalidates that work just as it invalidates an
    // already scheduled command; an old Stop must not close the new item.
    if (
      this.pendingCommand &&
      time(this.pendingCommand.EmittedAt) < this.playbackQueueUpdatedAt
    )
      this.pendingCommand = null;
    if (
      this.command &&
      time(this.command.EmittedAt) < this.playbackQueueUpdatedAt
    ) {
      this.command = null;
      this.cancelScheduledCommand();
    }
    const repeatMode =
      queue.RepeatMode ??
      (queue.Reason === "NewPlaylist"
        ? "RepeatNone"
        : this.snapshot.repeatMode);
    const shuffleMode =
      queue.ShuffleMode ??
      (queue.Reason === "NewPlaylist" ? "Sorted" : this.snapshot.shuffleMode);
    const repeats = repeatMode !== "RepeatNone";
    this.update({
      playlist: queue.Playlist.map((item) => ({ ...item })),
      playingItemIndex: queue.PlayingItemIndex,
      currentPlaylistItemId: current?.PlaylistItemId ?? null,
      repeatMode,
      shuffleMode,
      hasNext:
        !!current &&
        (repeats || queue.PlayingItemIndex < queue.Playlist.length - 1),
      hasPrevious: !!current && (repeats || queue.PlayingItemIndex > 0),
    });
    if (!current) {
      this.cancelScheduledCommand();
      this.queueGeneration++;
      this.loadingPlaylistId = this.readyPlaylistId = null;
      this.launchedPlaylistId = null;
      this.expectedSeek = null;
      this.readyPending = this.readyReportPending = false;
      if (this.readyTimer) clearTimeout(this.readyTimer);
      this.readyTimer = null;
      if (previous && !this.stopped) {
        // Clearing/removing the playing item closes the decoder even if its
        // following Stop message is delayed or unavailable. Keep membership.
        this.stopped = true;
        const group = this.snapshot.group;
        if (group)
          this.update({
            groupState: "Idle",
            group: { ...group, State: "Idle" },
          });
        const generation = this.generation;
        void Promise.resolve(this.player?.stop()).catch(() => {
          if (generation === this.generation) this.fail("playback_failed");
        });
      }
      return;
    }
    if (restartsPlayback) {
      this.cancelScheduledCommand();
      this.queueGeneration++;
      this.loadingPlaylistId = null;
      this.launchedPlaylistId = null;
      this.readyPlaylistId = null;
      this.endedPlaylistId = null;
      this.stopped = false;
      this.expectedSeek = ticks(queue.StartPositionTicks);
      this.readyPending = true;
      this.readyReportPending = false;
      if (this.scheduled) clearTimeout(this.scheduled);
      this.scheduled = null;
      if (this.command?.PlaylistItemId !== current.PlaylistItemId)
        this.command = null;
      void this.loadCurrentItem();
    }
    this.flushCommand();
  }

  private async loadCurrentItem() {
    const item = this.currentItem();
    if (
      !this.snapshot.group ||
      !item ||
      !this.launcher ||
      this.loadingPlaylistId === item.PlaylistItemId ||
      this.launchedPlaylistId === item.PlaylistItemId ||
      this.readyPlaylistId === item.PlaylistItemId
    )
      return;
    this.loadingPlaylistId = item.PlaylistItemId;
    // Readiness is cleared for seeks and decoder replacement. That does not
    // mean this queue entry needs launching again at its original position.
    this.launchedPlaylistId = item.PlaylistItemId;
    const generation = this.generation;
    const queueGeneration = this.queueGeneration;
    const startPositionTicks = ticks(this.queue?.StartPositionTicks);
    this.expectedSeek = startPositionTicks;
    this.readyPending = true;
    this.startReadyTimeout();
    try {
      const state = this.player?.getState();
      if (
        !this.player?.reloadOnQueueRestart &&
        state?.itemId === item.ItemId &&
        state.isReady
      ) {
        await this.player?.pause();
        if (
          generation !== this.generation ||
          queueGeneration !== this.queueGeneration
        )
          return;
        await this.player?.seek(startPositionTicks);
        this.notifyReady();
      } else {
        await this.launcher({
          itemId: item.ItemId,
          playlistItemId: item.PlaylistItemId,
          startPositionTicks,
          isCurrent: () =>
            !this.disposed &&
            !this.stopped &&
            generation === this.generation &&
            queueGeneration === this.queueGeneration,
        });
      }
    } catch {
      if (
        generation === this.generation &&
        queueGeneration === this.queueGeneration
      ) {
        this.resetGroup(true);
        this.fail("playback_failed");
        void this.transport.leaveGroup().catch(() => {});
      }
    } finally {
      if (
        this.loadingPlaylistId === item.PlaylistItemId &&
        generation === this.generation &&
        queueGeneration === this.queueGeneration
      ) {
        this.loadingPlaylistId = null;
        this.flushCommand();
      }
    }
  }

  private startReadyTimeout() {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    const generation = this.generation;
    this.readyTimer = setTimeout(() => {
      if (
        generation !== this.generation ||
        (!this.readyPending && !this.readyReportPending)
      )
        return;
      this.resetGroup(true);
      this.fail("playback_failed");
      void this.transport.leaveGroup().catch(() => {});
    }, 30_000);
  }

  private async syncClock() {
    const generation = this.generation;
    if (!this.snapshot.group || !this.connected) return;
    const sent = Date.now();
    try {
      const response = await this.transport.getTime();
      const received = Date.now();
      if (generation !== this.generation || !this.connected || this.disposed)
        return;
      const serverReceived = time(response.RequestReceptionTime);
      const serverSent = time(response.ResponseTransmissionTime);
      if (!Number.isFinite(serverReceived) || !Number.isFinite(serverSent))
        throw new Error("Invalid server time");
      const delay = Math.max(
        0,
        received - sent - (serverSent - serverReceived),
      );
      this.measurements.push({
        offset: (serverReceived - sent + (serverSent - received)) / 2,
        delay,
      });
      this.measurements = this.measurements.slice(-8);
      const best = [...this.measurements].sort((a, b) => a.delay - b.delay)[0];
      this.clockReady = true;
      this.update({ clockOffsetMs: best.offset, pingMs: best.delay / 2 });
      void this.transport.ping(Math.round(best.delay / 2)).catch(() => {});
      this.flushCommand();
      if (this.readyPending) this.notifyReady();
    } catch {
      if (generation !== this.generation) return;
      if (!this.clockReady) this.fail("request_failed");
    } finally {
      if (
        generation === this.generation &&
        this.snapshot.group &&
        !this.disposed
      ) {
        const interval =
          !this.clockReady || this.pingCount++ < 3 ? 1000 : 60_000;
        this.clockTimer = setTimeout(() => {
          void this.syncClock();
        }, interval);
      }
    }
  }

  handleCommand = (value: unknown) => {
    if (
      this.disposed ||
      !this.snapshot.group ||
      !this.connected ||
      !value ||
      typeof value !== "object"
    )
      return;
    const command = value as SyncPlayCommand;
    if (
      command.GroupId !== this.snapshot.group.GroupId ||
      !["Pause", "Unpause", "Seek", "Stop"].includes(command.Command)
    )
      return;
    if (
      !Number.isFinite(time(command.When)) ||
      !Number.isFinite(time(command.EmittedAt)) ||
      time(command.EmittedAt) < this.joinedAt
    )
      return;
    if (time(command.EmittedAt) < this.playbackQueueUpdatedAt) return;
    const latest = this.pendingCommand ?? this.command;
    if (latest && time(command.EmittedAt) < time(latest.EmittedAt)) return;
    if (
      command.Command !== "Stop" &&
      this.currentItem() &&
      command.PlaylistItemId !== this.currentItem()?.PlaylistItemId
    )
      return;
    if (command.Command === "Stop") {
      // Jellyfin's IdleGroupState broadcasts Stop without StateUpdate. This
      // accepted command is also the group's authoritative idle transition,
      // including clients that currently have no decoder registered.
      this.update({
        groupState: "Idle",
        group: { ...this.snapshot.group, State: "Idle" },
      });
    }
    if (
      latest &&
      latest.Command === command.Command &&
      latest.When === command.When &&
      latest.PositionTicks === command.PositionTicks &&
      latest.PlaylistItemId === command.PlaylistItemId
    ) {
      // A duplicate can be the server correcting an inaccurate Ready
      // report. Apply it again when local state no longer matches.
      if (
        this.pendingCommand ||
        this.scheduled ||
        this.nativeScheduled ||
        !this.player
      )
        return;
      const state = this.player.getState();
      const mismatch =
        Math.abs(state.positionTicks - ticks(command.PositionTicks)) >
        READY_TOLERANCE_TICKS;
      const needsCorrection =
        command.Command === "Unpause"
          ? !state.isPlaying
          : command.Command === "Stop"
            ? !!state.itemId
            : state.isPlaying || mismatch;
      if (!needsCorrection) {
        if (command.Command === "Seek") this.notifyReady(true);
        return;
      }
    }
    this.pendingCommand = command;
    // A newer command supersedes an earlier scheduled one even while loading.
    this.cancelScheduledCommand();
    this.flushCommand();
  };

  private cancelScheduledCommand() {
    if (this.scheduled) clearTimeout(this.scheduled);
    this.scheduled = null;
    this.nativeScheduled = null;
    this.player?.cancelScheduledCommands?.();
  }

  private flushCommand() {
    const command = this.pendingCommand;
    if (command && time(command.EmittedAt) < this.playbackQueueUpdatedAt) {
      this.pendingCommand = null;
      return;
    }
    if (!command || !this.clockReady || !this.player) return;
    const item = this.currentItem();
    const state = this.player.getState();
    if (
      command.Command !== "Stop" &&
      (!item ||
        (this.player.reloadOnQueueRestart &&
          this.loadingPlaylistId === item.PlaylistItemId) ||
        state.itemId !== item.ItemId ||
        !state.isReady ||
        command.PlaylistItemId !== item.PlaylistItemId)
    )
      return;
    this.pendingCommand = null;
    this.command = command;
    const generation = this.generation;
    const queueGeneration = this.queueGeneration;
    const player = this.player;
    if (player.scheduleCommand) {
      this.nativeScheduled = command;
      void this.applyNativeCommand(
        command,
        player,
        generation,
        queueGeneration,
      );
      return;
    }
    const delay = Math.max(
      0,
      time(command.When) - this.snapshot.clockOffsetMs - Date.now(),
    );
    this.scheduled = setTimeout(() => {
      this.scheduled = null;
      if (
        generation !== this.generation ||
        queueGeneration !== this.queueGeneration ||
        this.command !== command
      )
        return;
      void this.applyCommand(command, generation, queueGeneration);
    }, delay);
  }

  private async applyNativeCommand(
    command: SyncPlayCommand,
    player: SyncPlayPlayerAdapter,
    generation: number,
    queueGeneration: number,
  ) {
    const current = () =>
      generation === this.generation &&
      queueGeneration === this.queueGeneration &&
      this.player === player &&
      this.command === command &&
      this.nativeScheduled === command;
    if (command.Command === "Seek") {
      this.expectedSeek = ticks(command.PositionTicks);
      this.readyPending = true;
      this.readyPlaylistId = null;
      this.startReadyTimeout();
    } else if (command.Command === "Stop") {
      if (this.stopped) {
        this.nativeScheduled = null;
        return;
      }
      this.stopped = true;
      this.readyPending = this.readyReportPending = false;
      this.readyPlaylistId = null;
      if (this.readyTimer) clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    try {
      await player.scheduleCommand!(
        command,
        time(command.When) - this.snapshot.clockOffsetMs,
      );
      if (!current()) return;
      this.nativeScheduled = null;
      this.commandAppliedAt = Date.now();
      if (command.Command === "Stop") {
        this.stopped = true;
        this.readyPending = this.readyReportPending = false;
        this.readyPlaylistId = null;
        if (this.readyTimer) clearTimeout(this.readyTimer);
        this.readyTimer = null;
      } else if (command.Command === "Seek") {
        this.notifyReady();
      } else if (command.Command === "Unpause") {
        this.expectedSeek = null;
      }
    } catch {
      // A cancelled native promise belongs to superseded work; its successor
      // retains membership and readiness. Actual current playback failures leave.
      if (current()) {
        this.resetGroup(true);
        this.fail("playback_failed");
        void this.transport.leaveGroup().catch(() => {});
      }
    }
  }

  private async applyCommand(
    command: SyncPlayCommand,
    generation: number,
    queueGeneration: number,
  ) {
    const player = this.player;
    if (!player) return;
    const current = () =>
      generation === this.generation &&
      queueGeneration === this.queueGeneration &&
      this.player === player &&
      this.command === command;
    this.commandAppliedAt = Date.now();
    try {
      switch (command.Command) {
        case "Stop":
          if (this.stopped) return;
          this.stopped = true;
          this.readyPending = false;
          this.readyReportPending = false;
          this.readyPlaylistId = null;
          if (this.readyTimer) clearTimeout(this.readyTimer);
          this.readyTimer = null;
          await player.stop();
          break;
        case "Unpause": {
          const position = this.estimatePosition(command);
          this.expectedSeek = null;
          if (
            Math.abs(player.getState().positionTicks - position) >
            SEEK_TOLERANCE_TICKS
          )
            await player.seek(position);
          if (current()) await player.resume();
          break;
        }
        case "Pause":
          await player.pause();
          if (
            current() &&
            Math.abs(
              player.getState().positionTicks - ticks(command.PositionTicks),
            ) > SEEK_TOLERANCE_TICKS
          )
            await player.seek(ticks(command.PositionTicks));
          break;
        case "Seek":
          this.expectedSeek = ticks(command.PositionTicks);
          this.readyPending = true;
          this.readyPlaylistId = null;
          this.startReadyTimeout();
          await player.pause();
          if (!current()) return;
          await player.seek(this.expectedSeek);
          if (current()) this.notifyReady();
          break;
      }
    } catch {
      if (current()) {
        this.resetGroup(true);
        this.fail("playback_failed");
        void this.transport.leaveGroup().catch(() => {});
      }
    }
  }

  private estimatePosition(command: SyncPlayCommand) {
    return (
      ticks(command.PositionTicks) +
      (command.Command === "Unpause"
        ? Math.max(
            0,
            Date.now() + this.snapshot.clockOffsetMs - time(command.When),
          ) * TICKS_PER_MS
        : 0)
    );
  }

  private readinessRequest() {
    const item = this.currentItem();
    const state = this.player?.getState();
    if (
      !this.clockReady ||
      this.stopped ||
      !this.snapshot.group ||
      !this.connected ||
      !item ||
      !state ||
      state.itemId !== item.ItemId
    )
      return null;
    return {
      When: new Date(Date.now() + this.snapshot.clockOffsetMs).toISOString(),
      PositionTicks: ticks(state.positionTicks),
      IsPlaying: state.isPlaying,
      PlaylistItemId: item.PlaylistItemId,
    };
  }

  private sendReadinessReport(
    kind: "ready" | "buffering",
    request: SyncPlayReadyRequest,
  ) {
    const generation = this.generation;
    const queueGeneration = this.queueGeneration;
    // Jellyfin mutates the group's state as each request arrives. A Ready
    // overtaking its preceding Buffering can leave everyone waiting after
    // the decoder has already resumed, so preserve transition order over HTTP.
    const report = this.readinessReports.then(async () => {
      if (
        this.disposed ||
        !this.connected ||
        this.stopped ||
        generation !== this.generation ||
        queueGeneration !== this.queueGeneration ||
        request.PlaylistItemId !== this.currentItem()?.PlaylistItemId
      )
        return;
      await this.transport[kind](request);
    });
    this.readinessReports = report.catch(() => {});
    return report;
  }

  notifyReady = (force = false) => {
    const request = this.readinessRequest();
    const state = this.player?.getState();
    if (!request || !state?.isReady || state.isBuffering) return;
    this.flushCommand();
    if (this.nativeScheduled?.Command === "Seek") return;
    if (
      this.expectedSeek !== null &&
      Math.abs(request.PositionTicks - this.expectedSeek) >
        READY_TOLERANCE_TICKS
    )
      return;
    if (
      !force &&
      !this.readyPending &&
      !this.reportedBuffering &&
      this.readyPlaylistId === request.PlaylistItemId
    )
      return;
    this.readyPending = this.reportedBuffering = false;
    this.readyPlaylistId = request.PlaylistItemId;
    this.expectedSeek = null;
    this.readyReportPending = true;
    const reportId = ++this.readyReportId;
    this.startReadyTimeout();
    const generation = this.generation;
    const queueGeneration = this.queueGeneration;
    const current = () =>
      generation === this.generation &&
      queueGeneration === this.queueGeneration &&
      reportId === this.readyReportId &&
      !this.stopped;
    void this.sendReadinessReport("ready", request)
      .then(() => {
        if (!current()) return;
        this.readyReportPending = false;
        if (!this.readyPending) {
          if (this.readyTimer) clearTimeout(this.readyTimer);
          this.readyTimer = null;
        }
      })
      .catch(() => {
        if (current()) {
          this.readyReportPending = false;
          this.readyPending = true;
          this.startReadyTimeout();
          this.fail("request_failed");
        }
      });
  };

  notifyBuffering = (isBuffering: boolean) => {
    if (!isBuffering) {
      this.notifyReady();
      return;
    }
    if (
      !this.stopped &&
      (this.scheduled || this.nativeScheduled) &&
      this.player &&
      !this.player.getState().isReady
    ) {
      // An in-place decoder reload must cancel its old native deadline before
      // load() settles that promise. Keep the authoritative command for the
      // replacement decoder; a newer server Pause/Seek can supersede it.
      this.pendingCommand = this.command;
      this.cancelScheduledCommand();
    }
    const request = this.readinessRequest();
    if (!request || this.reportedBuffering) return;
    this.reportedBuffering = true;
    this.readyPending = true;
    this.startReadyTimeout();
    const generation = this.generation;
    const queueGeneration = this.queueGeneration;
    void this.sendReadinessReport("buffering", request).catch(() => {
      if (
        generation === this.generation &&
        queueGeneration === this.queueGeneration &&
        !this.stopped
      )
        this.fail("request_failed");
    });
  };

  notifyProgress = () => {
    if (this.readyPending) this.notifyReady();
    const state = this.player?.getState();
    const command = this.command;
    if (
      !state ||
      !command ||
      command.Command !== "Unpause" ||
      this.scheduled ||
      this.nativeScheduled ||
      !this.snapshot.group ||
      !this.clockReady ||
      !state.isPlaying ||
      !state.isReady ||
      state.isBuffering ||
      this.readyPending ||
      command.PlaylistItemId !== this.currentItem()?.PlaylistItemId ||
      state.itemId !== this.currentItem()?.ItemId
    )
      return;
    const now = Date.now();
    if (
      now - this.commandAppliedAt < 1500 ||
      now - this.lastCorrectionAt < 3000
    )
      return;
    const target = this.estimatePosition(command);
    if (Math.abs(target - state.positionTicks) < 7_500_000) return;
    this.lastCorrectionAt = now;
    void Promise.resolve(this.player?.seek(target)).catch(() =>
      this.fail("playback_failed"),
    );
  };

  private async playbackRequest(work: () => Promise<void>) {
    this.assertConnected();
    if (!this.snapshot.group) return;
    const generation = this.generation;
    // Explicit actions can arrive rapidly (queue edits, mode toggles, seeks).
    // Send them in user order; a rejected action must not block later ones.
    const request = this.playbackRequests
      .catch(() => {})
      .then(async () => {
        if (generation !== this.generation || !this.snapshot.group) return;
        await work();
      });
    this.playbackRequests = request.catch(() => {});
    await this.operation(() => request);
  }

  private requirePlaylistItems(ids: string[]) {
    if (
      !ids.length ||
      ids.some(
        (id) =>
          !this.queue?.Playlist.some((item) => item.PlaylistItemId === id),
      )
    )
      throw new Error("Invalid SyncPlay playlist item");
  }

  playItems = (ids: string[], index = 0, startPositionTicks = 0) => {
    if (
      !ids.length ||
      ids.some((id) => !id) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= ids.length
    )
      return Promise.reject(new Error("Invalid SyncPlay queue"));
    const items = [...ids];
    return this.playbackRequest(() =>
      this.transport.playItems(items, index, ticks(startPositionTicks)),
    );
  };
  queueItems = (ids: string[], mode: SyncPlayQueueMode = "Queue") => {
    if (
      !ids.length ||
      ids.some((id) => !id) ||
      !["Queue", "QueueNext"].includes(mode)
    )
      return Promise.reject(new Error("Invalid SyncPlay queue request"));
    const items = [...ids];
    return this.playbackRequest(() => this.transport.queueItems(items, mode));
  };
  removePlaylistItems = (playlistItemIds: string[]) => {
    const ids = [...playlistItemIds];
    return this.playbackRequest(() => {
      this.requirePlaylistItems(ids);
      return this.transport.removePlaylistItems(ids, false, false);
    });
  };
  clearPlaylist = (clearPlayingItem = false) =>
    this.playbackRequest(() =>
      this.transport.removePlaylistItems([], true, clearPlayingItem),
    );
  movePlaylistItem = (playlistItemId: string, newIndex: number) =>
    this.playbackRequest(() => {
      this.requirePlaylistItems([playlistItemId]);
      if (
        !Number.isInteger(newIndex) ||
        newIndex < 0 ||
        newIndex >= (this.queue?.Playlist.length ?? 0)
      )
        throw new Error("Invalid SyncPlay playlist index");
      return this.transport.movePlaylistItem(playlistItemId, newIndex);
    });
  requestPlaylistItem = (playlistItemId: string) =>
    this.playbackRequest(() => {
      this.requirePlaylistItems([playlistItemId]);
      return this.transport.setPlaylistItem(playlistItemId);
    });
  setRepeatMode = (mode: SyncPlayRepeatMode) => {
    if (!["RepeatNone", "RepeatOne", "RepeatAll"].includes(mode))
      return Promise.reject(new Error("Invalid SyncPlay repeat mode"));
    return this.playbackRequest(() => this.transport.setRepeatMode(mode));
  };
  setShuffleMode = (mode: SyncPlayShuffleMode) => {
    if (!["Sorted", "Shuffle"].includes(mode))
      return Promise.reject(new Error("Invalid SyncPlay shuffle mode"));
    return this.playbackRequest(() => this.transport.setShuffleMode(mode));
  };
  setIgnoreWait = (ignoreWait: boolean) => {
    const generation = this.generation;
    return this.playbackRequest(async () => {
      await this.transport.setIgnoreWait(ignoreWait);
      if (generation === this.generation) this.update({ ignoreWait });
    });
  };
  requestPause = () => this.playbackRequest(() => this.transport.pause());
  requestUnpause = () =>
    this.playbackRequest(() => {
      const id = this.currentItem()?.PlaylistItemId;
      // Stop closes every decoder while keeping the shared queue. Unpause
      // alone does not broadcast PlayQueue, so peers cannot reopen a source.
      return this.stopped && id
        ? this.transport.setPlaylistItem(id)
        : this.transport.unpause();
    });
  requestSeek = (positionTicks: number) =>
    this.playbackRequest(() => this.transport.seek(ticks(positionTicks)));
  requestStop = () => this.playbackRequest(() => this.transport.stop());
  requestNext = () =>
    this.playbackRequest(() => {
      const id = this.currentItem()?.PlaylistItemId;
      return id ? this.transport.next(id) : Promise.resolve();
    });
  requestPrevious = () =>
    this.playbackRequest(() => {
      const id = this.currentItem()?.PlaylistItemId;
      return id ? this.transport.previous(id) : Promise.resolve();
    });
  notifyEnded = (playlistItemId?: string) => {
    const item = this.currentItem();
    const id = item?.PlaylistItemId;
    const state = this.player?.getState();
    if (
      !this.snapshot.group ||
      this.stopped ||
      !id ||
      this.readyPlaylistId !== id ||
      (playlistItemId !== undefined && playlistItemId !== id) ||
      !state?.isReady ||
      state.itemId !== item?.ItemId ||
      this.endedPlaylistId === id
    )
      return;
    this.endedPlaylistId = id;
    const generation = this.generation;
    void this.playbackRequest(() =>
      id === this.currentItem()?.PlaylistItemId
        ? this.snapshot.hasNext
          ? this.transport.next(id)
          : this.transport.stop()
        : Promise.resolve(),
    ).catch(() => {
      if (generation === this.generation && this.endedPlaylistId === id)
        this.endedPlaylistId = null;
    });
  };

  dispose() {
    if (this.disposed) return;
    const wasJoined = !!this.snapshot.group || !!this.expectedGroupId;
    this.resetGroup(true);
    if (wasJoined) void this.transport.leaveGroup().catch(() => {});
    this.disposed = true;
    this.player = null;
    this.launcher = null;
  }
}
