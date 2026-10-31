import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  DeviceProfile,
  MediaSourceInfo,
  MediaStream,
  PlaybackInfoDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models/base-item-kind";
import { getLibraryApi, getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import type { DownloadMode, DownloadVideoCodec } from "@/constants/Downloads";
import { markExpectedError } from "../../errors";
import { generateDownloadProfile } from "../../profiles/download";
import type { AudioTranscodeModeType } from "../../profiles/native";
import { isPlayableItem } from "./isPlayableItem";

interface StreamResult {
  url: string;
  sessionId: string | null;
  mediaSource: MediaSourceInfo | undefined;
  requiredHttpHeaders?: Record<string, string>;
}

/** Retains the existing playback flag omitted from the SDK DTO. */
type PlaybackInfoRequest = PlaybackInfoDto & {
  /** Compatibility flag sent by the existing playback/download requests. */
  isPlayback: boolean;
};

/**
 * Gets the actual streaming URL - handles both transcoded and direct play logic
 * Returns only the URL string
 */
const getPlaybackUrl = (
  api: Api,
  itemId: string,
  mediaSource: MediaSourceInfo | undefined,
  params: {
    subtitleStreamIndex?: number;
    audioStreamIndex?: number;
    deviceId?: string | null;
    startTimeTicks?: number;
    maxStreamingBitrate?: number;
    userId: string;
    playSessionId?: string | null;
    liveStreamId?: string | null;
  },
): string => {
  let transcodeUrl = mediaSource?.TranscodingUrl;

  // There is no SDK builder for the server-negotiated HLS/progressive URI.
  // Keep its query intact apart from the playback-only subtitle override.
  if (transcodeUrl) {
    // For regular streaming, change subtitle method to HLS for transcoded URL
    if (params.subtitleStreamIndex === -1) {
      transcodeUrl = transcodeUrl.replace(
        "SubtitleMethod=Encode",
        "SubtitleMethod=Hls",
      );
    }

    console.log("Video is being transcoded:", transcodeUrl);
    return `${api.basePath}${transcodeUrl}`;
  }

  // Handle remote/external streams (like live TV with external URLs)
  // These have Protocol "Http" and IsRemote true, with the actual URL in Path
  if (
    mediaSource?.IsRemote &&
    mediaSource?.Protocol === "Http" &&
    mediaSource?.Path
  ) {
    console.log("Video is remote stream, using direct Path:", mediaSource.Path);
    return mediaSource.Path;
  }

  // Fall back to direct play
  // Use the mediaSource's actual container when available (important for live TV
  // where the container may be ts/hls, not mp4)
  const container = mediaSource?.Container || "mp4";
  const streamParams = new URLSearchParams({
    static: "true",
    container,
    mediaSourceId: mediaSource?.Id || "",
    subtitleStreamIndex: params.subtitleStreamIndex?.toString() || "",
    audioStreamIndex: params.audioStreamIndex?.toString() || "",
    deviceId: params.deviceId || api.deviceInfo.id,
    ApiKey: api.accessToken,
    startTimeTicks: params.startTimeTicks?.toString() || "0",
    maxStreamingBitrate: params.maxStreamingBitrate?.toString() || "",
    userId: params.userId,
  });

  // Add additional parameters if provided
  if (params.playSessionId) {
    streamParams.append("playSessionId", params.playSessionId);
  }
  // Without it Jellyfin doesn't use the opened live stream and answers 400.
  if (params.liveStreamId) {
    streamParams.append("liveStreamId", params.liveStreamId);
  }

  // SDK video endpoints fetch the file; native players need a URL carrying
  // the negotiated resume, stream-selection and authentication parameters.
  const directPlayUrl = api.getUri(`/Videos/${itemId}/stream`, streamParams);

  console.log("Video is being direct played:", directPlayUrl);
  return directPlayUrl;
};

const getDownloadUrl = (
  api: Api,
  mediaSource: MediaSourceInfo,
  sessionId: string | null | undefined,
): StreamResult => {
  if (!mediaSource.TranscodingUrl) {
    return {
      url: getLibraryApi(api).getDownloadUrl({ itemId: mediaSource.Id! }),
      sessionId: sessionId || null,
      mediaSource,
    };
  }

  return {
    // Unlike playback, downloads must use the negotiated subtitle method verbatim.
    url: `${api.basePath}${mediaSource.TranscodingUrl}`,
    sessionId: sessionId || null,
    mediaSource,
  };
};

export const getStreamUrl = async ({
  api,
  item,
  userId,
  startTimeTicks = 0,
  maxStreamingBitrate,
  playSessionId,
  deviceProfile,
  audioStreamIndex = 0,
  subtitleStreamIndex = undefined,
  mediaSourceId,
  deviceId,
}: {
  api: Api | null | undefined;
  item: BaseItemDto | null | undefined;
  userId: string | null | undefined;
  startTimeTicks: number;
  maxStreamingBitrate?: number;
  playSessionId?: string | null;
  deviceProfile: DeviceProfile;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  height?: number;
  mediaSourceId?: string | null;
  deviceId?: string | null;
}): Promise<{
  url: string | null;
  sessionId: string | null;
  mediaSource: MediaSourceInfo | undefined;
  requiredHttpHeaders?: Record<string, string>;
} | null> => {
  if (!api || !userId || !item?.Id) {
    console.warn("Missing required parameters for getStreamUrl");
    return null;
  }

  // Both players negotiate their stream here, so this is the last place an
  // item with no stream (a Book, a Season, a folder) can be stopped whatever
  // route it took: a deep link, a remote Play command, a screen that still
  // shows a Play button. The server would answer with a 400; saying so
  // without the round trip keeps it a user-facing outcome, not a Sentry event.
  if (!isPlayableItem(item)) {
    throw markExpectedError(
      new Error(`Item of type ${item.Type ?? "unknown"} cannot be played`),
    );
  }

  let mediaSource: MediaSourceInfo | undefined;
  let sessionId: string | null | undefined;

  // Please do not remove this we need this for live TV to be working correctly.
  if (item.Type === BaseItemKind.Program) {
    console.log("Item is of type program...");
    const res = await getMediaInfoApi(api).getPostedPlaybackInfo(
      {
        userId,
        itemId: item.ChannelId!,
        startTimeTicks: 0,
        autoOpenLiveStream: true,
        maxStreamingBitrate,
        audioStreamIndex,
        playbackInfoDto: {
          DeviceProfile: deviceProfile,
        },
      },
      {
        params: {
          isPlayback: true,
        },
      },
    );

    sessionId = res.data.PlaySessionId || null;
    mediaSource = res.data.MediaSources?.[0];
    if (!mediaSource) {
      // A server-side negotiation outcome (profile can't be satisfied,
      // transcoding disabled), not an app defect: expected keeps it out of
      // Sentry while the player surfaces it to the user.
      throw markExpectedError(
        new Error(
          `PlaybackInfo returned no media source for live channel (${res.data.ErrorCode ?? "no ErrorCode"})`,
        ),
      );
    }
    const url = getPlaybackUrl(api, item.ChannelId!, mediaSource, {
      subtitleStreamIndex,
      audioStreamIndex,
      deviceId,
      startTimeTicks: 0,
      maxStreamingBitrate,
      userId,
      playSessionId: sessionId,
      liveStreamId: mediaSource.LiveStreamId,
    });

    return {
      url,
      sessionId: sessionId || null,
      mediaSource,
      requiredHttpHeaders: mediaSource?.RequiredHttpHeaders as
        | Record<string, string>
        | undefined,
    };
  }

  const playbackInfoDto: PlaybackInfoRequest = {
    UserId: userId,
    DeviceProfile: deviceProfile,
    SubtitleStreamIndex: subtitleStreamIndex,
    StartTimeTicks: startTimeTicks,
    isPlayback: true,
    AutoOpenLiveStream: true,
    MaxStreamingBitrate: maxStreamingBitrate,
    AudioStreamIndex: audioStreamIndex,
    MediaSourceId: mediaSourceId,
  };
  const res = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId: item.Id,
    playbackInfoDto,
  });

  if (res.status !== 200) {
    console.error("Error getting playback info:", res.status, res.statusText);
  }

  sessionId = res.data.PlaySessionId || null;
  mediaSource = res.data.MediaSources?.[0];

  // Jellyfin reports negotiation failures as HTTP 200 with an ErrorCode
  // (NoCompatibleStream, RateLimitExceeded, …) and no MediaSources.
  // Fabricating a stream URL anyway just moves the failure into an opaque
  // decoder error minutes later, so fail here where the reason is known.
  if (!mediaSource) {
    // Same as the live-channel case: the server said no (NoCompatibleStream,
    // RateLimitExceeded), which is its configuration, not an app bug.
    throw markExpectedError(
      new Error(
        `PlaybackInfo returned no media source (${res.data.ErrorCode ?? "no ErrorCode"})`,
      ),
    );
  }

  const url = getPlaybackUrl(api, item.Id!, mediaSource, {
    subtitleStreamIndex,
    audioStreamIndex,
    deviceId,
    startTimeTicks,
    maxStreamingBitrate,
    userId,
    playSessionId: playSessionId || undefined,
    liveStreamId: mediaSource.LiveStreamId,
  });

  return {
    url,
    sessionId: sessionId || null,
    mediaSource,
    requiredHttpHeaders: mediaSource?.RequiredHttpHeaders as
      | Record<string, string>
      | undefined,
  };
};

export const getDownloadStreamUrl = async ({
  api,
  item,
  userId,
  maxStreamingBitrate,
  audioStreamIndex = 0,
  subtitleStreamIndex = undefined,
  mediaSourceId,
  audioMode = "auto",
  mode,
  videoCodec,
}: {
  api: Api | null | undefined;
  item: BaseItemDto | null | undefined;
  userId: string | null | undefined;
  maxStreamingBitrate?: number;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  mediaSourceId?: string | null;
  audioMode?: AudioTranscodeModeType;
  mode: DownloadMode;
  videoCodec?: DownloadVideoCodec;
}): Promise<{
  url: string | null;
  sessionId: string | null;
  mediaSource: MediaSourceInfo | undefined;
} | null> => {
  if (!api || !userId || !item?.Id) {
    console.warn("Missing required parameters for getStreamUrl");
    return null;
  }

  const playbackInfoDto: PlaybackInfoRequest = {
    UserId: userId,
    DeviceProfile: generateDownloadProfile(audioMode, videoCodec),
    SubtitleStreamIndex: subtitleStreamIndex,
    StartTimeTicks: 0,
    isPlayback: true,
    AutoOpenLiveStream: true,
    MaxStreamingBitrate: maxStreamingBitrate,
    AudioStreamIndex: audioStreamIndex,
    MediaSourceId: mediaSourceId,
    ...(mode === "transcode" && {
      EnableDirectPlay: false,
      EnableDirectStream: false,
    }),
  };
  const res = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId: item.Id,
    playbackInfoDto,
  });

  if (res.status !== 200) {
    console.error("Error getting playback info:", res.status, res.statusText);
  }

  const sessionId = res.data.PlaySessionId || null;
  const mediaSource = res.data.MediaSources?.[0];
  if (!mediaSource) {
    console.warn("No media source offered for download");
    return null;
  }

  if (mode === "original") {
    // A file next to it on the server comes down only when sent as one.
    const original = filterSubtitleStreams(
      asOriginalFile(mediaSource),
      (subtitle) =>
        !subtitle.IsExternal || subtitle.DeliveryMethod === "External",
    );
    return getDownloadUrl(api, original, sessionId);
  }
  // The original would ignore the quality, codec and burn-in that were picked.
  if (!mediaSource.TranscodingUrl) {
    console.warn("Server offered no transcode for download");
    return null;
  }
  // A burned-in subtitle leaves no use for any other; without one, only the
  // subtitles downloaded as files come down.
  const burnsIn = mediaSource.MediaStreams?.some(
    (stream) =>
      stream.Type === "Subtitle" && stream.Index === subtitleStreamIndex,
  );
  const transcode = filterSubtitleStreams(
    withSubtitleBurnedIn(mediaSource, subtitleStreamIndex),
    (subtitle) =>
      burnsIn
        ? subtitle.Index === subtitleStreamIndex
        : subtitle.DeliveryMethod === "External",
  );
  return getDownloadUrl(api, transcode, sessionId);
};

/** Offline offers every subtitle the source lists, so it lists only those on the device. */
const filterSubtitleStreams = (
  mediaSource: MediaSourceInfo,
  keep: (subtitle: MediaStream) => boolean,
): MediaSourceInfo => ({
  ...mediaSource,
  MediaStreams: mediaSource.MediaStreams?.filter(
    (stream) => stream.Type !== "Subtitle" || keep(stream),
  ),
});

/** The server sends a text subtitle as a file; the URL makes it burn that one in too. */
const withSubtitleBurnedIn = (
  mediaSource: MediaSourceInfo,
  subtitleStreamIndex: number | undefined,
): MediaSourceInfo => {
  const subtitle = mediaSource.MediaStreams?.find(
    (stream) =>
      stream.Type === "Subtitle" && stream.Index === subtitleStreamIndex,
  );
  if (
    !mediaSource.TranscodingUrl ||
    !subtitle ||
    subtitle.DeliveryMethod === "Encode"
  ) {
    return mediaSource;
  }
  const [path, query = ""] = mediaSource.TranscodingUrl.split("?");
  const params = new URLSearchParams(query);
  params.set("SubtitleStreamIndex", String(subtitleStreamIndex));
  params.set("SubtitleMethod", "Encode");
  return {
    ...mediaSource,
    TranscodingUrl: `${path}?${params}`,
    MediaStreams: mediaSource.MediaStreams?.map((stream) =>
      stream === subtitle ? { ...stream, DeliveryMethod: "Encode" } : stream,
    ),
  };
};

/**
 * The raw file keeps its own subtitles as tracks, which the profile marks
 * burned in (image) or sidecar (text).
 */
const asOriginalFile = (mediaSource: MediaSourceInfo): MediaSourceInfo => ({
  ...mediaSource,
  TranscodingUrl: null,
  // A file next to it on the server is not in the download.
  MediaStreams: mediaSource.MediaStreams?.map((stream) =>
    stream.Type === "Subtitle" && !stream.IsExternal
      ? { ...stream, DeliveryMethod: "Embed" }
      : stream,
  ),
});
