import { NativeModule, requireNativeModule } from "expo";
import type { EventSubscription } from "expo-modules-core";
import type {
  AudioTrack,
  SubtitleTrack,
  TechnicalInfo,
} from "./MpvPlayer.types";
import type {
  NativePlayerChapter,
  NativePlayerConfig,
  NativePlayerEpisodeListItem,
  NativePlayerEvents,
  NativePlayerMetadata,
  NativePlayerNextEpisode,
  NativePlayerSegment,
  NativePlayerSubtitleSearchState,
  NativePlayerTrackMenus,
  NativePlayerTrickplay,
} from "./NativePlayerPresentation.types";

declare class NativePlayerModuleType extends NativeModule<NativePlayerEvents> {
  presentPlayer(config: NativePlayerConfig): Promise<void>;
  load(config: NativePlayerConfig): Promise<void>;
  dismiss(): Promise<void>;
  isPresented(): boolean;
  updateSegments(segments: NativePlayerSegment[]): Promise<void>;
  updateNextEpisode(next: NativePlayerNextEpisode | null): Promise<void>;
  updateChapters(chapters: NativePlayerChapter[]): Promise<void>;
  updateTrickplay(trickplay: NativePlayerTrickplay | null): Promise<void>;
  updateTrackMenus(menus: NativePlayerTrackMenus): Promise<void>;
  updateMetadata(metadata: NativePlayerMetadata): Promise<void>;
  updateEpisodeList(episodes: NativePlayerEpisodeListItem[]): Promise<void>;
  updateSubtitleSearch(state: NativePlayerSubtitleSearchState): Promise<void>;
  showNotice(text: string): Promise<void>;
  addExternalSubtitle(url: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(positionSec: number): Promise<void>;
  setSpeed(speed: number): Promise<void>;
  getCurrentPosition(): Promise<number>;
  getDuration(): Promise<number>;
  getSubtitleTracks(): Promise<SubtitleTrack[]>;
  setSubtitleTrack(mpvId: number): Promise<void>;
  disableSubtitles(): Promise<void>;
  getAudioTracks(): Promise<AudioTrack[]>;
  setAudioTrack(mpvId: number): Promise<void>;
  getTechnicalInfo(): Promise<TechnicalInfo>;
}

// The NativePlayer module only ships on iOS (iPhone/iPad). Resolve it
// optionally so Android/TV bundles that import this file don't crash —
// same pattern as modules/top-shelf-cache.
let NativePlayerNativeModule: NativePlayerModuleType | null = null;
try {
  NativePlayerNativeModule =
    requireNativeModule<NativePlayerModuleType>("NativePlayer");
} catch {
  NativePlayerNativeModule = null;
}

export const isNativePlayerModuleAvailable = (): boolean =>
  NativePlayerNativeModule !== null;

/**
 * Attach a NativePlayer event listener. IMPORTANT: attach every listener
 * BEFORE calling presentNativePlayer — module events emitted with no
 * listener are dropped.
 */
export const addNativePlayerListener = <K extends keyof NativePlayerEvents>(
  event: K,
  listener: NativePlayerEvents[K],
): EventSubscription | null =>
  NativePlayerNativeModule?.addListener(event, listener) ?? null;

export const presentNativePlayer = (
  config: NativePlayerConfig,
): Promise<void> => {
  if (!NativePlayerNativeModule) {
    return Promise.reject(
      new Error("NativePlayer module is not available on this platform"),
    );
  }
  return NativePlayerNativeModule.presentPlayer(config);
};

/** In-place stream swap while presented (re-negotiation / episode change). */
export const loadNativePlayerStream = (
  config: NativePlayerConfig,
): Promise<void> => {
  if (!NativePlayerNativeModule) {
    return Promise.reject(
      new Error("NativePlayer module is not available on this platform"),
    );
  }
  return NativePlayerNativeModule.load(config);
};

/** Idempotent — resolves even when no player is presented. */
export const dismissNativePlayer = (): Promise<void> =>
  NativePlayerNativeModule?.dismiss() ?? Promise.resolve();

export const isNativePlayerPresented = (): boolean =>
  NativePlayerNativeModule?.isPresented() ?? false;

export const updateNativePlayerSegments = (
  segments: NativePlayerSegment[],
): Promise<void> =>
  NativePlayerNativeModule?.updateSegments(segments) ?? Promise.resolve();

export const updateNativePlayerNextEpisode = (
  next: NativePlayerNextEpisode | null,
): Promise<void> =>
  NativePlayerNativeModule?.updateNextEpisode(next) ?? Promise.resolve();

export const updateNativePlayerChapters = (
  chapters: NativePlayerChapter[],
): Promise<void> =>
  NativePlayerNativeModule?.updateChapters(chapters) ?? Promise.resolve();

export const updateNativePlayerTrickplay = (
  trickplay: NativePlayerTrickplay | null,
): Promise<void> =>
  NativePlayerNativeModule?.updateTrickplay(trickplay) ?? Promise.resolve();

export const updateNativePlayerTrackMenus = (
  menus: NativePlayerTrackMenus,
): Promise<void> =>
  NativePlayerNativeModule?.updateTrackMenus(menus) ?? Promise.resolve();

export const updateNativePlayerMetadata = (
  metadata: NativePlayerMetadata,
): Promise<void> =>
  NativePlayerNativeModule?.updateMetadata(metadata) ?? Promise.resolve();

export const updateNativePlayerEpisodeList = (
  episodes: NativePlayerEpisodeListItem[],
): Promise<void> =>
  NativePlayerNativeModule?.updateEpisodeList(episodes) ?? Promise.resolve();

export const updateNativePlayerSubtitleSearch = (
  state: NativePlayerSubtitleSearchState,
): Promise<void> =>
  NativePlayerNativeModule?.updateSubtitleSearch(state) ?? Promise.resolve();

/**
 * Transient one-line notice on the player's own notice surface, the same one
 * the "… skipped" segment message uses. For anything the JS coordinator
 * decides and the native UI cannot know, such as the automatic subtitles
 * switching on while the sound is muted.
 */
export const nativePlayerShowNotice = (text: string): Promise<void> =>
  NativePlayerNativeModule?.showNotice(text) ?? Promise.resolve();

/** Adds a client-side downloaded sidecar subtitle to the live stream and selects it. */
export const nativePlayerAddExternalSubtitle = (url: string): Promise<void> =>
  NativePlayerNativeModule?.addExternalSubtitle(url) ?? Promise.resolve();

export const nativePlayerPlay = (): Promise<void> =>
  NativePlayerNativeModule?.play() ?? Promise.resolve();

export const nativePlayerPause = (): Promise<void> =>
  NativePlayerNativeModule?.pause() ?? Promise.resolve();

export const nativePlayerSeekTo = (positionSec: number): Promise<void> =>
  NativePlayerNativeModule?.seekTo(positionSec) ?? Promise.resolve();

export const nativePlayerSetSpeed = (speed: number): Promise<void> =>
  NativePlayerNativeModule?.setSpeed(speed) ?? Promise.resolve();

export const nativePlayerGetCurrentPosition = (): Promise<number> =>
  NativePlayerNativeModule?.getCurrentPosition() ?? Promise.resolve(0);

export const nativePlayerGetDuration = (): Promise<number> =>
  NativePlayerNativeModule?.getDuration() ?? Promise.resolve(0);

export const nativePlayerGetSubtitleTracks = (): Promise<SubtitleTrack[]> =>
  NativePlayerNativeModule?.getSubtitleTracks() ?? Promise.resolve([]);

export const nativePlayerSetSubtitleTrack = (mpvId: number): Promise<void> =>
  NativePlayerNativeModule?.setSubtitleTrack(mpvId) ?? Promise.resolve();

export const nativePlayerDisableSubtitles = (): Promise<void> =>
  NativePlayerNativeModule?.disableSubtitles() ?? Promise.resolve();

export const nativePlayerGetAudioTracks = (): Promise<AudioTrack[]> =>
  NativePlayerNativeModule?.getAudioTracks() ?? Promise.resolve([]);

export const nativePlayerSetAudioTrack = (mpvId: number): Promise<void> =>
  NativePlayerNativeModule?.setAudioTrack(mpvId) ?? Promise.resolve();

export const nativePlayerGetTechnicalInfo = (): Promise<TechnicalInfo> =>
  NativePlayerNativeModule?.getTechnicalInfo() ?? Promise.resolve({});
