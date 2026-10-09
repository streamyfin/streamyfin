import {
  GeneralCommandType,
  PlaybackOrder,
  RepeatMode,
  type SessionInfoDto,
} from "@jellyfin/sdk/lib/generated-client/models";

/** The music player's own repeat setting, as it is persisted and shown. */
export type MusicRepeatMode = "off" | "all" | "one";

/**
 * What `SetShuffleQueue` carries. It is jellyfin-web's own vocabulary and not
 * the `PlaybackOrder` a session reports: the server forwards the command's
 * arguments untouched, so both sides have to speak the sender's words.
 */
export const ShuffleMode = {
  Sorted: "Sorted",
  Shuffle: "Shuffle",
} as const;
export type ShuffleMode = (typeof ShuffleMode)[keyof typeof ShuffleMode];

const REPEAT_MODE_BY_MUSIC_MODE: Record<MusicRepeatMode, RepeatMode> = {
  off: RepeatMode.RepeatNone,
  all: RepeatMode.RepeatAll,
  one: RepeatMode.RepeatOne,
};

export const toJellyfinRepeatMode = (mode: MusicRepeatMode): RepeatMode =>
  REPEAT_MODE_BY_MUSIC_MODE[mode];

export const toPlaybackOrder = (shuffleEnabled: boolean): PlaybackOrder =>
  shuffleEnabled ? PlaybackOrder.Shuffle : PlaybackOrder.Default;

export type PlaybackModeChange =
  | { repeatMode: MusicRepeatMode }
  | { shuffleEnabled: boolean };

/**
 * Reads the `Data` of a `GeneralCommand` socket message. Null for every other
 * command, and for a mode command whose value is missing or unknown: guessing
 * one would change the listener's playback to something nobody asked for.
 */
export const parsePlaybackModeCommand = (
  data: unknown,
): PlaybackModeChange | null => {
  const command = data as
    | { Name?: unknown; Arguments?: Record<string, unknown> | null }
    | null
    | undefined;

  if (command?.Name === GeneralCommandType.SetRepeatMode) {
    const requested = command.Arguments?.RepeatMode;
    const match = (
      Object.entries(REPEAT_MODE_BY_MUSIC_MODE) as [
        MusicRepeatMode,
        RepeatMode,
      ][]
    ).find(([, mode]) => mode === requested);
    return match ? { repeatMode: match[0] } : null;
  }

  if (command?.Name === GeneralCommandType.SetShuffleQueue) {
    const requested = command.Arguments?.ShuffleMode;
    if (requested === ShuffleMode.Shuffle) return { shuffleEnabled: true };
    if (requested === ShuffleMode.Sorted) return { shuffleEnabled: false };
  }

  return null;
};

/** The order the repeat button walks through, the same one jellyfin-web uses. */
const REPEAT_CYCLE: RepeatMode[] = [
  RepeatMode.RepeatNone,
  RepeatMode.RepeatAll,
  RepeatMode.RepeatOne,
];

/** A session that never reported a repeat mode is not repeating. */
export const nextRepeatMode = (
  current: RepeatMode | null | undefined,
): RepeatMode =>
  REPEAT_CYCLE[
    (REPEAT_CYCLE.indexOf(current ?? RepeatMode.RepeatNone) + 1) %
      REPEAT_CYCLE.length
  ];

/**
 * What other clients may send this one. A remote control offers a button only
 * for a command listed here, so the list must not promise more than the app
 * acts on: repeat and shuffle belong to the music player, which TV lacks.
 */
export const supportedCommands = (isTV: boolean): GeneralCommandType[] =>
  isTV
    ? [GeneralCommandType.Play]
    : [
        GeneralCommandType.Play,
        GeneralCommandType.SetRepeatMode,
        GeneralCommandType.SetShuffleQueue,
      ];

export const sessionSupportsCommand = (
  session: SessionInfoDto,
  command: GeneralCommandType,
): boolean => session.SupportedCommands?.includes(command) ?? false;
