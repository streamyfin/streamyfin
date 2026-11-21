import { EventEmitter } from "eventemitter3";
import { Platform } from "react-native";
import { getAudioOwner } from "@/services/audioOwner";
import {
  SLEEP_TIMER_OFF,
  type SleepTimer,
  tickChapterTimer,
  tickDurationTimer,
} from "@/utils/audiobooks/sleepTimer";

// The native module does not exist on TV, same guard as MusicPlayerProvider.
const TrackPlayer = Platform.isTV
  ? null
  : require("react-native-track-player").default;

/**
 * The parts of the audiobook player that have to keep working without the
 * app on screen: the sleep timer and the lock screen's buttons. The playback
 * service feeds them native events, which keep arriving in the background
 * where Android stops JS timers. Module state and not React state for the
 * same reason (see services/MusicNormalization.ts).
 */

let timer: SleepTimer = SLEEP_TIMER_OFF;
let playing = false;
// When the timer last counted, null while paused: a pause stops the clock.
let lastTickAt: number | null = null;
let rate = 1;
// The fade is plain setVolume steps: the track player's fadeOutPause and
// setAnimatedVolume have empty bodies on iOS (TrackPlayer.mm) and never pause.
// Set while the volume is below full for a fade, so it is put back once.
let volumeLowered = false;

/**
 * Where the chapter playing ends, for an end of chapter timer: the index of
 * the part in the native queue and the position in that part. The provider
 * moves it as chapters change.
 */
let chapterEnd: { nativeIndex: number; partPosition: number } | null = null;

const emitter = new EventEmitter<{
  change: (timer: SleepTimer) => void;
  expired: () => void;
}>();

const setVolume = (volume: number) => {
  if (!TrackPlayer) return;
  TrackPlayer.setVolume(volume).catch(() => {
    // The player was torn down: a new one starts at full volume.
  });
};

const restoreVolume = () => {
  if (!volumeLowered) return;
  volumeLowered = false;
  setVolume(1);
};

const applyVolume = (volume: number) => {
  if (volume >= 1) {
    restoreVolume();
    return;
  }
  volumeLowered = true;
  setVolume(volume);
};

const setTimer = (next: SleepTimer) => {
  timer = next;
  lastTickAt = playing ? Date.now() : null;
  emitter.emit("change", timer);
};

const expire = () => {
  setTimer(SLEEP_TIMER_OFF);
  TrackPlayer?.pause()
    .catch(() => {})
    .finally(restoreVolume);
  emitter.emit("expired");
};

export const getSleepTimer = (): SleepTimer => timer;

export const setSleepTimer = (next: SleepTimer) => {
  restoreVolume();
  setTimer(next);
};

export const cancelSleepTimer = () => setSleepTimer(SLEEP_TIMER_OFF);

export const onSleepTimerChange = (listener: (timer: SleepTimer) => void) => {
  emitter.on("change", listener);
  return () => {
    emitter.off("change", listener);
  };
};

/** Fires when a timer ran out and paused the book. */
export const onSleepTimerExpired = (listener: () => void) => {
  emitter.on("expired", listener);
  return () => {
    emitter.off("expired", listener);
  };
};

export const setSleepChapterEnd = (
  next: { nativeIndex: number; partPosition: number } | null,
) => {
  chapterEnd = next;
};

/** The playback speed, which stretches how long the end of a chapter takes. */
export const setSleepTimerRate = (next: number) => {
  rate = next;
};

// ------------------------------------------------- playback service events

const ownsPlayer = () => getAudioOwner() === "audiobook";

export const handleAudiobookPlaybackState = (isPlaying: boolean) => {
  if (playing === isPlaying) return;
  playing = isPlaying;
  lastTickAt = isPlaying ? Date.now() : null;
};

/** A native progress report: `track` is the index in the native queue. */
export const handleAudiobookProgress = (event: {
  position: number;
  track?: number;
}) => {
  if (!ownsPlayer() || timer.mode === "off") return;

  if (timer.mode === "duration") {
    const now = Date.now();
    const elapsed = playing && lastTickAt !== null ? now - lastTickAt : 0;
    lastTickAt = playing ? now : null;
    const tick = tickDurationTimer(timer, elapsed);
    if (tick.expired) {
      expire();
      return;
    }
    timer = tick.timer;
    applyVolume(tick.volume);
    emitter.emit("change", timer);
    return;
  }

  if (!chapterEnd || event.track === undefined) return;
  // A part ended under the timer: the chapter it waited for is over.
  if (event.track > chapterEnd.nativeIndex) {
    expire();
    return;
  }
  if (event.track < chapterEnd.nativeIndex) return;
  const tick = tickChapterTimer(event.position, chapterEnd.partPosition, rate);
  if (tick.expired) {
    expire();
    return;
  }
  applyVolume(tick.volume);
};

/** The native queue moved on to another part. */
export const handleAudiobookTrackChanged = (index?: number) => {
  if (!ownsPlayer() || timer.mode !== "chapter" || !chapterEnd) return;
  if (index !== undefined && index > chapterEnd.nativeIndex) expire();
};

// ---------------------------------------------------- lock screen buttons

export interface AudiobookRemoteHandlers {
  /** Seconds to move, negative to go back. */
  jump: (seconds: number) => void;
  nextChapter: () => void;
  previousChapter: () => void;
}

let remote: AudiobookRemoteHandlers | null = null;

/** Set by the provider while it is mounted, so remote buttons move by book. */
export const setAudiobookRemoteHandlers = (
  handlers: AudiobookRemoteHandlers | null,
) => {
  remote = handlers;
};

/**
 * A jump from the lock screen, the notification or headphones. Without the
 * provider (Android keeps playing after the app is swiped away) it moves in
 * the part the player is on.
 */
export const handleAudiobookRemoteJump = (seconds: number) => {
  if (remote) remote.jump(seconds);
  else TrackPlayer?.seekBy(seconds).catch(() => {});
};

/** Next and previous move by chapter while a book plays. */
export const handleAudiobookRemoteSkip = (direction: "next" | "previous") => {
  if (!remote) return;
  if (direction === "next") remote.nextChapter();
  else remote.previousChapter();
};

/** For tests: back to a fresh module. */
export const resetAudiobookPlaybackForTests = () => {
  timer = SLEEP_TIMER_OFF;
  playing = false;
  lastTickAt = null;
  rate = 1;
  volumeLowered = false;
  chapterEnd = null;
  remote = null;
  emitter.removeAllListeners();
};
