import type { NativePlayerPlaybackActionRequest } from "@/modules/mpv-player/src/NativePlayerPresentation.types";
import type { Controller } from "@/providers/SyncPlay/Controller";
import type { PlayerControls } from "@/providers/SyncPlay/types";
import { secondsToTicks } from "@/utils/time";

export interface NativeSyncPlayPlaybackState {
  positionMs: number;
  playbackSpeed: number;
  isPlaying: boolean;
  isBuffering: boolean;
  awaitingLoad: boolean;
}

interface NativeSyncPlayTransport {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (positionSec: number) => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
}

export const shouldSyncNativePlayback = (
  request: { offline: boolean; syncPlay?: boolean },
  isEnabled: boolean,
): boolean => isEnabled && (!request.offline || request.syncPlay === true);

export function canDispatchNativeSyncPlayAction(
  request: NativePlayerPlaybackActionRequest,
  session: {
    item: { Id?: string | null };
    offline: boolean;
    syncPlay: boolean;
    awaitingLoad: boolean;
  },
  isEnabled: boolean,
): boolean {
  return (
    shouldSyncNativePlayback(session, isEnabled) &&
    (!request.itemId || request.itemId === session.item.Id) &&
    // Play/pause controls the group even before this client's media is ready.
    (!session.awaitingLoad || request.action !== "seek")
  );
}

export function createNativeSyncPlayControls(
  state: NativeSyncPlayPlaybackState,
  transport: NativeSyncPlayTransport,
  isCurrent: () => boolean,
  onError: (action: string, error: unknown) => void,
  itemId: string,
): PlayerControls {
  const run = (action: string, command: () => Promise<void>) => {
    if (!isCurrent() || state.awaitingLoad) return;
    void command().catch((error) => onError(action, error));
  };
  return {
    itemId,
    play: () => run("play", transport.play),
    pause: () => run("pause", transport.pause),
    stop: () => run("stop", transport.stop),
    seekTo: (positionMs) =>
      run("seek", () => transport.seekTo(Math.max(0, positionMs) / 1000)),
    setSpeed: (speed) =>
      run("speed", async () => {
        await transport.setSpeed(speed);
        if (isCurrent()) state.playbackSpeed = speed;
      }),
    getSpeed: () => state.playbackSpeed,
    getCurrentPosition: () => state.positionMs,
    isPlaying: () => isCurrent() && state.isPlaying,
    isBuffering: () => state.awaitingLoad || state.isBuffering,
  };
}

export function dispatchNativeSyncPlayAction(
  request: NativePlayerPlaybackActionRequest,
  controller: Pick<Controller, "unpause" | "pause" | "playPause" | "seek">,
): void {
  switch (request.action) {
    case "play":
      controller.unpause();
      break;
    case "pause":
      controller.pause();
      break;
    case "toggle":
      controller.playPause();
      break;
    case "seek":
      if (!Number.isFinite(request.positionSec)) {
        throw new Error("Native SyncPlay seek requires a finite position");
      }
      controller.seek(secondsToTicks(Math.max(0, request.positionSec)));
      break;
  }
}
