import {
  CastMediaPlayerState,
  type CastMediaStatus,
} from "@/modules/mpv-player/src/cast";
import {
  parseReceiverCustomData,
  receiverPositionInItem,
} from "@/utils/cast/jellyfinReceiver";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";
import { secondsToTicks } from "@/utils/time";

/**
 * The subtitles the receiver shows now. Picked there (the Cast controls' captions), they switch its text track and
 * leave the custom data at the index it was loaded with; the Jellyfin receiver names each text track by its stream
 * index, and none shown is subtitles off. Media without text tracks had its subtitles burned in at the load: nothing
 * to read here.
 */
const shownSubtitleIndex = (status: CastMediaStatus): number | undefined => {
  const textTracks = status.mediaInfo?.textTrackIds;
  if (!textTracks?.length || !status.activeTrackIds) return undefined;
  return status.activeTrackIds.find((id) => textTracks.includes(id)) ?? -1;
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
  return {
    itemId: data.itemId,
    mediaSourceId: data.mediaSourceId ?? undefined,
    audioIndex: data.audioStreamIndex ?? undefined,
    subtitleIndex:
      shownSubtitleIndex(status) ?? data.subtitleStreamIndex ?? undefined,
    // The last report falls behind while the receiver plays on: the SDK's estimate is where it is now.
    playbackPositionTicks: secondsToTicks(
      receiverPositionInItem(
        status.approximateStreamPosition ?? status.streamPosition,
        data,
      ),
    ),
  };
};
