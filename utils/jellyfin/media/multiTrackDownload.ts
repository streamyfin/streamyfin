import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import {
  DOWNLOAD_BITS_PER_BYTE,
  DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE,
  DOWNLOAD_MULTI_TRACK_AUDIO_CHANNELS,
  DOWNLOAD_MULTI_TRACK_AUDIO_CODEC,
  DOWNLOAD_MULTI_TRACK_AUDIO_PROFILE,
  DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_BITRATE,
  DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_FRAMERATE,
  DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_HEIGHT,
  DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_WIDTH,
  DOWNLOAD_MULTI_TRACK_MIN_AUDIO_TRACKS,
  DOWNLOAD_MULTI_TRACK_VIDEO_BIT_DEPTH,
  DOWNLOAD_MULTI_TRACK_VIDEO_CODEC,
  DOWNLOAD_MULTI_TRACK_VIDEO_PROFILE,
  DOWNLOAD_TICKS_PER_SECOND,
} from "@/constants/Downloads";
import { generateMultiTrackDownloadProfile } from "@/utils/profiles/download";
import {
  IMAGE_SUBTITLE_CODECS,
  TEXT_SUBTITLE_CODECS,
} from "@/utils/profiles/subtitles";

/** Selection and quality for a single, finite Jellyfin video source. */
export interface MultiTrackDownloadArgs {
  /** Authenticated SDK instance; its server base path is preserved in every URL. */
  api: Api;
  /** Video item owning the selected source. Live channels/programs are unsupported. */
  item: BaseItemDto;
  /** User whose playback/transcoding permissions are used for negotiation. */
  userId: string;
  /** One source containing every selected audio index. */
  mediaSource: MediaSourceInfo;
  /** Distinct Jellyfin stream indices, in output order; the first becomes default. */
  audioStreamIndices: number[];
  /** Selected subtitle index, or -1 to disable subtitles. */
  subtitleStreamIndex: number;
  /** Main stream bitrate ceiling; omitted means source-derived quality. */
  maxStreamingBitrate?: number;
}

/** Server inputs and offline metadata for one locally remuxed MKV download. */
export interface MultiTrackDownloadDetails {
  /** Progressive MP4 containing the real-quality video and primary AAC track. */
  url: string;
  /** Local MKV description; subtitle URLs remain available for sidecar download. */
  mediaSource: MediaSourceInfo;
  /** Original Jellyfin index of the primary/default audio track. */
  audioStreamIndex: number;
  /** Extra MP4 inputs in selection order, each with one AAC track and disposable video. */
  additionalAudioUrls: string[];
  /** Native MKV track titles for ALL selected tracks, including the primary first. */
  audioTitles: string[];
  /** Native MKV language tags for ALL selected tracks; missing languages use "und". */
  audioLanguages: string[];
  /** Negotiated headers shared by all same-origin input requests, never local MKV metadata. */
  requiredHttpHeaders?: Record<string, string>;
}

const isPositive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const assertFiniteSource = (source: MediaSourceInfo, item: BaseItemDto) => {
  if (
    [
      "Program",
      "TvProgram",
      "LiveTvProgram",
      "TvChannel",
      "LiveTvChannel",
    ].some((type) => type === item.Type) ||
    source.IsInfiniteStream ||
    source.RequiresOpening ||
    source.RequiresClosing ||
    source.RequiresLooping ||
    source.LiveStreamId
  ) {
    throw new Error("Multi-track downloads do not support live media sources");
  }
  if (!isPositive(source.RunTimeTicks ?? item.RunTimeTicks)) {
    throw new Error("Multi-track downloads require a finite media duration");
  }
  if (source.SupportsTranscoding === false) {
    throw new Error("This media source does not support transcoding");
  }
};

const assertValidAudioChannels = (stream: MediaStream) => {
  if (
    stream.Channels !== undefined &&
    stream.Channels !== null &&
    (!Number.isInteger(stream.Channels) || stream.Channels <= 0)
  ) {
    throw new Error("Selected audio stream has invalid channels metadata");
  }
};

const getQuery = (params: URLSearchParams, name: string) =>
  [...params].find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

const removeQuery = (params: URLSearchParams, ...names: string[]) => {
  const lowered = names.map((name) => name.toLowerCase());
  for (const key of [...params.keys()]) {
    if (lowered.includes(key.toLowerCase())) params.delete(key);
  }
};

const setQuery = (
  params: URLSearchParams,
  name: string,
  value: string | number | boolean,
) => {
  removeQuery(params, name);
  params.set(name, String(value));
};

const positiveQuery = (params: URLSearchParams, name: string) => {
  const value = Number(getQuery(params, name));
  return isPositive(value) ? value : undefined;
};

const resolveTranscodingUrl = (
  api: Api,
  path: string,
  itemId: string,
  sourceId: string,
): URL => {
  const base = new URL(`${api.basePath.replace(/\/+$/, "")}/`);
  const url = new URL(
    /^[a-z][a-z\d+.-]*:/i.test(path) ||
      path.startsWith("//") ||
      path.startsWith(base.pathname)
      ? path
      : path.replace(/^\/+/, ""),
    base,
  );
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname) ||
    url.username ||
    url.password
  ) {
    throw new Error("Transcoding URL is not on the selected Jellyfin server");
  }
  const route = /\/Videos\/([^/]+)\/stream(?:\.mp4)?$/i.exec(url.pathname);
  if (!route || ![itemId, sourceId].includes(decodeURIComponent(route[1]))) {
    throw new Error(
      "Multi-track downloads require a progressive MP4 video URL",
    );
  }
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase() === "mediasourceid" && value !== sourceId) {
      throw new Error("Transcoding URL refers to a different media source");
    }
  }
  return url;
};

const mergeRequiredHeaders = (
  sources: MediaSourceInfo[],
): Record<string, string> | undefined => {
  const headers = new Map<string, { name: string; value: string }>();
  for (const source of sources) {
    for (const [name, value] of Object.entries(
      source.RequiredHttpHeaders ?? {},
    )) {
      if (value === null) continue;
      const key = name.toLowerCase();
      const existing = headers.get(key);
      if (existing && existing.value !== value) {
        throw new Error(
          "Conflicting required header values across download inputs",
        );
      }
      if (!existing) headers.set(key, { name, value });
    }
  }
  return headers.size
    ? Object.fromEntries(
        [...headers.values()].map(({ name, value }) => [name, value]),
      )
    : undefined;
};

const sourceBitrate = (
  source: MediaSourceInfo,
  video: MediaStream,
  item: BaseItemDto,
): number | undefined => {
  if (isPositive(source.Bitrate)) return source.Bitrate;
  if (isPositive(video.BitRate))
    return video.BitRate + DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE;
  const duration = source.RunTimeTicks ?? item.RunTimeTicks;
  if (isPositive(source.Size) && isPositive(duration)) {
    return Math.ceil(
      (source.Size * DOWNLOAD_BITS_PER_BYTE * DOWNLOAD_TICKS_PER_SECOND) /
        duration,
    );
  }
  return undefined;
};

const subtitleMethod = (stream: MediaStream | undefined) => {
  if (!stream) return "External";
  const codec = stream.Codec?.toLowerCase() ?? "";
  if (stream.IsTextSubtitleStream || TEXT_SUBTITLE_CODECS.includes(codec))
    return "External";
  if (
    stream.DeliveryMethod === "Encode" ||
    IMAGE_SUBTITLE_CODECS.includes(codec)
  )
    return "Encode";
  if (stream.DeliveryMethod === "External") return "External";
  throw new Error("Selected subtitle cannot be downloaded or burned in");
};

const localAudio = (
  stream: MediaStream,
  isDefault: boolean,
): MediaStream & { DisplayTitle: string; Language: string } => {
  // Source DisplayTitle embeds codec/layout information. Do not carry DTS/Atmos
  // labels into the AAC file, even when a release put them in the track title.
  const title =
    stream.Title &&
    !/\b(?:dtsx?|atmos|truehd|aac|ac-?3|e-?ac-?3|dolby)\b/i.test(stream.Title)
      ? stream.Title
      : stream.Language || `Audio ${stream.Index}`;
  // Jellyfin caps channels but does not upmix mono. Unknown source channel
  // counts cannot establish the actual output layout before the local probe.
  const channels =
    stream.Channels == null
      ? undefined
      : Math.min(stream.Channels, DOWNLOAD_MULTI_TRACK_AUDIO_CHANNELS);
  const layout =
    channels === 1 ? "mono" : channels === 2 ? "stereo" : undefined;
  const label = channels === 1 ? "Mono" : channels === 2 ? "Stereo" : undefined;
  return {
    Type: "Audio",
    Index: stream.Index,
    Language: stream.Language || "und",
    Title: title,
    DisplayTitle: `${title} (AAC${label ? `, ${label}` : ""})`,
    Codec: DOWNLOAD_MULTI_TRACK_AUDIO_CODEC,
    Profile: DOWNLOAD_MULTI_TRACK_AUDIO_PROFILE,
    Channels: channels,
    ChannelLayout: layout,
    BitRate: DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE,
    IsDefault: isDefault,
    IsForced: stream.IsForced,
    IsHearingImpaired: stream.IsHearingImpaired,
    IsExternal: false,
  };
};

/**
 * Plans stock-Jellyfin transcodes for native remuxing without fetching stream data.
 * Throws rather than silently falling back to direct download or another source.
 *
 * TODO https://github.com/jellyfin/jellyfin/issues/17436: replace extra tiny-video
 * transcodes with selected-index audio-only requests when that endpoint is fixed.
 * Retain this workaround on affected server versions until capability/version
 * validation proves the audio-only endpoint honors the requested stream index.
 * The native remuxer must discard every extra input's video.
 */
export const getMultiTrackDownloadDetails = async ({
  api,
  item,
  userId,
  mediaSource,
  audioStreamIndices,
  subtitleStreamIndex,
  maxStreamingBitrate,
}: MultiTrackDownloadArgs): Promise<MultiTrackDownloadDetails> => {
  if (!item.Id || !mediaSource.Id || !userId || !api.accessToken) {
    throw new Error(
      "Multi-track downloads require an authenticated item and source",
    );
  }
  assertFiniteSource(mediaSource, item);
  if (
    item.MediaSources?.length &&
    !item.MediaSources.some((source) => source.Id === mediaSource.Id)
  ) {
    throw new Error("Selected media source does not belong to this item");
  }
  if (
    audioStreamIndices.length < DOWNLOAD_MULTI_TRACK_MIN_AUDIO_TRACKS ||
    new Set(audioStreamIndices).size !== audioStreamIndices.length
  ) {
    throw new Error(
      "Multi-track downloads require at least two distinct audio indices",
    );
  }
  const streams = mediaSource.MediaStreams ?? [];
  const audio = audioStreamIndices.map((index) => {
    const matches = streams.filter(
      (stream) => stream.Type === "Audio" && stream.Index === index,
    );
    if (!Number.isInteger(index) || index < 0 || matches.length !== 1) {
      throw new Error(
        `Invalid audio stream index ${index} for selected source`,
      );
    }
    assertValidAudioChannels(matches[0]);
    return matches[0];
  });
  const video = streams.find((stream) => stream.Type === "Video");
  if (!video || video.Index === undefined) {
    throw new Error("Multi-track downloads require a video stream");
  }
  const selectedSubtitle = streams.find(
    (stream) =>
      stream.Type === "Subtitle" && stream.Index === subtitleStreamIndex,
  );
  if (
    !Number.isInteger(subtitleStreamIndex) ||
    subtitleStreamIndex < -1 ||
    (subtitleStreamIndex !== -1 && !selectedSubtitle)
  ) {
    throw new Error("Invalid subtitle stream index for selected source");
  }
  if (
    maxStreamingBitrate !== undefined &&
    (!isPositive(maxStreamingBitrate) ||
      maxStreamingBitrate <= DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE)
  ) {
    throw new Error(
      "Main bitrate must leave room for video and 128 kbps audio",
    );
  }
  const mainBitrate =
    maxStreamingBitrate ?? sourceBitrate(mediaSource, video, item);
  if (
    mainBitrate !== undefined &&
    mainBitrate <= DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE
  ) {
    throw new Error(
      "Source bitrate must leave room for video and 128 kbps audio",
    );
  }
  const sessions = new Set<string>();
  const inputs: { url: URL; source: MediaSourceInfo }[] = [];

  // Sequential negotiation fails early and gives each selected audio its own
  // server session/cache identity. It does not start or download the transcodes.
  for (const [position, audioStreamIndex] of audioStreamIndices.entries()) {
    const additionalAudio = position > 0;
    const bitrate = additionalAudio
      ? DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_BITRATE +
        DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE
      : mainBitrate;
    const subtitleIndex = additionalAudio ? -1 : subtitleStreamIndex;
    const response = await getMediaInfoApi(api).getPlaybackInfo(
      { itemId: item.Id },
      {
        method: "POST",
        data: {
          userId,
          mediaSourceId: mediaSource.Id,
          deviceProfile: generateMultiTrackDownloadProfile(additionalAudio),
          audioStreamIndex,
          subtitleStreamIndex: subtitleIndex,
          maxStreamingBitrate: bitrate,
          maxAudioChannels: DOWNLOAD_MULTI_TRACK_AUDIO_CHANNELS,
          startTimeTicks: 0,
          isPlayback: true,
          autoOpenLiveStream: false,
          enableDirectPlay: false,
          enableDirectStream: false,
          enableTranscoding: true,
          allowVideoStreamCopy: false,
          allowAudioStreamCopy: false,
        },
      },
    );
    const negotiated = response.data.MediaSources?.find(
      (source) => source.Id === mediaSource.Id,
    );
    if (
      response.status !== 200 ||
      response.data.ErrorCode ||
      !negotiated?.TranscodingUrl
    ) {
      throw new Error(
        `No transcode offered for selected media source (${response.data.ErrorCode ?? response.status})`,
      );
    }
    assertFiniteSource({ ...mediaSource, ...negotiated }, item);
    if (negotiated.MediaStreams) {
      const negotiatedAudio = negotiated.MediaStreams.find(
        (stream) =>
          stream.Type === "Audio" && stream.Index === audioStreamIndex,
      );
      if (!negotiatedAudio) {
        throw new Error(
          "Negotiated media source does not contain the selected audio",
        );
      }
      assertValidAudioChannels(negotiatedAudio);
    }
    const url = resolveTranscodingUrl(
      api,
      negotiated.TranscodingUrl,
      item.Id,
      mediaSource.Id,
    );
    const params = url.searchParams;
    const session =
      getQuery(params, "PlaySessionId") || response.data.PlaySessionId;
    if (!session || sessions.has(session)) {
      throw new Error(
        "Multi-track downloads require independent playback sessions",
      );
    }
    sessions.add(session);
    const outputVideoBitrate = additionalAudio
      ? DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_BITRATE
      : (positiveQuery(params, "VideoBitRate") ??
        (isPositive(bitrate)
          ? bitrate - DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE
          : undefined));
    if (!isPositive(outputVideoBitrate)) {
      throw new Error("Unable to determine a source-derived video bitrate");
    }
    const negotiatedSubtitle = negotiated.MediaStreams?.find(
      (stream) => stream.Type === "Subtitle" && stream.Index === subtitleIndex,
    );
    if (
      subtitleIndex !== -1 &&
      negotiated.MediaStreams &&
      !negotiatedSubtitle
    ) {
      throw new Error(
        "Selected subtitle is no longer available on this source",
      );
    }
    const subtitle =
      subtitleIndex === -1
        ? undefined
        : (negotiatedSubtitle ?? selectedSubtitle);
    const method = subtitleMethod(subtitle);
    if (
      subtitle &&
      method === "External" &&
      (subtitle.DeliveryMethod !== "External" || !subtitle.DeliveryUrl)
    ) {
      throw new Error("Selected subtitle has no downloadable sidecar");
    }
    removeQuery(params, "api_key");
    for (const [name, value] of Object.entries({
      ApiKey: api.accessToken,
      MediaSourceId: mediaSource.Id,
      PlaySessionId: session,
      AudioStreamIndex: audioStreamIndex,
      VideoStreamIndex: video.Index,
      SubtitleStreamIndex: subtitleIndex,
      SubtitleMethod: method,
      VideoCodec: DOWNLOAD_MULTI_TRACK_VIDEO_CODEC,
      Profile: DOWNLOAD_MULTI_TRACK_VIDEO_PROFILE,
      "h264-profile": DOWNLOAD_MULTI_TRACK_VIDEO_PROFILE,
      "h264-rangetype": "SDR",
      VideoRangeType: "SDR",
      MaxVideoBitDepth: DOWNLOAD_MULTI_TRACK_VIDEO_BIT_DEPTH,
      VideoBitRate:
        !additionalAudio && isPositive(bitrate)
          ? Math.min(
              outputVideoBitrate,
              bitrate - DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE,
            )
          : outputVideoBitrate,
      AudioCodec: DOWNLOAD_MULTI_TRACK_AUDIO_CODEC,
      AudioBitRate: DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE,
      AudioChannels: DOWNLOAD_MULTI_TRACK_AUDIO_CHANNELS,
      MaxAudioChannels: DOWNLOAD_MULTI_TRACK_AUDIO_CHANNELS,
      TranscodingMaxAudioChannels: DOWNLOAD_MULTI_TRACK_AUDIO_CHANNELS,
      EnableAutoStreamCopy: false,
      AllowVideoStreamCopy: false,
      AllowAudioStreamCopy: false,
      EnableAudioVbrEncoding: false,
      Static: false,
      CopyTimestamps: false,
      StartTimeTicks: 0,
      DeInterlace: true,
      Container: "mp4",
    })) {
      setQuery(params, name, value);
    }
    if (additionalAudio) {
      removeQuery(params, "Width", "Height", "Framerate");
      setQuery(params, "MaxWidth", DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_WIDTH);
      setQuery(params, "MaxHeight", DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_HEIGHT);
      setQuery(
        params,
        "MaxFramerate",
        DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_FRAMERATE,
      );
    }
    inputs.push({ url, source: negotiated });
  }

  const main = inputs[0];
  const subtitles = (main.source.MediaStreams ?? streams)
    .filter(
      (stream) =>
        stream.Type === "Subtitle" &&
        stream.Index !== undefined &&
        ((stream.DeliveryMethod === "External" && stream.DeliveryUrl) ||
          (stream.Index === subtitleStreamIndex &&
            getQuery(main.url.searchParams, "SubtitleMethod") === "Encode")),
    )
    .map(
      (stream): MediaStream => ({
        ...streams.find(
          (original) =>
            original.Type === "Subtitle" && original.Index === stream.Index,
        ),
        ...stream,
        // Negotiation owns availability; never restore a stale delivery URL from
        // the original item just because a stream kept its old index or label.
        DeliveryUrl: stream.DeliveryUrl,
        DeliveryMethod:
          stream.Index === subtitleStreamIndex &&
          getQuery(main.url.searchParams, "SubtitleMethod") === "Encode"
            ? "Encode"
            : stream.DeliveryMethod,
      }),
    );
  const localTracks = audio.map((stream, position) => {
    const negotiated = inputs[position].source.MediaStreams?.find(
      (candidate) =>
        candidate.Type === "Audio" && candidate.Index === stream.Index,
    );
    return localAudio(
      {
        ...stream,
        ...negotiated,
        Channels: negotiated ? negotiated.Channels : stream.Channels,
      },
      position === 0,
    );
  });
  const outputVideo: MediaStream = {
    Type: "Video",
    Index: video.Index,
    Codec: DOWNLOAD_MULTI_TRACK_VIDEO_CODEC,
    Profile: "Baseline",
    BitDepth: DOWNLOAD_MULTI_TRACK_VIDEO_BIT_DEPTH,
    BitRate: positiveQuery(main.url.searchParams, "VideoBitRate"),
    // Jellyfin treats even Width/Height as ceilings (EnforceResolutionLimit).
    // PlaybackInfo describes the input; output dimensions need a local probe.
    IsAVC: true,
    IsInterlaced: false,
    DisplayTitle: "H.264 (Baseline)",
  };
  const local: MediaSourceInfo = {
    Id: mediaSource.Id,
    Name: mediaSource.Name,
    Container: "mkv",
    Protocol: "File",
    IsRemote: false,
    RunTimeTicks: mediaSource.RunTimeTicks ?? item.RunTimeTicks,
    SupportsDirectPlay: true,
    SupportsDirectStream: true,
    SupportsTranscoding: false,
    DefaultAudioStreamIndex: audioStreamIndices[0],
    DefaultSubtitleStreamIndex: subtitles.some(
      (stream) => stream.Index === subtitleStreamIndex,
    )
      ? subtitleStreamIndex
      : -1,
    MediaStreams: [outputVideo, ...localTracks, ...subtitles],
  };
  return {
    url: main.url.toString(),
    mediaSource: local,
    audioStreamIndex: audioStreamIndices[0],
    additionalAudioUrls: inputs.slice(1).map(({ url }) => url.toString()),
    audioTitles: localTracks.map((stream) => stream.DisplayTitle),
    audioLanguages: localTracks.map((stream) => stream.Language),
    requiredHttpHeaders: mergeRequiredHeaders(
      inputs.map(({ source }) => source),
    ),
  };
};
