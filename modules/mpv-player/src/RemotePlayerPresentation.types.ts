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
 * The remote screen's colors, `#RRGGBB`: the background from `top` down to
 * `bottom` at two thirds of the height, and the active color. Built by
 * `remoteTint` (utils/remotePlayer/remoteTint.ts) from the artwork's color.
 * Mirrored by RemoteTintRecord (PlayerConfig.kt, .swift).
 */
export type RemotePlayerTint = {
  top: string;
  bottom: string;
  accent: string;
};

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
  /** Null until the artwork's color is known: the screen starts on the neutral, then fades to the tint. */
  tint: RemotePlayerTint | null;
  /**
   * Custom proxy auth headers for the images the screen loads itself (the
   * artwork when its own are not given, the episode list). Same server as the
   * item; left out when the user has none.
   */
  imageHeaders?: Record<string, string>;
};
