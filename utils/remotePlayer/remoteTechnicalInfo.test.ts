import type {
  MediaSourceInfo,
  SessionInfoDto,
} from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import {
  NO_REMOTE_PLAYBACK,
  type RemotePlaybackState,
} from "@/modules/mpv-player/src/cast/Cast.types";
import { remoteTechnicalInfo } from "./remoteTechnicalInfo";

const t = ((key: string) => key) as unknown as TFunction;

const source: MediaSourceInfo = {
  Id: "source-1",
  Container: "mkv",
  Bitrate: 12_000_000,
  MediaStreams: [
    { Type: "Video", Index: 0, Codec: "hevc", Width: 1920, Height: 1080 },
    { Type: "Audio", Index: 1, Codec: "aac" },
    { Type: "Audio", Index: 2, Codec: "eac3" },
  ],
};

const playing = (playMethod: string | null): RemotePlaybackState => ({
  ...NO_REMOTE_PLAYBACK,
  connected: true,
  phase: "playing",
  itemId: "film-1",
  audioIndex: 2,
  playMethod,
});

test("direct play says so with the source's codecs", () => {
  const session: SessionInfoDto = { PlayState: { PlayMethod: "DirectPlay" } };

  expect(
    remoteTechnicalInfo(playing("DirectPlay"), session, source, t),
  ).toEqual([
    { label: "player.technical_info.play_method", value: "Direct Play" },
    { label: "player.technical_info.container", value: "MKV" },
    { label: "player.technical_info.video_codec", value: "HEVC" },
    // The audio track the TV plays, not the source's first.
    { label: "player.technical_info.audio_codec", value: "E-AC3" },
    { label: "player.technical_info.stream_bitrate", value: "12.0 Mbps" },
    { label: "player.technical_info.resolution", value: "1920x1080" },
  ]);
});

test("a transcode names its reasons", () => {
  const session: SessionInfoDto = {
    PlayState: { PlayMethod: "Transcode" },
    TranscodingInfo: {
      Container: "ts",
      VideoCodec: "h264",
      AudioCodec: "aac",
      Bitrate: 4_000_000,
      Width: 1280,
      Height: 720,
      TranscodeReasons: [
        "ContainerBitrateExceedsLimit",
        "AudioCodecNotSupported",
      ],
    },
  };

  expect(remoteTechnicalInfo(playing("Transcode"), session, source, t)).toEqual(
    [
      { label: "player.technical_info.play_method", value: "Transcoding" },
      { label: "player.technical_info.container", value: "TS" },
      { label: "player.technical_info.video_codec", value: "H.264" },
      { label: "player.technical_info.audio_codec", value: "AAC" },
      { label: "player.technical_info.stream_bitrate", value: "4.0 Mbps" },
      { label: "player.technical_info.resolution", value: "1280x720" },
      {
        label: "player.technical_info.transcode_reasons",
        value: "Bitrate exceeds limit, Audio codec not supported",
      },
    ],
  );
});

// The source's codecs are not what a transcode sends: without the server's word, only the method is known.
test("no server session still shows the play method", () => {
  expect(remoteTechnicalInfo(playing("Transcode"), null, source, t)).toEqual([
    { label: "player.technical_info.play_method", value: "Transcoding" },
  ]);
});

test("the server's play method stands in when the TV names none", () => {
  const session: SessionInfoDto = { PlayState: { PlayMethod: "DirectPlay" } };

  expect(remoteTechnicalInfo(playing(null), session, source, t)[0]).toEqual({
    label: "player.technical_info.play_method",
    value: "Direct Play",
  });
});

test("nothing known gives no lines", () => {
  expect(remoteTechnicalInfo(playing(null), null, source, t)).toEqual([]);
});
