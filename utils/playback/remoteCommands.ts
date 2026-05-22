/**
 * Pure mapping from a Jellyfin remote-control WebSocket message to a typed
 * action. Dependency-free so it is unit-testable under `bun test`.
 */

/** A WebSocket message envelope (subset). */
export interface RemoteWsMessage {
  MessageType: string;
  Data?: unknown;
}

export type RemoteAction =
  | { kind: "playPause" }
  | { kind: "pause" }
  | { kind: "unpause" }
  | { kind: "stop" }
  | { kind: "seek"; positionMs: number }
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "setVolume"; level: number }
  | { kind: "toggleMute" }
  | { kind: "displayMessage"; text: string };

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const mapPlaystate = (data: Record<string, unknown>): RemoteAction | null => {
  switch (data.Command) {
    case "PlayPause":
      return { kind: "playPause" };
    case "Pause":
      return { kind: "pause" };
    case "Unpause":
      return { kind: "unpause" };
    case "Stop":
      return { kind: "stop" };
    case "NextTrack":
      return { kind: "next" };
    case "PreviousTrack":
      return { kind: "previous" };
    case "Seek": {
      const ticks = data.SeekPositionTicks;
      if (typeof ticks !== "number") return null;
      return { kind: "seek", positionMs: Math.floor(ticks / 10000) };
    }
    default:
      return null;
  }
};

const mapGeneralCommand = (
  data: Record<string, unknown>,
): RemoteAction | null => {
  const args = (data.Arguments ?? {}) as Record<string, unknown>;
  switch (data.Name) {
    case "SetVolume": {
      const volume = Number(args.Volume);
      if (!Number.isFinite(volume)) return null;
      return { kind: "setVolume", level: clamp01(volume / 100) };
    }
    case "Mute":
    case "Unmute":
    case "ToggleMute":
      return { kind: "toggleMute" };
    case "DisplayMessage": {
      const text = args.Text ?? args.Header;
      if (!text) return null;
      return { kind: "displayMessage", text: String(text) };
    }
    default:
      return null;
  }
};

/** Map a remote-control WS message to a typed action, or null if unhandled. */
export const mapRemoteCommand = (
  message: RemoteWsMessage,
): RemoteAction | null => {
  const data = (message.Data ?? {}) as Record<string, unknown>;
  if (message.MessageType === "Playstate") return mapPlaystate(data);
  if (message.MessageType === "GeneralCommand") return mapGeneralCommand(data);
  return null;
};
