import type {
  MediaSourceInfo,
  MediaStream,
  SessionInfoDto,
} from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import type { RemotePlaybackState } from "@/modules/mpv-player/src/cast/Cast.types";
import type { RemoteTechnicalLine } from "@/modules/mpv-player/src/RemotePlayerPresentation.types";
import {
  formatBitrate,
  formatCodec,
  formatTranscodeReason,
  getPlayMethodLabel,
  type PlayMethod,
} from "@/utils/jellyfin/media/technicalInfoFormat";

const audioPlayed = (
  source: MediaSourceInfo | null,
  audioIndex: number,
): MediaStream | undefined => {
  const audio = source?.MediaStreams?.filter(({ Type }) => Type === "Audio");
  return (
    audio?.find(({ Index }) => Index === audioIndex) ??
    audio?.find(({ Index }) => Index === source?.DefaultAudioStreamIndex) ??
    audio?.[0]
  );
};

/**
 * What the TV really plays, as the remote player's technical info lists it. The method is the receiver's word (its
 * customData), else the server's. A direct play is the source itself, and so is a direct stream: the receiver names
 * one only for the static file it plays, a remux it calls a transcode. A transcode is what the server sends, so
 * without its session only the method is known: the source's codecs would be wrong.
 */
export const remoteTechnicalInfo = (
  state: RemotePlaybackState,
  session: SessionInfoDto | null,
  source: MediaSourceInfo | null,
  t: TFunction,
): RemoteTechnicalLine[] => {
  const method = (state.playMethod ??
    session?.PlayState?.PlayMethod ??
    null) as PlayMethod | null;
  if (!method) return [];
  const lines: RemoteTechnicalLine[] = [
    {
      label: t("player.technical_info.play_method"),
      value: getPlayMethodLabel(method),
    },
  ];
  const transcode = session?.TranscodingInfo;
  if (method === "Transcode" && !transcode) return lines;

  const video = source?.MediaStreams?.find(({ Type }) => Type === "Video");
  const container = transcode?.Container ?? source?.Container;
  const videoCodec = transcode?.VideoCodec ?? video?.Codec;
  const audioCodec =
    transcode?.AudioCodec ?? audioPlayed(source, state.audioIndex)?.Codec;
  const bitrate = transcode?.Bitrate ?? source?.Bitrate;
  const width = transcode?.Width ?? video?.Width;
  const height = transcode?.Height ?? video?.Height;
  const reasons = transcode?.TranscodeReasons ?? [];
  const add = (key: string, value: string | null | undefined) => {
    if (value) lines.push({ label: t(key), value });
  };
  add("player.technical_info.container", container?.toUpperCase());
  add(
    "player.technical_info.video_codec",
    videoCodec && formatCodec(videoCodec),
  );
  add(
    "player.technical_info.audio_codec",
    audioCodec && formatCodec(audioCodec),
  );
  add(
    "player.technical_info.stream_bitrate",
    bitrate ? formatBitrate(bitrate) : null,
  );
  add(
    "player.technical_info.resolution",
    width && height ? `${width}x${height}` : null,
  );
  add(
    "player.technical_info.transcode_reasons",
    reasons.map(formatTranscodeReason).join(", "),
  );
  return lines;
};
