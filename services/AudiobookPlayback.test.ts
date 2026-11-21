const mockPause = jest.fn(async () => {});
const mockSetVolume = jest.fn(async (_volume: number) => {});
const mockSeekBy = jest.fn(async (_offset: number) => {});

// Virtual: the package is installed from git without its built entry point,
// which Metro never needs and Jest cannot resolve.
jest.mock(
  "react-native-track-player",
  () => ({
    __esModule: true,
    default: {
      pause: () => mockPause(),
      setVolume: (volume: number) => mockSetVolume(volume),
      seekBy: (offset: number) => mockSeekBy(offset),
    },
  }),
  { virtual: true },
);

import { AUDIOBOOK_SLEEP_MAX_TICK_MS } from "@/constants/Audiobooks";
import { sleepTimerForMinutes } from "@/utils/audiobooks/sleepTimer";
import {
  cancelSleepTimer,
  getSleepTimer,
  handleAudiobookPlaybackState,
  handleAudiobookProgress,
  handleAudiobookRemoteJump,
  handleAudiobookRemoteSkip,
  handleAudiobookTrackChanged,
  onSleepTimerExpired,
  resetAudiobookPlaybackForTests,
  setAudiobookRemoteHandlers,
  setSleepChapterEnd,
  setSleepTimer,
} from "./AudiobookPlayback";
import { claimAudioOwner, releaseAudioOwner } from "./audioOwner";

let now = 1_000_000;

beforeEach(() => {
  resetAudiobookPlaybackForTests();
  jest.clearAllMocks();
  now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  claimAudioOwner("audiobook");
});

afterEach(() => {
  jest.restoreAllMocks();
  releaseAudioOwner("audiobook");
});

/** One native progress report, `ms` after the last. */
const tick = (ms: number, event: { position: number; track?: number }) => {
  now += ms;
  handleAudiobookProgress(event);
};

describe("a sleep timer for minutes", () => {
  test("counts down while the book plays and pauses it at the end", async () => {
    const expired = jest.fn();
    onSleepTimerExpired(expired);
    handleAudiobookPlaybackState(true);
    setSleepTimer(sleepTimerForMinutes(1));

    for (let second = 0; second < 59; second++)
      tick(1000, { position: second });
    expect(mockPause).not.toHaveBeenCalled();
    tick(1000, { position: 60 });

    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getSleepTimer()).toEqual({ mode: "off" });
  });

  test("a pause stops the clock", () => {
    handleAudiobookPlaybackState(true);
    setSleepTimer(sleepTimerForMinutes(1));
    tick(1000, { position: 1 });
    handleAudiobookPlaybackState(false);
    // An hour paused, then playing again.
    now += 60 * 60_000;
    handleAudiobookPlaybackState(true);
    tick(1000, { position: 2 });

    expect(getSleepTimer()).toMatchObject({ remainingMs: 58_000 });
  });

  test("a report that comes late counts for no more than the cap", () => {
    handleAudiobookPlaybackState(true);
    setSleepTimer(sleepTimerForMinutes(10));
    tick(5 * 60_000, { position: 1 });

    expect(getSleepTimer()).toMatchObject({
      remainingMs: 10 * 60_000 - AUDIOBOOK_SLEEP_MAX_TICK_MS,
    });
  });

  test("fades the volume out and puts it back once it paused", async () => {
    handleAudiobookPlaybackState(true);
    setSleepTimer({ mode: "duration", remainingMs: 6000, totalMs: 60_000 });
    tick(1000, { position: 1 });
    expect(mockSetVolume).toHaveBeenLastCalledWith(0.5);

    for (let i = 0; i < 5; i++) tick(1000, { position: 2 + i });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockSetVolume).toHaveBeenLastCalledWith(1);
  });

  test("cancelling puts the volume back at once", () => {
    handleAudiobookPlaybackState(true);
    setSleepTimer({ mode: "duration", remainingMs: 4000, totalMs: 60_000 });
    tick(1000, { position: 1 });
    cancelSleepTimer();

    expect(mockSetVolume).toHaveBeenLastCalledWith(1);
    expect(getSleepTimer()).toEqual({ mode: "off" });
  });

  test("music playing leaves the timer alone", () => {
    claimAudioOwner("music");
    handleAudiobookPlaybackState(true);
    setSleepTimer(sleepTimerForMinutes(1));
    tick(1000, { position: 1 });

    expect(getSleepTimer()).toMatchObject({ remainingMs: 60_000 });
  });
});

describe("a sleep timer for the end of the chapter", () => {
  beforeEach(() => {
    handleAudiobookPlaybackState(true);
    setSleepTimer({ mode: "chapter" });
    setSleepChapterEnd({ nativeIndex: 0, partPosition: 600 });
  });

  test("pauses as the chapter ends", () => {
    tick(1000, { position: 598, track: 0 });
    expect(mockPause).not.toHaveBeenCalled();
    tick(1000, { position: 599.6, track: 0 });
    expect(mockPause).toHaveBeenCalledTimes(1);
  });

  // A chapter that is a whole file ends with the file: the next report is
  // already in the next one.
  test("pauses when the player moved on to the next part", () => {
    handleAudiobookTrackChanged(1);
    expect(mockPause).toHaveBeenCalledTimes(1);
  });

  test("a report from a part before the chapter's waits", () => {
    tick(1000, { position: 900, track: -1 });
    expect(mockPause).not.toHaveBeenCalled();
  });
});

describe("the lock screen's buttons", () => {
  test("jumps go to the player provider while it is mounted", () => {
    const jump = jest.fn();
    setAudiobookRemoteHandlers({
      jump,
      nextChapter: jest.fn(),
      previousChapter: jest.fn(),
    });
    handleAudiobookRemoteJump(-15);

    expect(jump).toHaveBeenCalledWith(-15);
    expect(mockSeekBy).not.toHaveBeenCalled();
  });

  // Android plays on after the app is swiped away, with no React tree.
  test("without the provider a jump moves in the part playing", () => {
    handleAudiobookRemoteJump(30);
    expect(mockSeekBy).toHaveBeenCalledWith(30);
  });

  test("next and previous move by chapter", () => {
    const nextChapter = jest.fn();
    const previousChapter = jest.fn();
    setAudiobookRemoteHandlers({
      jump: jest.fn(),
      nextChapter,
      previousChapter,
    });
    handleAudiobookRemoteSkip("next");
    handleAudiobookRemoteSkip("previous");

    expect(nextChapter).toHaveBeenCalledTimes(1);
    expect(previousChapter).toHaveBeenCalledTimes(1);
  });
});
