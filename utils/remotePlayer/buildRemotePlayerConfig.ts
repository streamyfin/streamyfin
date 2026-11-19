import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import { AUTO_BITRATE_VALUE } from "@/constants/Bitrate";
import type {
  NativePlayerEpisodeListItem,
  NativePlayerNextEpisode,
} from "@/modules/mpv-player/src/NativePlayerPresentation.types";
import type {
  RemotePlayerPresentConfig,
  RemotePlayerTint,
} from "@/modules/mpv-player/src/RemotePlayerPresentation.types";
import type { Settings } from "@/utils/atoms/settings";
import { type BitrateRequest, bitrateLabel } from "@/utils/bitrate";
import { hasHeaders } from "@/utils/customHeaders";
import {
  buildMetadata,
  buildNativePlayerStrings,
  buildTrackMenus,
  buildTrickplayDescriptor,
} from "@/utils/nativePlayer/buildNativePlayerConfig";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";
import { ticksToSeconds } from "@/utils/time";

/**
 * What the remote player shows of a play on the TV: the local player's metadata, chapters, thumbnails and track
 * menus, with no stream, since the TV plays it. None of the phone's own playback either: no picture in picture, no
 * forced rotation, no subtitle search until the remote engine can load one.
 */
export const buildRemotePlayerConfig = (params: {
  item: BaseItemDto;
  mediaSource: MediaSourceInfo | null;
  targetName: string | null;
  audioIndex?: number;
  subtitleIndex?: number;
  episodeList: NativePlayerEpisodeListItem[];
  nextEpisode: NativePlayerNextEpisode | null;
  tint: RemotePlayerTint | null;
  imageHeaders: Record<string, string>;
  settings: Settings;
  api: Api;
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
    segments: [],
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
      ? buildTrackMenus({
          mediaSource,
          audioIndex: params.audioIndex,
          subtitleIndex: params.subtitleIndex ?? SUBTITLES_OFF,
          offline: false,
          downloadedItem: null,
          offLabel: strings.off ?? "None",
          originalLabel: t("common.original_audio"),
          qualityLabel: (bitrate) => bitrateLabel(t, bitrate),
          bitrateValue: params.bitrateValue ?? AUTO_BITRATE_VALUE,
        })
      : null,
    ui: {
      allowPip: false,
      orientationLock: "none",
      seekForwardSec: settings.forwardSkipTime,
      seekBackwardSec: settings.rewindSkipTime,
      hapticsEnabled: !settings.disableHapticFeedback,
      subtitleSearchEnabled: false,
      strings,
    },
    tint: params.tint,
    // None at all when the user has none: native would send an empty set with every image.
    ...(hasHeaders(params.imageHeaders)
      ? { imageHeaders: params.imageHeaders }
      : {}),
  };
};
