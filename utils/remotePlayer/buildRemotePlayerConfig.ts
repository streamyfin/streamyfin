import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import { AUTO_BITRATE_VALUE } from "@/constants/Bitrate";
import type {
  NativePlayerEpisodeListItem,
  NativePlayerNextEpisode,
  NativePlayerSegment,
  NativePlayerTrackMenuItem,
  NativePlayerTrackMenus,
} from "@/modules/mpv-player/src/NativePlayerPresentation.types";
import type {
  RemotePlayerPresentConfig,
  RemotePlayerTint,
} from "@/modules/mpv-player/src/RemotePlayerPresentation.types";
import type { Settings } from "@/utils/atoms/settings";
import { type BitrateRequest, bitrateLabel } from "@/utils/bitrate";
import type { ReceiverPlay } from "@/utils/cast/sendToReceiver";
import { hasHeaders } from "@/utils/customHeaders";
import { canSearchServerSubtitles } from "@/utils/jellyfin/subtitleSearchAccess";
import {
  buildMetadata,
  buildNativePlayerStrings,
  buildTrackMenus,
  buildTrickplayDescriptor,
  trackTagLabels,
} from "@/utils/nativePlayer/buildNativePlayerConfig";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";
import { ticksToSeconds } from "@/utils/time";

const remoteUi = (
  settings: Settings,
  strings: ReturnType<typeof buildNativePlayerStrings>,
  subtitleSearch = false,
): RemotePlayerPresentConfig["ui"] => ({
  allowPip: false,
  orientationLock: "none",
  seekForwardSec: settings.forwardSkipTime,
  seekBackwardSec: settings.rewindSkipTime,
  hapticsEnabled: !settings.disableHapticFeedback,
  // The phone's own lookup adds a file to a local player, which there is none of here: the server's search only.
  subtitleSearchEnabled: subtitleSearch,
  strings,
});

/** The media source a play names, else the item's first: the one the TV plays. */
export const mediaSourceOf = (play: ReceiverPlay): MediaSourceInfo | null =>
  play.item.MediaSources?.find(({ Id }) => Id === play.mediaSourceId) ??
  play.item.MediaSources?.[0] ??
  null;

/**
 * The remote player's track and quality rows. Every one waits for the TV: native checks none on a tap, the menus follow
 * what the TV then reports, so a choice it refused never shows checked.
 */
export const buildRemoteTrackMenus = (params: {
  mediaSource: MediaSourceInfo;
  audioIndex?: number;
  subtitleIndex?: number;
  bitrateValue?: BitrateRequest;
  t: TFunction;
}): NativePlayerTrackMenus => {
  const { t } = params;
  const menus = buildTrackMenus({
    mediaSource: params.mediaSource,
    audioIndex: params.audioIndex,
    subtitleIndex: params.subtitleIndex ?? SUBTITLES_OFF,
    offline: false,
    downloadedItem: null,
    offLabel: buildNativePlayerStrings(t).off ?? "None",
    originalLabel: t("common.original_audio"),
    qualityLabel: (bitrate) => bitrateLabel(t, bitrate),
    bitrateValue: params.bitrateValue ?? AUTO_BITRATE_VALUE,
    trackTags: trackTagLabels(t),
  });
  const awaitingTheTv = (rows: NativePlayerTrackMenuItem[] = []) =>
    rows.map((row) => ({ ...row, requiresReload: true }));
  return {
    subtitles: awaitingTheTv(menus.subtitles),
    audio: awaitingTheTv(menus.audio),
    quality: awaitingTheTv(menus.quality),
  };
};

/**
 * What the remote player shows of a play on the TV: the local player's metadata, chapters, thumbnails and track
 * menus, with no stream, since the TV plays it. None of the phone's own playback either: no picture in picture, no
 * forced rotation, and the server's subtitle search only (the phone's own lookup adds a file to a local player).
 */
export const buildRemotePlayerConfig = (params: {
  item: BaseItemDto;
  mediaSource: MediaSourceInfo | null;
  targetName: string | null;
  audioIndex?: number;
  subtitleIndex?: number;
  episodeList: NativePlayerEpisodeListItem[];
  nextEpisode: NativePlayerNextEpisode | null;
  /** The item's segments in the user's skip modes: a skip seeks the TV. */
  segments?: NativePlayerSegment[];
  tint: RemotePlayerTint | null;
  imageHeaders: Record<string, string>;
  settings: Settings;
  api: Api;
  /** The account, whose policy says whether the server searches subtitles for it. */
  user: UserDto | null | undefined;
  t: TFunction;
  /** The quality the TV plays at, marked in the quality menu: the remote one, Auto unless set. */
  bitrateValue?: BitrateRequest;
}): RemotePlayerPresentConfig => {
  const { item, mediaSource, settings, api, t } = params;
  const strings = buildNativePlayerStrings(t);
  return {
    metadata: buildMetadata(item, api),
    targetName: params.targetName,
    chapters:
      item.Chapters?.map((chapter) => ({
        name: chapter.Name ?? undefined,
        startSec: ticksToSeconds(chapter.StartPositionTicks ?? 0),
      })) ?? [],
    segments: params.segments ?? [],
    trickplay:
      buildTrickplayDescriptor(item, {
        api,
        offline: false,
        downloadedItem: null,
        mediaSourceId: mediaSource?.Id,
      }) ?? null,
    nextEpisode: params.nextEpisode,
    episodeList: params.episodeList,
    tracks: mediaSource
      ? buildRemoteTrackMenus({
          mediaSource,
          audioIndex: params.audioIndex,
          subtitleIndex: params.subtitleIndex,
          bitrateValue: params.bitrateValue,
          t,
        })
      : null,
    ui: remoteUi(settings, strings, canSearchServerSubtitles(params.user)),
    tint: params.tint,
    // None at all when the user has none: native would send an empty set with every image.
    ...(hasHeaders(params.imageHeaders)
      ? { imageHeaders: params.imageHeaders }
      : {}),
  };
};

/**
 * The reduced player, for media this server does not know: what the Cast status says of it and the transport. No
 * image headers: the image is another host's, and this server's proxy headers are not for it.
 */
export const buildReducedRemotePlayerConfig = (params: {
  title: string | null;
  imageUrl: string | null;
  targetName: string | null;
  settings: Settings;
  t: TFunction;
}): RemotePlayerPresentConfig => ({
  metadata: {
    ...(params.title ? { title: params.title } : {}),
    ...(params.imageUrl ? { artworkUri: params.imageUrl } : {}),
    isEpisode: false,
  },
  targetName: params.targetName,
  chapters: [],
  segments: [],
  trickplay: null,
  nextEpisode: null,
  episodeList: [],
  tracks: null,
  ui: remoteUi(params.settings, buildNativePlayerStrings(params.t)),
  tint: null,
  reduced: true,
});
