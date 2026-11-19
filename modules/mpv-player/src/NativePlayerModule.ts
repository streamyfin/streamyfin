import { NativeModule, requireNativeModule } from "expo";
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
  NativePlayerSyncPlayCommand,
  NativePlayerSyncPlayState,
  NativePlayerTrackMenus,
  NativePlayerTrickplay,
} from "./NativePlayerPresentation.types";

import type {
  RemotePlayerFailure,
  RemotePlayerPresentConfig,
  RemotePlayerTint,
} from "./RemotePlayerPresentation.types";

export declare class NativePlayerModuleType extends NativeModule<NativePlayerEvents> {
  presentPlayer(config: NativePlayerConfig): Promise<void>;
  presentRemotePlayer(config: RemotePlayerPresentConfig): Promise<void>;
  updateRemotePlayerTint(tint: RemotePlayerTint): Promise<void>;
  /** The whole config of the remote screen up, in place; false when none is up. */
  updateRemotePlayer(config: RemotePlayerPresentConfig): Promise<boolean>;
  /** A failed send on the remote screen; null takes it away. */
  showRemotePlayerFailure(failure: RemotePlayerFailure | null): Promise<void>;
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
  updateSyncPlay(state: NativePlayerSyncPlayState | null): Promise<void>;
  applySyncPlayCommand(command: NativePlayerSyncPlayCommand): Promise<boolean>;
  cancelSyncPlayCommands(): Promise<void>;
  showNotice(text: string): Promise<void>;
  toggleMute(): Promise<void>;
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
let resolved: NativePlayerModuleType | null = null;
try {
  resolved = requireNativeModule<NativePlayerModuleType>("NativePlayer");
} catch {
  resolved = null;
}

/** The native module, null where it does not ship. Its own file, so specs swap it for a double. */
export const NativePlayerNativeModule = resolved;
