import type { EventSubscription } from "expo-modules-core";
import type {
  AudioTrack,
  SubtitleTrack,
  TechnicalInfo,
} from "./MpvPlayer.types";
import { NativePlayerNativeModule } from "./NativePlayerModule";
import type {
  NativePlayerChapter,
  NativePlayerConfig,
  NativePlayerEpisodeListItem,
  NativePlayerEvents,
  NativePlayerMetadata,
  NativePlayerNextEpisode,
  NativePlayerSegment,
  NativePlayerSubtitleSearchState,
  NativePlayerSyncPlayCommand,
  NativePlayerSyncPlayState,
  NativePlayerTrackMenus,
  NativePlayerTrickplay,
} from "./NativePlayerPresentation.types";

export const isNativePlayerModuleAvailable = (): boolean =>
  NativePlayerNativeModule !== null;

export const isNativePlayerSyncPlayAvailable = (): boolean =>
  typeof NativePlayerNativeModule?.applySyncPlayCommand === "function";

export const updateNativePlayerSyncPlay = (
  state: NativePlayerSyncPlayState | null,
): Promise<void> =>
  NativePlayerNativeModule?.updateSyncPlay(state) ?? Promise.resolve();

export const applyNativePlayerSyncPlayCommand = (
  command: NativePlayerSyncPlayCommand,
): Promise<boolean> =>
  NativePlayerNativeModule?.applySyncPlayCommand(command) ??
  Promise.resolve(false);

export const cancelNativePlayerSyncPlayCommands = (): Promise<void> =>
  NativePlayerNativeModule?.cancelSyncPlayCommands() ?? Promise.resolve();

/** Whether a native event came from the remote player's screen, which marks every body it sends. */
export const isRemotePlayerEvent = (payload: unknown): boolean =>
  typeof payload === "object" &&
  payload !== null &&
  (payload as { remote?: unknown }).remote === true;

/**
 * Attach a NativePlayer event listener. IMPORTANT: attach every listener
 * BEFORE calling presentNativePlayer — module events emitted with no
 * listener are dropped. The remote player's events share these names and
 * never reach it: the local player must not report a playback on the TV.
 */
export const addNativePlayerListener = <K extends keyof NativePlayerEvents>(
  event: K,
  listener: NativePlayerEvents[K],
): EventSubscription | null =>
  NativePlayerNativeModule?.addListener(event, ((payload: unknown) => {
    if (isRemotePlayerEvent(payload)) return;
    (listener as (value: unknown) => void)(payload);
  }) as NativePlayerEvents[K]) ?? null;

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

/**
 * Flip the player's own mute. Same entry point the TV controls use, so the
 * Jellyfin remote's ToggleMute reaches the native player the way it reaches the
 * JS one.
 */
export const nativePlayerToggleMute = (): Promise<void> =>
  NativePlayerNativeModule?.toggleMute() ?? Promise.resolve();

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
