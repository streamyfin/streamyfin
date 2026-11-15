import type {
  NativePlayerChapter,
  NativePlayerEpisodeListItem,
  NativePlayerMetadata,
  NativePlayerNextEpisode,
  NativePlayerSegment,
  NativePlayerTrackMenus,
  NativePlayerTrickplay,
  NativePlayerUIOptions,
} from "./NativePlayerPresentation.types";

/**
 * What the remote player shows of what the TV plays: the local player's
 * config without a stream or an engine, since the remote engine plays it on
 * the TV. Mirrored by RemotePlayerConfigRecord (PlayerConfig.kt, .swift).
 */
export type RemotePlayerPresentConfig = {
  metadata: NativePlayerMetadata;
  /** The TV's name, under the transport. */
  targetName: string | null;
  chapters: NativePlayerChapter[];
  segments: NativePlayerSegment[];
  trickplay: NativePlayerTrickplay | null;
  /** What comes after the list sent to the TV. */
  nextEpisode: NativePlayerNextEpisode | null;
  episodeList: NativePlayerEpisodeListItem[];
  tracks: NativePlayerTrackMenus | null;
  ui: NativePlayerUIOptions;
};
