import {
  CastMediaPlayerState,
  type CastMediaStatus,
} from "@/modules/mpv-player/src/cast";
import {
  parseReceiverCustomData,
  receiverPositionInItem,
} from "@/utils/cast/jellyfinReceiver";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";
import { secondsToTicks } from "@/utils/time";

/**
 * The subtitles the receiver shows now. Picked there (the Cast controls' captions), they switch its text track and
 * leave the custom data at the index it was loaded with; the Jellyfin receiver names each text track by its stream
 * index. The server hands it every text subtitle as a track, so a loaded index with no track of its own is an image
 * subtitle burned in at the load, which the custom data names; otherwise none active is subtitles off. Media without
 * text tracks has nothing to read here.
 */
const shownSubtitleIndex = (
  status: CastMediaStatus,
  loadedIndex: number | null,
): number | undefined => {
  const textTracks = status.mediaInfo?.textTrackIds;
  if (!textTracks?.length || !status.activeTrackIds) return undefined;
  const active = status.activeTrackIds.find((id) => textTracks.includes(id));
  if (active !== undefined) return active;
  return loadedIndex !== null && !textTracks.includes(loadedIndex)
    ? loadedIndex
    : SUBTITLES_OFF;
};

/**
 * What the Jellyfin receiver plays, as a request to play it on this device: its item, media source and streams,
 * at the position it reached. Nothing for media another sender loaded (no item), for live TV, whose position
 * means nothing here, nor for a receiver that stopped, whose idle status keeps its media at 0.
 */
export const playRequestFromReceiver = (
  status: CastMediaStatus | null,
): Omit<PlayRequest, "offline"> | null => {
  const customData = status?.mediaInfo?.customData;
  if (!status || !customData) return null;
  if (status.playerState === CastMediaPlayerState.IDLE) return null;
  const data = parseReceiverCustomData(customData);
  if (!data.itemId || data.liveStreamId) return null;
  // The receiver's estimate of where it is now; the iOS SDK answers 0 once the channel is gone, which is none.
  const estimate = status.approximateStreamPosition || null;
  return {
    itemId: data.itemId,
    mediaSourceId: data.mediaSourceId ?? undefined,
    audioIndex: data.audioStreamIndex ?? undefined,
    // A receiver loaded without subtitles shows none: none here either, whatever this device would pick.
    subtitleIndex:
      shownSubtitleIndex(status, data.subtitleStreamIndex) ??
      data.subtitleStreamIndex ??
      SUBTITLES_OFF,
    playbackPositionTicks: secondsToTicks(
      receiverPositionInItem(estimate ?? status.streamPosition, data),
    ),
  };
};
