import type {
  MediaSourceInfo,
  PlayMethod,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi, getUserDataApi } from "@jellyfin/sdk/lib/utils/api";
import { useQueryClient } from "@tanstack/react-query";
import i18next from "i18next";
import { useAtomValue } from "jotai";
import type React from "react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { toast } from "sonner-native";
import {
  AUDIOBOOK_CHAPTER_RESTART_SECONDS,
  AUDIOBOOK_LOCAL_SAVE_INTERVAL_MS,
  AUDIOBOOK_LOOKAHEAD_MAX_BYTES,
  AUDIOBOOK_PROGRESS_EVENT_INTERVAL_SECONDS,
  DEFAULT_AUDIOBOOK_PLAYBACK_RATE,
  DEFAULT_AUDIOBOOK_SKIP_BACK_SECONDS,
  DEFAULT_AUDIOBOOK_SKIP_FORWARD_SECONDS,
} from "@/constants/Audiobooks";
import { PROGRESS_REPORT_INTERVAL } from "@/constants/Playback";
import {
  audioStorageEvents,
  downloadTrack,
  getLocalPath,
  initAudioStorage,
  isDownloading,
} from "@/providers/AudioStorage";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
import {
  cancelSleepTimer,
  getSleepTimer,
  onSleepTimerChange,
  onSleepTimerExpired,
  setAudiobookRemoteHandlers,
  setSleepTimer as setServiceSleepTimer,
  setSleepChapterEnd,
  setSleepTimerRate,
} from "@/services/AudiobookPlayback";
import {
  claimAudioOwner,
  getAudioOwner,
  onAudioOwnerChange,
  releaseAudioOwner,
} from "@/services/audioOwner";
import { ensureTrackPlayerSetup } from "@/services/trackPlayerSetup";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { useSettings } from "@/utils/atoms/settings";
import {
  type Audiobook,
  type AudiobookChapter,
  authorLine,
  bookDuration,
  buildChapters,
  chapterDisplayTitle,
  chapterIndexAt,
  locateBookPosition,
  partOffsets,
  secondsToTicksExact,
  ticksToSecondsExact,
  toBookPosition,
} from "@/utils/audiobooks/books";
import { audiobookFileExtension } from "@/utils/audiobooks/fileExtension";
import { audiobookCoverUrl } from "@/utils/audiobooks/images";
import { resolveResumePoint } from "@/utils/audiobooks/progress";
import {
  autoRewindSeconds,
  SLEEP_TIMER_OFF,
  type SleepTimer,
} from "@/utils/audiobooks/sleepTimer";
import {
  type AudiobookBookmark,
  accountKeyFor,
  addBookmark as addStoredBookmark,
  clearSession,
  getAllLocalProgress,
  getLocalProgress,
  getBookmarks as getStoredBookmarks,
  loadSession,
  removeLocalProgress,
  removeBookmark as removeStoredBookmark,
  saveSession,
  setLocalProgress,
} from "@/utils/audiobooks/storage";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { markExpectedError } from "@/utils/errors";
import { getAudioStreamUrl } from "@/utils/jellyfin/audio/getAudioStreamUrl";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";
import { editNativeQueue } from "@/utils/music/nativeQueue";

// The native module does not exist on TV, where audiobooks are not offered.
const TrackPlayer = Platform.isTV
  ? null
  : require("react-native-track-player").default;
const TrackPlayerModule = Platform.isTV
  ? null
  : require("react-native-track-player");
const Capability = TrackPlayerModule?.Capability;
const TrackPlayerEvent = TrackPlayerModule?.Event;
const TrackPlayerState = TrackPlayerModule?.State;
const TPRepeatMode = TrackPlayerModule?.RepeatMode;
const PitchAlgorithm = TrackPlayerModule?.PitchAlgorithm;

type Track = Record<string, unknown> & { id: string; url: string };

/**
 * The audiobook player. It plays on the same native player as music
 * (react-native-track-player), which it takes over through
 * services/audioOwner.ts: starting a book stops music and the other way.
 *
 * A book's parts go into the native queue from the one playing on, so the
 * player moves from part to part by itself, gapless and with the app in the
 * background. `baseIndex` is the part at native index 0: native index i is
 * part baseIndex + i. Going back before the base reloads from there.
 *
 * Jellyfin keeps a position per file, so a book's progress is reported per
 * part. The device keeps its own copy (utils/audiobooks/storage.ts), which
 * plays offline and is sent to the server once it can be.
 */

interface AudiobookPlayerState {
  book: Audiobook | null;
  chapters: AudiobookChapter[];
  /** The part playing. */
  partIndex: number;
  isPlaying: boolean;
  /** A book is being loaded into the native player. */
  isLoading: boolean;
  /** The native player is waiting for data. */
  isBuffering: boolean;
  /**
   * The book is in the native player. A book restored after a restart is
   * only on screen until play loads it.
   */
  isLive: boolean;
  /** Books to play after this one, in order. */
  queue: Audiobook[];
  rate: number;
  sleepTimer: SleepTimer;
  /** Bumped when a book's saved progress changed, for lists that show it. */
  progressRevision: number;
  /** Bumped when bookmarks changed. */
  bookmarksRevision: number;
  /** How the part playing is played, once it is loaded. */
  partMedia: PartMedia | null;
}

/** How a part plays: the file as the server described it, and the method. */
export interface PartMedia {
  /** Null for a file on the device, which needs no server to describe it. */
  mediaSource: MediaSourceInfo | null;
  method: PlayMethod;
}

interface AudiobookProgressState {
  /** Seconds into the book. */
  position: number;
  /** The book's length in seconds. */
  duration: number;
  chapterIndex: number;
}

export interface PlayBookOptions {
  /** Seconds into the book; the resume point when left out. */
  position?: number;
  /** Start from the beginning even when there is a resume point. */
  fromStart?: boolean;
}

interface AudiobookPlayerContextType extends AudiobookPlayerState {
  playBook: (book: Audiobook, options?: PlayBookOptions) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  /** Seconds into the book. */
  seekTo: (position: number) => Promise<void>;
  skipBy: (seconds: number) => Promise<void>;
  skipBackward: () => Promise<void>;
  skipForward: () => Promise<void>;
  nextChapter: () => Promise<void>;
  previousChapter: () => Promise<void>;
  jumpToChapter: (index: number) => Promise<void>;
  setRate: (rate: number) => Promise<void>;
  setSleepTimer: (timer: SleepTimer) => void;
  stop: () => Promise<void>;

  addToQueue: (book: Audiobook) => void;
  playNext: (book: Audiobook) => void;
  removeFromQueue: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  playFromQueue: (index: number) => void;

  markFinished: (book: Audiobook) => Promise<void>;
  markUnfinished: (book: Audiobook) => Promise<void>;

  addBookmark: () => AudiobookBookmark | null;
  removeBookmark: (bookId: string, bookmarkId: string) => void;
  getBookmarks: (bookId: string) => AudiobookBookmark[];
}

const initialState: AudiobookPlayerState = {
  book: null,
  chapters: [],
  partIndex: 0,
  isPlaying: false,
  isLoading: false,
  isBuffering: false,
  isLive: false,
  queue: [],
  rate: DEFAULT_AUDIOBOOK_PLAYBACK_RATE,
  sleepTimer: SLEEP_TIMER_OFF,
  progressRevision: 0,
  bookmarksRevision: 0,
  partMedia: null,
};

const initialProgress: AudiobookProgressState = {
  position: 0,
  duration: 0,
  chapterIndex: -1,
};

const AudiobookPlayerContext = createContext<
  AudiobookPlayerContextType | undefined
>(undefined);
const AudiobookProgressContext =
  createContext<AudiobookProgressState>(initialProgress);

export const useAudiobookPlayer = () => {
  const context = useContext(AudiobookPlayerContext);
  if (!context) {
    throw new Error(
      "useAudiobookPlayer must be used within AudiobookPlayerProvider",
    );
  }
  return context;
};

/**
 * The position, which changes every second while a book plays. Apart from
 * the player state so a list of books does not draw again each second.
 */
export const useAudiobookProgress = () => useContext(AudiobookProgressContext);

interface Props {
  children: ReactNode;
}

const noop = () => {};
const asyncNoop = async () => {};

const TVAudiobookPlayerProvider: React.FC<Props> = ({ children }) => {
  const value = useMemo<AudiobookPlayerContextType>(
    () => ({
      ...initialState,
      playBook: asyncNoop,
      play: asyncNoop,
      pause: asyncNoop,
      togglePlayPause: asyncNoop,
      seekTo: asyncNoop,
      skipBy: asyncNoop,
      skipBackward: asyncNoop,
      skipForward: asyncNoop,
      nextChapter: asyncNoop,
      previousChapter: asyncNoop,
      jumpToChapter: asyncNoop,
      setRate: asyncNoop,
      setSleepTimer: noop,
      stop: asyncNoop,
      addToQueue: noop,
      playNext: noop,
      removeFromQueue: noop,
      moveInQueue: noop,
      clearQueue: noop,
      playFromQueue: noop,
      markFinished: asyncNoop,
      markUnfinished: asyncNoop,
      addBookmark: () => null,
      removeBookmark: noop,
      getBookmarks: () => [],
    }),
    [],
  );
  return (
    <AudiobookPlayerContext.Provider value={value}>
      {children}
    </AudiobookPlayerContext.Provider>
  );
};

interface PreparedPart extends PartMedia {
  track: Track;
  sessionId: string | null;
}

const ownsPlayer = () => getAudioOwner() === "audiobook";

const MobileAudiobookPlayerProvider: React.FC<Props> = ({ children }) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const { isConnected, serverConnected } = useNetworkStatus();
  const isOffline = !isConnected || serverConnected === false;

  const account = accountKeyFor(user);

  const [state, setState] = useState<AudiobookPlayerState>(() => ({
    ...initialState,
    rate: settings?.audiobookPlaybackRate ?? DEFAULT_AUDIOBOOK_PLAYBACK_RATE,
  }));
  const [progress, setProgressState] =
    useState<AudiobookProgressState>(initialProgress);

  // Native events and the remote buttons call in long after a render, so the
  // values they act on live in refs, kept in step with the state.
  const apiRef = useRef(api);
  apiRef.current = api;
  const userIdRef = useRef(user?.Id);
  userIdRef.current = user?.Id;
  const accountRef = useRef(account);
  accountRef.current = account;
  const offlineRef = useRef(isOffline);
  offlineRef.current = isOffline;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const updateSettingsRef = useRef(updateSettings);
  updateSettingsRef.current = updateSettings;

  const bookRef = useRef<Audiobook | null>(null);
  const chaptersRef = useRef<AudiobookChapter[]>([]);
  const partIndexRef = useRef(0);
  const partPositionRef = useRef(0);
  const baseIndexRef = useRef(0);
  const loadedCountRef = useRef(0);
  const liveRef = useRef(false);
  const playingRef = useRef(false);
  const queueRef = useRef<Audiobook[]>([]);
  const rateRef = useRef(state.rate);
  const chapterIndexRef = useRef(-1);
  // Each load bumps it; async work for an older load gives up when it moved.
  const loadSeqRef = useRef(0);
  const sessionsRef = useRef<
    Record<string, PartMedia & { sessionId: string | null }>
  >({});
  const lastSaveAtRef = useRef(0);
  const lastReportAtRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const restoredForRef = useRef<string | null>(null);
  const previousAccountRef = useRef<string | null>(null);

  const bookPosition = useCallback(() => {
    const book = bookRef.current;
    return book
      ? toBookPosition(book, partIndexRef.current, partPositionRef.current)
      : 0;
  }, []);

  const bumpProgressRevision = useCallback(() => {
    setState((prev) => ({
      ...prev,
      progressRevision: prev.progressRevision + 1,
    }));
  }, []);

  // ------------------------------------------------------------ sleep timer

  // An end of chapter timer waits for the end of the chapter playing, in the
  // coordinates the native progress reports use.
  const updateSleepChapterEnd = useCallback(() => {
    const book = bookRef.current;
    const chapter = chaptersRef.current[chapterIndexRef.current];
    if (!book || !chapter) {
      setSleepChapterEnd(null);
      return;
    }
    setSleepChapterEnd({
      nativeIndex: chapter.partIndex - baseIndexRef.current,
      partPosition: chapter.end - (partOffsets(book)[chapter.partIndex] ?? 0),
    });
  }, []);

  // ---------------------------------------------------------- lock screen

  const chapterTitleAt = useCallback((index: number) => {
    const chapter = chaptersRef.current[index];
    if (!chapter) return null;
    return chapterDisplayTitle(chapter, index, (number) =>
      i18next.t("chapters.chapter_number", { number }),
    );
  }, []);

  // The lock screen names the chapter, with the book under it, once the book
  // has chapters to tell apart.
  const showChapterOnLockScreen = useCallback(() => {
    const book = bookRef.current;
    if (!TrackPlayer || !book || !liveRef.current || !ownsPlayer()) return;
    if (chaptersRef.current.length < 2) return;
    const title = chapterTitleAt(chapterIndexRef.current);
    if (!title) return;
    const nativeIndex = partIndexRef.current - baseIndexRef.current;
    TrackPlayer.updateMetadataForTrack(nativeIndex, {
      title,
      artist: book.title,
      album: authorLine(book) ?? book.title,
    }).catch(() => {
      // The track went away with a load or a stop.
    });
  }, [chapterTitleAt]);

  // ---------------------------------------------------------------- position

  /** How a loaded part plays, from what was kept when it was queued. */
  const partMediaAt = useCallback((partIndex: number): PartMedia | null => {
    const partId = bookRef.current?.parts[partIndex]?.Id;
    const session = partId ? sessionsRef.current[partId] : undefined;
    return session
      ? { mediaSource: session.mediaSource, method: session.method }
      : null;
  }, []);

  /** Moves the position on screen and in the refs. */
  const setPosition = useCallback(
    (partIndex: number, partPosition: number) => {
      const book = bookRef.current;
      if (!book) return;
      const partChanged = partIndex !== partIndexRef.current;
      partIndexRef.current = partIndex;
      partPositionRef.current = partPosition;
      const position = toBookPosition(book, partIndex, partPosition);
      const chapterIndex = chapterIndexAt(chaptersRef.current, position);
      const chapterChanged = chapterIndex !== chapterIndexRef.current;
      chapterIndexRef.current = chapterIndex;
      setProgressState({
        position,
        duration: bookDuration(book),
        chapterIndex,
      });
      if (partChanged) {
        setState((prev) => ({
          ...prev,
          partIndex,
          partMedia: partMediaAt(partIndex),
        }));
      }
      if (chapterChanged) {
        updateSleepChapterEnd();
        showChapterOnLockScreen();
      }
    },
    [updateSleepChapterEnd, showChapterOnLockScreen, partMediaAt],
  );

  // ------------------------------------------------------------- persisting

  /** Writes where the book is to the device: its progress and the session. */
  const persist = useCallback((options: { finished?: boolean } = {}) => {
    const book = bookRef.current;
    const accountKey = accountRef.current;
    if (!book || !accountKey) return;
    const part = book.parts[partIndexRef.current];
    const previous = getLocalProgress(accountKey, book.id);
    setLocalProgress(accountKey, {
      bookId: book.id,
      partIndex: partIndexRef.current,
      partPosition: partPositionRef.current,
      updatedAt: Date.now(),
      finished: options.finished ?? false,
      // What the server has not heard yet: the latest position is all it
      // needs once it can be told.
      pendingSyncItemId: offlineRef.current
        ? (part?.Id ?? null)
        : (previous?.pendingSyncItemId ?? null),
    });
    saveSession({
      account: accountKey,
      book,
      partIndex: partIndexRef.current,
      partPosition: partPositionRef.current,
      queue: queueRef.current,
    });
    lastSaveAtRef.current = Date.now();
  }, []);

  // --------------------------------------------------------------- reporting

  const reportStart = useCallback(
    async (partIndex: number, positionSeconds: number, paused: boolean) => {
      const api = apiRef.current;
      const part = bookRef.current?.parts[partIndex];
      if (!api || !part?.Id || offlineRef.current) return;
      const session = sessionsRef.current[part.Id];
      lastReportAtRef.current = Date.now();
      try {
        await getSessionApi(api).reportPlaybackStart({
          playbackStartInfo: {
            ItemId: part.Id,
            PlaySessionId: session?.sessionId ?? undefined,
            PositionTicks: secondsToTicksExact(positionSeconds),
            CanSeek: true,
            IsPaused: paused,
            IsMuted: false,
            PlayMethod: session?.method ?? "DirectStream",
          },
        });
      } catch {
        // A report the server missed: the next one carries the position.
      }
    },
    [],
  );

  const reportProgress = useCallback(async (paused: boolean) => {
    const api = apiRef.current;
    const part = bookRef.current?.parts[partIndexRef.current];
    if (!api || !part?.Id || offlineRef.current) return;
    const session = sessionsRef.current[part.Id];
    lastReportAtRef.current = Date.now();
    try {
      await getSessionApi(api).reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: part.Id,
          PlaySessionId: session?.sessionId ?? undefined,
          PositionTicks: secondsToTicksExact(partPositionRef.current),
          CanSeek: true,
          IsPaused: paused,
          IsMuted: false,
          PlayMethod: session?.method ?? "DirectStream",
        },
      });
    } catch {
      // As above.
    }
  }, []);

  const reportStop = useCallback(
    async (partIndex: number, positionSeconds: number) => {
      const api = apiRef.current;
      const part = bookRef.current?.parts[partIndex];
      if (!api || !part?.Id || offlineRef.current) return;
      const session = sessionsRef.current[part.Id];
      try {
        await getSessionApi(api).reportPlaybackStopped({
          playbackStopInfo: {
            ItemId: part.Id,
            PlaySessionId: session?.sessionId ?? undefined,
            PositionTicks: secondsToTicksExact(positionSeconds),
          },
        });
      } catch {
        // The device copy keeps the position.
      }
    },
    [],
  );

  // ------------------------------------------------------------ native player

  const applyAudiobookPlayerOptions = useCallback(async () => {
    if (!TrackPlayer) return;
    const back =
      settingsRef.current?.audiobookSkipBackSeconds ??
      DEFAULT_AUDIOBOOK_SKIP_BACK_SECONDS;
    const forward =
      settingsRef.current?.audiobookSkipForwardSeconds ??
      DEFAULT_AUDIOBOOK_SKIP_FORWARD_SECONDS;
    await TrackPlayer.updateOptions({
      // Jumps rather than skips: a lock screen shows one pair or the other.
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.JumpBackward,
        Capability.JumpForward,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.JumpBackward,
        Capability.Play,
        Capability.Pause,
        Capability.JumpForward,
      ],
      backwardJumpInterval: back,
      forwardJumpInterval: forward,
      // The sleep timer counts on these, see services/AudiobookPlayback.ts.
      progressUpdateEventInterval: AUDIOBOOK_PROGRESS_EVENT_INTERVAL_SECONDS,
    });
    // A book's parts never loop, whatever music left the player at.
    await TrackPlayer.setRepeatMode(TPRepeatMode?.Off);
  }, []);

  const buildTrack = useCallback(
    (book: Audiobook, partIndex: number, url: string, isLocal: boolean) => {
      const api = apiRef.current;
      const part = book.parts[partIndex];
      const artwork = audiobookCoverUrl(api, book, 512);
      const artworkHeaders = api
        ? getJellyfinHeadersForUrl(artwork ?? undefined, api.basePath)
        : undefined;
      const track: Track = {
        id: part?.Id ?? "",
        url,
        title:
          book.parts.length > 1 ? part?.Name || book.title : book.title || "",
        artist: authorLine(book) ?? book.title,
        album: book.title,
        artwork:
          artwork && artworkHeaders
            ? { uri: artwork, headers: artworkHeaders }
            : (artwork ?? undefined),
        duration: ticksToSecondsExact(part?.RunTimeTicks) || undefined,
        // Speech stretched to another speed keeps its pitch better this way.
        pitchAlgorithm: PitchAlgorithm?.Voice,
        // Marks the track as a book's for anything reading the native queue.
        audiobookId: book.id,
      };
      if (!isLocal && api) {
        const headers = getJellyfinHeadersForUrl(url, api.basePath);
        if (headers) track.headers = headers;
      }
      return track;
    },
    [],
  );

  /** The track for a part: the downloaded or cached file, else a stream. */
  const preparePart = useCallback(
    async (
      book: Audiobook,
      partIndex: number,
    ): Promise<PreparedPart | null> => {
      const part = book.parts[partIndex];
      const api = apiRef.current;
      const userId = userIdRef.current;
      if (!part?.Id) return null;
      const local = getLocalPath(part.Id);
      if (local) {
        return {
          track: buildTrack(book, partIndex, local, true),
          sessionId: null,
          method: "DirectPlay",
          mediaSource: null,
        };
      }
      if (!api || !userId || offlineRef.current) return null;
      const stream = await getAudioStreamUrl(api, userId, part.Id);
      if (!stream) {
        // The server did not answer: a file cached since is still good.
        const fallback = getLocalPath(part.Id);
        return fallback
          ? {
              track: buildTrack(book, partIndex, fallback, true),
              sessionId: null,
              method: "DirectPlay",
              mediaSource: null,
            }
          : null;
      }
      return {
        track: buildTrack(book, partIndex, stream.url, false),
        sessionId: stream.sessionId,
        method: stream.isTranscoding ? "Transcode" : "DirectStream",
        mediaSource: stream.mediaSource ?? null,
      };
    },
    [buildTrack],
  );

  /** Fetches the part after `partIndex` into the audio cache, when small enough. */
  const cacheNextPart = useCallback(
    async (book: Audiobook, partIndex: number) => {
      const api = apiRef.current;
      const userId = userIdRef.current;
      const next = book.parts[partIndex + 1];
      if (settingsRef.current?.audiobookCacheNextPart === false) return;
      if (!api || !userId || !next?.Id || offlineRef.current) return;
      if (getLocalPath(next.Id) || isDownloading(next.Id)) return;
      try {
        const stream = await getAudioStreamUrl(api, userId, next.Id);
        // A live transcode is no file to keep.
        if (!stream || stream.isTranscoding) return;
        const size = stream.mediaSource?.Size ?? 0;
        // At most half the cache, so a part never pushes out everything else.
        const cacheBytes =
          ((settingsRef.current?.audioMaxCacheSizeMB ?? 500) * 1024 * 1024) / 2;
        if (!size || size > Math.min(AUDIOBOOK_LOOKAHEAD_MAX_BYTES, cacheBytes))
          return;
        await downloadTrack(next.Id, stream.url, {
          permanent: false,
          container: audiobookFileExtension(stream.mediaSource?.Container),
          headers: getJellyfinHeadersForUrl(stream.url, api.basePath),
        });
      } catch {
        // Caching ahead is best effort: the part streams instead.
      }
    },
    [],
  );

  /** Queues the parts after `fromIndex` behind it, one network round trip each. */
  const appendFollowingParts = useCallback(
    async (book: Audiobook, fromIndex: number, seq: number) => {
      const stale = () => seq !== loadSeqRef.current || !ownsPlayer();
      for (let i = fromIndex + 1; i < book.parts.length; i++) {
        const prepared = await preparePart(book, i);
        if (stale()) return;
        // A part that cannot load ends the native queue there: the queue end
        // handler loads from it again, and the native indexes stay in order.
        if (!prepared) return;
        const added = await editNativeQueue(async () => {
          if (stale()) return false;
          await TrackPlayer.add(prepared.track);
          return true;
        });
        if (!added) return;
        loadedCountRef.current = i - baseIndexRef.current + 1;
        const partId = book.parts[i].Id;
        if (partId) {
          sessionsRef.current[partId] = {
            sessionId: prepared.sessionId,
            method: prepared.method,
            mediaSource: prepared.mediaSource,
          };
        }
      }
    },
    [preparePart],
  );

  /**
   * Loads a book into the native player at a part and a position in it, and
   * plays it unless `autoplay` is false.
   */
  const loadBook = useCallback(
    async (
      book: Audiobook,
      partIndex: number,
      partPosition: number,
      autoplay: boolean,
    ) => {
      if (!TrackPlayer || book.parts.length === 0) return;
      const seq = ++loadSeqRef.current;
      const stale = () => seq !== loadSeqRef.current;

      // Leaving a book, or a part of this one: the server hears where.
      const previous = bookRef.current;
      if (previous && liveRef.current && ownsPlayer()) {
        reportStop(partIndexRef.current, partPositionRef.current);
        persist();
      }

      // Music lets go at once (MusicPlayerProvider listens for this).
      claimAudioOwner("audiobook");

      const chapters =
        previous?.id === book.id && chaptersRef.current.length > 0
          ? chaptersRef.current
          : buildChapters(book);
      bookRef.current = book;
      chaptersRef.current = chapters;
      liveRef.current = false;
      chapterIndexRef.current = -1;
      setState((prev) => ({
        ...prev,
        book,
        chapters,
        partIndex,
        isLoading: true,
        isLive: false,
      }));
      setPosition(partIndex, partPosition);

      try {
        await initAudioStorage();
        await ensureTrackPlayerSetup();
        if (stale()) return;
        await applyAudiobookPlayerOptions();
        if (stale()) return;

        const prepared = await preparePart(book, partIndex);
        if (stale()) return;
        if (!prepared) {
          setState((prev) => ({ ...prev, isLoading: false }));
          toast.error(
            i18next.t(
              offlineRef.current
                ? "audiobooks.not_downloaded"
                : "audiobooks.failed_to_load",
            ),
          );
          return;
        }

        const loaded = await editNativeQueue(async () => {
          if (stale()) return false;
          await TrackPlayer.reset();
          if (stale()) return false;
          await TrackPlayer.add(prepared.track);
          if (partPosition > 0) await TrackPlayer.seekTo(partPosition);
          if (autoplay) await TrackPlayer.play();
          // After play: AVPlayer's play() puts the rate back to 1.
          await TrackPlayer.setRate(rateRef.current);
          return !stale();
        });
        if (!loaded) return;

        const partId = book.parts[partIndex].Id;
        sessionsRef.current = partId
          ? {
              [partId]: {
                sessionId: prepared.sessionId,
                method: prepared.method,
                mediaSource: prepared.mediaSource,
              },
            }
          : {};
        baseIndexRef.current = partIndex;
        loadedCountRef.current = 1;
        liveRef.current = true;
        playingRef.current = autoplay;
        pausedAtRef.current = autoplay ? null : Date.now();
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isLive: true,
          isPlaying: autoplay,
          partMedia: partMediaAt(partIndex),
        }));
        updateSleepChapterEnd();
        showChapterOnLockScreen();
        reportStart(partIndex, partPosition, !autoplay);
        persist();
        bumpProgressRevision();

        cacheNextPart(book, partIndex);
        appendFollowingParts(book, partIndex, seq);
      } catch (error) {
        // Tapping play just stops spinning when this fails. Android refuses
        // the setup while the app is in the background: an expected outcome.
        logAndCaptureError(
          "Loading an audiobook failed",
          (error as { code?: string } | null)?.code ===
            "android_cannot_setup_player_in_background"
            ? markExpectedError(error)
            : error,
        );
        if (!stale()) setState((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [
      applyAudiobookPlayerOptions,
      appendFollowingParts,
      bumpProgressRevision,
      cacheNextPart,
      persist,
      preparePart,
      reportStart,
      reportStop,
      setPosition,
      showChapterOnLockScreen,
      updateSleepChapterEnd,
    ],
  );

  // ----------------------------------------------------------------- actions

  const seekTo = useCallback(
    async (position: number) => {
      const book = bookRef.current;
      if (!book || !TrackPlayer) return;
      const duration = bookDuration(book);
      const target = Math.min(Math.max(position, 0), Math.max(duration - 1, 0));
      const { partIndex, partPosition } = locateBookPosition(book, target);

      // A restored book is only on screen: move it there, play loads it.
      if (!liveRef.current || !ownsPlayer()) {
        setPosition(partIndex, partPosition);
        persist();
        return;
      }

      const nativeIndex = partIndex - baseIndexRef.current;
      if (partIndex === partIndexRef.current) {
        setPosition(partIndex, partPosition);
        await TrackPlayer.seekTo(partPosition).catch(() => {});
      } else if (nativeIndex >= 0 && nativeIndex < loadedCountRef.current) {
        // The track change handler reports the part change.
        await editNativeQueue(() =>
          TrackPlayer.skip(nativeIndex, partPosition),
        ).catch(() => {});
        setPosition(partIndex, partPosition);
      } else {
        await loadBook(book, partIndex, partPosition, playingRef.current);
        return;
      }
      updateSleepChapterEnd();
      persist();
    },
    [loadBook, persist, setPosition, updateSleepChapterEnd],
  );

  const skipBy = useCallback(
    async (seconds: number) => seekTo(bookPosition() + seconds),
    [seekTo, bookPosition],
  );

  const skipBackward = useCallback(
    () =>
      skipBy(
        -(
          settingsRef.current?.audiobookSkipBackSeconds ??
          DEFAULT_AUDIOBOOK_SKIP_BACK_SECONDS
        ),
      ),
    [skipBy],
  );

  const skipForward = useCallback(
    () =>
      skipBy(
        settingsRef.current?.audiobookSkipForwardSeconds ??
          DEFAULT_AUDIOBOOK_SKIP_FORWARD_SECONDS,
      ),
    [skipBy],
  );

  const jumpToChapter = useCallback(
    async (index: number) => {
      const chapter = chaptersRef.current[index];
      if (chapter) await seekTo(chapter.start);
    },
    [seekTo],
  );

  const nextChapter = useCallback(async () => {
    const index = chapterIndexAt(chaptersRef.current, bookPosition());
    if (index + 1 < chaptersRef.current.length) await jumpToChapter(index + 1);
  }, [bookPosition, jumpToChapter]);

  const previousChapter = useCallback(async () => {
    const position = bookPosition();
    const index = chapterIndexAt(chaptersRef.current, position);
    const chapter = chaptersRef.current[index];
    if (!chapter) return;
    if (position - chapter.start > AUDIOBOOK_CHAPTER_RESTART_SECONDS) {
      await seekTo(chapter.start);
    } else {
      await jumpToChapter(Math.max(index - 1, 0));
    }
  }, [bookPosition, jumpToChapter, seekTo]);

  const play = useCallback(async () => {
    const book = bookRef.current;
    if (!book || !TrackPlayer) return;
    const autoRewind = settingsRef.current?.audiobookAutoRewind !== false;

    if (!liveRef.current || !ownsPlayer()) {
      let position = bookPosition();
      // A book played to its end starts over.
      if (position >= bookDuration(book) - 1) {
        await loadBook(book, 0, 0, true);
        return;
      }
      if (autoRewind) {
        const saved = getLocalProgress(accountRef.current, book.id);
        if (saved) position -= autoRewindSeconds(Date.now() - saved.updatedAt);
      }
      const { partIndex, partPosition } = locateBookPosition(
        book,
        Math.max(position, 0),
      );
      await loadBook(book, partIndex, partPosition, true);
      return;
    }

    if (autoRewind && pausedAtRef.current !== null) {
      const seconds = autoRewindSeconds(Date.now() - pausedAtRef.current);
      if (seconds > 0) await seekTo(bookPosition() - seconds);
    }
    pausedAtRef.current = null;
    await TrackPlayer.play().catch(() => {});
    await TrackPlayer.setRate(rateRef.current).catch(() => {});
    playingRef.current = true;
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, [bookPosition, loadBook, seekTo]);

  const pause = useCallback(async () => {
    if (!TrackPlayer || !liveRef.current || !ownsPlayer()) return;
    await TrackPlayer.pause().catch(() => {});
    playingRef.current = false;
    pausedAtRef.current = Date.now();
    setState((prev) => ({ ...prev, isPlaying: false }));
    persist();
    reportProgress(true);
    bumpProgressRevision();
  }, [persist, reportProgress, bumpProgressRevision]);

  const togglePlayPause = useCallback(async () => {
    if (playingRef.current) await pause();
    else await play();
  }, [pause, play]);

  const playBook = useCallback(
    async (book: Audiobook, options: PlayBookOptions = {}) => {
      if (book.parts.length === 0) return;
      const current = bookRef.current;
      const sameBook = current?.id === book.id;

      if (sameBook && liveRef.current && ownsPlayer()) {
        if (options.position !== undefined) await seekTo(options.position);
        else if (options.fromStart) await seekTo(0);
        if (!playingRef.current) await play();
        return;
      }

      let partIndex = 0;
      let partPosition = 0;
      if (options.position !== undefined) {
        ({ partIndex, partPosition } = locateBookPosition(
          book,
          options.position,
        ));
      } else if (!options.fromStart) {
        const point = resolveResumePoint(
          book,
          getLocalProgress(accountRef.current, book.id),
        );
        // A finished book starts over.
        if (!point.finished) {
          partIndex = point.partIndex;
          partPosition = point.partPosition;
        }
      }
      // A book queued to come later starts now: it leaves the queue.
      if (queueRef.current.some((queued) => queued.id === book.id)) {
        queueRef.current = queueRef.current.filter(
          (queued) => queued.id !== book.id,
        );
        setState((prev) => ({ ...prev, queue: queueRef.current }));
      }
      await loadBook(book, partIndex, partPosition, true);
    },
    [loadBook, play, seekTo],
  );

  /** Applies a speed to the player, without remembering it. */
  const applyRate = useCallback(async (rate: number) => {
    rateRef.current = rate;
    setSleepTimerRate(rate);
    setState((prev) => (prev.rate === rate ? prev : { ...prev, rate }));
    if (TrackPlayer && liveRef.current && ownsPlayer()) {
      await TrackPlayer.setRate(rate).catch(() => {});
    }
  }, []);

  // The speed is one for every book, remembered in the settings.
  const setRate = useCallback(
    async (rate: number) => {
      updateSettingsRef.current({ audiobookPlaybackRate: rate });
      await applyRate(rate);
    },
    [applyRate],
  );

  const setSleepTimer = useCallback(
    (timer: SleepTimer) => {
      setServiceSleepTimer(timer);
      updateSleepChapterEnd();
    },
    [updateSleepChapterEnd],
  );

  /** Clears the player; `resetNative` when the native player is still ours. */
  const clearPlayer = useCallback((resetNative: boolean) => {
    loadSeqRef.current += 1;
    cancelSleepTimer();
    setSleepChapterEnd(null);
    if (resetNative && TrackPlayer && ownsPlayer()) {
      editNativeQueue(() => TrackPlayer.reset()).catch(() => {});
      releaseAudioOwner("audiobook");
    }
    clearSession();
    bookRef.current = null;
    chaptersRef.current = [];
    partIndexRef.current = 0;
    partPositionRef.current = 0;
    baseIndexRef.current = 0;
    loadedCountRef.current = 0;
    liveRef.current = false;
    playingRef.current = false;
    queueRef.current = [];
    chapterIndexRef.current = -1;
    sessionsRef.current = {};
    pausedAtRef.current = null;
    setState((prev) => ({
      ...initialState,
      rate: prev.rate,
      progressRevision: prev.progressRevision + 1,
      bookmarksRevision: prev.bookmarksRevision,
    }));
    setProgressState(initialProgress);
  }, []);

  const stop = useCallback(async () => {
    if (bookRef.current && liveRef.current && ownsPlayer()) {
      reportStop(partIndexRef.current, partPositionRef.current);
    }
    persist();
    clearPlayer(true);
  }, [clearPlayer, persist, reportStop]);

  // ------------------------------------------------------------------- queue

  const setQueue = useCallback(
    (queue: Audiobook[]) => {
      queueRef.current = queue;
      setState((prev) => ({ ...prev, queue }));
      if (bookRef.current) persist();
    },
    [persist],
  );

  const addToQueue = useCallback(
    (book: Audiobook) => {
      // With nothing loaded there is nothing to wait for.
      if (!bookRef.current) {
        playBook(book);
        return;
      }
      if (book.id === bookRef.current.id) return;
      setQueue([...queueRef.current.filter((b) => b.id !== book.id), book]);
    },
    [playBook, setQueue],
  );

  const playNext = useCallback(
    (book: Audiobook) => {
      if (!bookRef.current) {
        playBook(book);
        return;
      }
      if (book.id === bookRef.current.id) return;
      setQueue([book, ...queueRef.current.filter((b) => b.id !== book.id)]);
    },
    [playBook, setQueue],
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      if (index < 0 || index >= queueRef.current.length) return;
      setQueue(queueRef.current.filter((_, i) => i !== index));
    },
    [setQueue],
  );

  const moveInQueue = useCallback(
    (from: number, to: number) => {
      const queue = [...queueRef.current];
      if (from < 0 || from >= queue.length || to < 0 || to >= queue.length)
        return;
      const [moved] = queue.splice(from, 1);
      queue.splice(to, 0, moved);
      setQueue(queue);
    },
    [setQueue],
  );

  const clearQueue = useCallback(() => setQueue([]), [setQueue]);

  const playFromQueue = useCallback(
    (index: number) => {
      const book = queueRef.current[index];
      if (book) playBook(book);
    },
    [playBook],
  );

  // ---------------------------------------------------------------- finished

  const invalidateBooks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["audiobooks"] });
  }, [queryClient]);

  const markFinished = useCallback(
    async (book: Audiobook) => {
      const api = apiRef.current;
      const userId = userIdRef.current;
      const lastIndex = book.parts.length - 1;
      setLocalProgress(accountRef.current, {
        bookId: book.id,
        partIndex: lastIndex,
        partPosition: ticksToSecondsExact(book.parts[lastIndex]?.RunTimeTicks),
        updatedAt: Date.now(),
        finished: true,
      });
      bumpProgressRevision();
      if (!api || !userId) return;
      try {
        for (const part of book.parts) {
          if (part.Id) {
            await getUserDataApi(api).markPlayedItem({
              itemId: part.Id,
              userId,
            });
          }
        }
      } catch (error) {
        // The device keeps it finished; the server catches up with a play.
        logAndCaptureError("Marking an audiobook finished failed", error);
      }
      invalidateBooks();
    },
    [bumpProgressRevision, invalidateBooks],
  );

  const markUnfinished = useCallback(
    async (book: Audiobook) => {
      const api = apiRef.current;
      const userId = userIdRef.current;
      removeLocalProgress(accountRef.current, book.id);
      bumpProgressRevision();
      if (!api || !userId) return;
      try {
        for (const part of book.parts) {
          if (part.Id) {
            await getUserDataApi(api).markUnplayedItem({
              itemId: part.Id,
              userId,
            });
          }
        }
      } catch (error) {
        logAndCaptureError("Marking an audiobook unfinished failed", error);
      }
      invalidateBooks();
    },
    [bumpProgressRevision, invalidateBooks],
  );

  // --------------------------------------------------------------- bookmarks

  const addBookmark = useCallback(() => {
    const book = bookRef.current;
    if (!book) return null;
    const bookmark = addStoredBookmark(
      accountRef.current,
      book.id,
      bookPosition(),
      chapterTitleAt(chapterIndexRef.current),
    );
    setState((prev) => ({
      ...prev,
      bookmarksRevision: prev.bookmarksRevision + 1,
    }));
    return bookmark;
  }, [bookPosition, chapterTitleAt]);

  const removeBookmark = useCallback((bookId: string, bookmarkId: string) => {
    removeStoredBookmark(accountRef.current, bookId, bookmarkId);
    setState((prev) => ({
      ...prev,
      bookmarksRevision: prev.bookmarksRevision + 1,
    }));
  }, []);

  const getBookmarks = useCallback(
    (bookId: string) => getStoredBookmarks(accountRef.current, bookId),
    [],
  );

  // ----------------------------------------------------------- native events

  const onActiveTrackChanged = useCallback(
    (event: { index?: number; lastPosition?: number }) => {
      const book = bookRef.current;
      if (!book || !liveRef.current || !ownsPlayer()) return;
      if (event.index === undefined) return;
      const partIndex = baseIndexRef.current + event.index;
      if (partIndex === partIndexRef.current || !book.parts[partIndex]) return;
      // The part before played to its end.
      const previousIndex = partIndexRef.current;
      const previousDuration = ticksToSecondsExact(
        book.parts[previousIndex]?.RunTimeTicks,
      );
      reportStop(previousIndex, event.lastPosition || previousDuration);
      setPosition(partIndex, 0);
      reportStart(partIndex, 0, !playingRef.current);
      persist();
      // The new item may come up at the default speed.
      if (rateRef.current !== 1) TrackPlayer?.setRate(rateRef.current);
      cacheNextPart(book, partIndex);
    },
    [cacheNextPart, persist, reportStart, reportStop, setPosition],
  );

  const onPlaybackState = useCallback(
    (nativeState: string) => {
      if (!bookRef.current || !liveRef.current || !ownsPlayer()) return;
      const playing = nativeState === TrackPlayerState?.Playing;
      const buffering =
        nativeState === TrackPlayerState?.Buffering ||
        nativeState === TrackPlayerState?.Loading;
      const wasPlaying = playingRef.current;
      if (wasPlaying && !playing && !buffering) {
        // Paused from anywhere: the lock screen, headphones, the sleep timer.
        pausedAtRef.current = Date.now();
        persist();
        reportProgress(true);
        bumpProgressRevision();
      } else if (!wasPlaying && playing) {
        pausedAtRef.current = null;
        reportProgress(false);
      }
      if (!buffering) playingRef.current = playing;
      setState((prev) =>
        prev.isPlaying === (buffering ? prev.isPlaying : playing) &&
        prev.isBuffering === buffering
          ? prev
          : {
              ...prev,
              isPlaying: buffering ? prev.isPlaying : playing,
              isBuffering: buffering,
            },
      );
    },
    [bumpProgressRevision, persist, reportProgress],
  );

  const onQueueEnded = useCallback(
    (event: { track?: number; position?: number }) => {
      const book = bookRef.current;
      if (!book || !liveRef.current || !ownsPlayer()) return;
      // Only the end of the part playing, not a queue emptied by a reset.
      const partDuration = ticksToSecondsExact(
        book.parts[partIndexRef.current]?.RunTimeTicks,
      );
      const nativeIndex = partIndexRef.current - baseIndexRef.current;
      if (event.track !== undefined && event.track !== nativeIndex) return;
      if (
        partDuration > 0 &&
        (event.position ?? partPositionRef.current) < partDuration - 5
      ) {
        return;
      }
      const lastIndex = book.parts.length - 1;
      if (partIndexRef.current < lastIndex) {
        // The native queue ran out before the book did: a part failed to
        // queue. Load on from the next one, which tries it again.
        loadBook(book, partIndexRef.current + 1, 0, true);
        return;
      }
      const duration = ticksToSecondsExact(book.parts[lastIndex]?.RunTimeTicks);
      reportStop(lastIndex, duration);
      partPositionRef.current = duration;
      setPosition(lastIndex, duration);
      persist({ finished: true });
      // Nothing is left in the native queue. Not live, so neither loading the
      // next book nor play() reports or saves this one again as unfinished.
      liveRef.current = false;
      playingRef.current = false;
      setState((prev) => ({ ...prev, isPlaying: false, isLive: false }));
      bumpProgressRevision();
      invalidateBooks();
      // On to the next book in the queue, from where it was left.
      const [next, ...rest] = queueRef.current;
      if (next) {
        queueRef.current = rest;
        setState((prev) => ({ ...prev, queue: rest }));
        const point = resolveResumePoint(
          next,
          getLocalProgress(accountRef.current, next.id),
        );
        if (point.finished) loadBook(next, 0, 0, true);
        else loadBook(next, point.partIndex, point.partPosition, true);
      }
    },
    [
      bumpProgressRevision,
      invalidateBooks,
      loadBook,
      persist,
      reportStop,
      setPosition,
    ],
  );

  const onProgress = useCallback(
    (event: { position: number; track?: number }) => {
      const book = bookRef.current;
      if (!book || !liveRef.current || !ownsPlayer()) return;
      const partIndex =
        event.track !== undefined
          ? baseIndexRef.current + event.track
          : partIndexRef.current;
      // A part change is the track change handler's to report.
      if (partIndex !== partIndexRef.current) return;
      setPosition(partIndex, event.position);
      const now = Date.now();
      if (now - lastSaveAtRef.current >= AUDIOBOOK_LOCAL_SAVE_INTERVAL_MS) {
        persist();
      }
      if (now - lastReportAtRef.current >= PROGRESS_REPORT_INTERVAL) {
        reportProgress(!playingRef.current);
      }
    },
    [persist, reportProgress, setPosition],
  );

  // Swaps an upcoming part's stream for the file it was just cached to.
  const onPartCached = useCallback(
    async ({ itemId, localPath }: { itemId: string; localPath: string }) => {
      const book = bookRef.current;
      if (!TrackPlayer || !book || !liveRef.current || !ownsPlayer()) return;
      const partIndex = book.parts.findIndex((part) => part.Id === itemId);
      const nativeIndex = partIndex - baseIndexRef.current;
      if (partIndex <= partIndexRef.current) return;
      if (nativeIndex < 0 || nativeIndex >= loadedCountRef.current) return;
      const url = localPath.startsWith("file://")
        ? localPath
        : `file://${localPath}`;
      const seq = loadSeqRef.current;
      await editNativeQueue(async () => {
        if (seq !== loadSeqRef.current || !ownsPlayer()) return;
        const queue: Track[] = await TrackPlayer.getQueue();
        const track = queue[nativeIndex];
        if (!track || track.id !== itemId || track.url.startsWith("file://"))
          return;
        const { headers: _headers, ...rest } = track;
        await TrackPlayer.remove(nativeIndex);
        await TrackPlayer.add({ ...rest, url }, nativeIndex);
      }).catch(() => {
        // The stream it had plays instead.
      });
    },
    [],
  );

  const handlersRef = useRef({
    onActiveTrackChanged,
    onPlaybackState,
    onQueueEnded,
    onProgress,
    onPartCached,
  });
  handlersRef.current = {
    onActiveTrackChanged,
    onPlaybackState,
    onQueueEnded,
    onProgress,
    onPartCached,
  };

  useEffect(() => {
    if (!TrackPlayer || !TrackPlayerEvent) return;
    const subscriptions = [
      TrackPlayer.addEventListener(
        TrackPlayerEvent.PlaybackActiveTrackChanged,
        (event: { index?: number; lastPosition?: number }) =>
          handlersRef.current.onActiveTrackChanged(event),
      ),
      TrackPlayer.addEventListener(
        TrackPlayerEvent.PlaybackState,
        (event: { state: string }) =>
          handlersRef.current.onPlaybackState(event.state),
      ),
      TrackPlayer.addEventListener(
        TrackPlayerEvent.PlaybackQueueEnded,
        (event: { track?: number; position?: number }) =>
          handlersRef.current.onQueueEnded(event),
      ),
      TrackPlayer.addEventListener(
        TrackPlayerEvent.PlaybackProgressUpdated,
        (event: { position: number; track?: number }) =>
          handlersRef.current.onProgress(event),
      ),
      TrackPlayer.addEventListener(
        TrackPlayerEvent.PlaybackError,
        (error: unknown) => {
          if (!bookRef.current || !liveRef.current || !ownsPlayer()) return;
          // A stream that broke off: the network, not the app. Play retries.
          writeErrorLog("Audiobook playback failed", error);
          setState((prev) => ({
            ...prev,
            isPlaying: false,
            isBuffering: false,
          }));
          playingRef.current = false;
        },
      ),
    ];
    const onComplete = (event: { itemId: string; localPath: string }) => {
      handlersRef.current.onPartCached(event);
    };
    audioStorageEvents.on("complete", onComplete);
    return () => {
      for (const subscription of subscriptions) subscription?.remove?.();
      audioStorageEvents.off("complete", onComplete);
    };
  }, []);

  // ----------------------------------------------------- remote and timer

  const remoteRef = useRef({ skipBy, nextChapter, previousChapter });
  remoteRef.current = { skipBy, nextChapter, previousChapter };
  useEffect(() => {
    setAudiobookRemoteHandlers({
      jump: (seconds) => {
        remoteRef.current.skipBy(seconds);
      },
      nextChapter: () => {
        remoteRef.current.nextChapter();
      },
      previousChapter: () => {
        remoteRef.current.previousChapter();
      },
    });
    return () => setAudiobookRemoteHandlers(null);
  }, []);

  useEffect(() => {
    setState((prev) => ({ ...prev, sleepTimer: getSleepTimer() }));
    const offChange = onSleepTimerChange((sleepTimer) =>
      setState((prev) =>
        prev.sleepTimer === sleepTimer ? prev : { ...prev, sleepTimer },
      ),
    );
    const offExpired = onSleepTimerExpired(() => {
      playingRef.current = false;
      pausedAtRef.current = Date.now();
      persist();
    });
    return () => {
      offChange();
      offExpired();
    };
  }, [persist]);

  // The speed set in the settings, and the remembered one, follow the setting.
  const settingsRate =
    settings?.audiobookPlaybackRate ?? DEFAULT_AUDIOBOOK_PLAYBACK_RATE;
  useEffect(() => {
    if (settingsRate !== rateRef.current) applyRate(settingsRate);
  }, [settingsRate, applyRate]);

  // New skip intervals reach the lock screen while a book plays.
  const skipBack = settings?.audiobookSkipBackSeconds;
  const skipAhead = settings?.audiobookSkipForwardSeconds;
  useEffect(() => {
    if (skipBack === undefined && skipAhead === undefined) return;
    if (liveRef.current && ownsPlayer()) {
      applyAudiobookPlayerOptions().catch(() => {});
    }
  }, [skipBack, skipAhead, applyAudiobookPlayerOptions]);

  // ------------------------------------------------- owner, account, restore

  // Music took the native player: this book is no longer in it. Save where
  // it was and let it go, without touching the player music now uses.
  const letGoRef = useRef<() => void>(() => {});
  letGoRef.current = () => {
    if (!bookRef.current) return;
    if (liveRef.current) {
      reportStop(partIndexRef.current, partPositionRef.current);
    }
    persist();
    clearPlayer(false);
  };
  useEffect(
    () =>
      onAudioOwnerChange((next) => {
        if (next === "music") letGoRef.current();
      }),
    [],
  );

  // Another account: the previous one's book must not play on, or come back.
  useEffect(() => {
    const previous = previousAccountRef.current;
    previousAccountRef.current = account;
    if (previous === null || previous === account) return;
    restoredForRef.current = null;
    clearPlayer(true);
  }, [account, clearPlayer]);

  // The book that was loaded when the app closed comes back paused.
  useEffect(() => {
    if (!account || restoredForRef.current === account) return;
    restoredForRef.current = account;
    const session = loadSession();
    if (!session || session.account !== account || bookRef.current) return;
    const chapters = buildChapters(session.book);
    bookRef.current = session.book;
    chaptersRef.current = chapters;
    queueRef.current = session.queue;
    liveRef.current = false;
    chapterIndexRef.current = -1;
    setState((prev) => ({
      ...prev,
      book: session.book,
      chapters,
      partIndex: session.partIndex,
      queue: session.queue,
      isLive: false,
      isPlaying: false,
    }));
    setPosition(session.partIndex, session.partPosition);
  }, [account, setPosition]);

  // Positions saved while offline go to the server once it is reachable.
  useEffect(() => {
    if (isOffline || !api || !account) return;
    const pending = getAllLocalProgress(account).filter(
      (entry) => entry.pendingSyncItemId,
    );
    if (pending.length === 0) return;
    (async () => {
      for (const entry of pending) {
        try {
          await getSessionApi(api).reportPlaybackStopped({
            playbackStopInfo: {
              ItemId: entry.pendingSyncItemId!,
              PositionTicks: secondsToTicksExact(entry.partPosition),
            },
          });
          setLocalProgress(account, { ...entry, pendingSyncItemId: null });
        } catch {
          // Tried again the next time the server comes back.
        }
      }
      invalidateBooks();
    })();
  }, [isOffline, api, account, invalidateBooks]);

  const value = useMemo<AudiobookPlayerContextType>(
    () => ({
      ...state,
      playBook,
      play,
      pause,
      togglePlayPause,
      seekTo,
      skipBy,
      skipBackward,
      skipForward,
      nextChapter,
      previousChapter,
      jumpToChapter,
      setRate,
      setSleepTimer,
      stop,
      addToQueue,
      playNext,
      removeFromQueue,
      moveInQueue,
      clearQueue,
      playFromQueue,
      markFinished,
      markUnfinished,
      addBookmark,
      removeBookmark,
      getBookmarks,
    }),
    [
      state,
      playBook,
      play,
      pause,
      togglePlayPause,
      seekTo,
      skipBy,
      skipBackward,
      skipForward,
      nextChapter,
      previousChapter,
      jumpToChapter,
      setRate,
      setSleepTimer,
      stop,
      addToQueue,
      playNext,
      removeFromQueue,
      moveInQueue,
      clearQueue,
      playFromQueue,
      markFinished,
      markUnfinished,
      addBookmark,
      removeBookmark,
      getBookmarks,
    ],
  );

  return (
    <AudiobookPlayerContext.Provider value={value}>
      <AudiobookProgressContext.Provider value={progress}>
        {children}
      </AudiobookProgressContext.Provider>
    </AudiobookPlayerContext.Provider>
  );
};

export const AudiobookPlayerProvider: React.FC<Props> = Platform.isTV
  ? TVAudiobookPlayerProvider
  : MobileAudiobookPlayerProvider;
