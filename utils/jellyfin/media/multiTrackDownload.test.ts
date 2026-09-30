import { describe, expect, mock, test } from "bun:test";
import type {
  MediaSourceInfo,
  MediaStream,
  PlaybackInfoResponse,
} from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";
import { isExternalSubtitle } from "@/utils/jellyfin/subtitleUtils";
import { buildSubtitleMenu } from "@/utils/subtitles/trackMenu";

stubReactNative();
mock.module("expo", () => ({
  requireOptionalNativeModule: () => null,
}));

const { getMultiTrackDownloadDetails } = await import("./multiTrackDownload");

const source: MediaSourceInfo = {
  Id: "source-1",
  Container: "mkv",
  RunTimeTicks: 600_000_000,
  Bitrate: 12_000_000,
  Size: 90_000_000,
  Path: "/server/movie.mkv",
  RequiredHttpHeaders: { Authorization: "remote-source-token" },
  MediaStreams: [
    {
      Type: "Video",
      Index: 0,
      Codec: "h264",
      Profile: "High",
      BitRate: 10_000_000,
      Width: 3840,
      Height: 2160,
      BitDepth: 10,
      PixelFormat: "yuv420p10le",
      VideoRange: "HDR",
      VideoRangeType: "DOVIWithHDR10",
      ColorTransfer: "smpte2084",
      DvProfile: 8,
      DisplayTitle: "4K Dolby Vision",
    },
    {
      Type: "Audio",
      Index: 1,
      Codec: "dts",
      Profile: "DTS-HD MA",
      Channels: 8,
      ChannelLayout: "7.1",
      BitRate: 1_500_000,
      Language: "eng",
      Title: "English DTS-HD MA 7.1",
      DisplayTitle: "English DTS-HD MA 7.1",
      IsDefault: true,
      AudioSpatialFormat: "DTSX",
    },
    {
      Type: "Audio",
      Index: 3,
      Codec: "aac",
      Profile: "HE-AAC",
      Channels: 2,
      Language: "fra",
      Title: "French",
      DisplayTitle: "French HE-AAC",
    },
    {
      Type: "Audio",
      Index: 7,
      Codec: "ac3",
      Channels: 1,
      Language: "eng",
      Title: "Director commentary",
    },
    {
      Type: "Subtitle",
      Index: 4,
      Codec: "srt",
      IsTextSubtitleStream: true,
      Language: "eng",
      DisplayTitle: "English - SubRip",
      IsExternal: false,
      DeliveryMethod: "External",
      DeliveryUrl: "/Videos/item-1/source-1/Subtitles/4/Stream.srt",
    },
    {
      Type: "Subtitle",
      Index: 5,
      Codec: "pgssub",
      IsTextSubtitleStream: false,
      DeliveryMethod: "Encode",
    },
    {
      Type: "Subtitle",
      Index: 6,
      Codec: "pgssub",
      IsTextSubtitleStream: false,
      DeliveryMethod: "Encode",
    },
    { Type: "Data", Index: 8, Codec: "ttf" },
    { Type: "Video", Index: 9, Codec: "mjpeg" },
  ],
};

const response = (position: number, overrides: MediaSourceInfo = {}) => ({
  PlaySessionId: `session-${position}`,
  MediaSources: [
    {
      ...source,
      TranscodingUrl:
        `/Videos/item-1/stream.mp4?MediaSourceId=source-1&PlaySessionId=session-${position}` +
        "&VideoBitRate=3872000&Width=1280&Height=720&VideoCodec=h264&Profile=high" +
        "&AudioCodec=copy&AudioChannels=8&AudioBitRate=640000&SubtitleMethod=Encode",
      ...overrides,
    },
  ],
});

const mockNegotiation = (
  api: ReturnType<typeof makeApi>,
  responses: PlaybackInfoResponse[] = [response(0), response(1)],
) => {
  for (const data of responses) {
    api.mock
      .onPost(`${api.basePath}/Items/item-1/PlaybackInfo`)
      .replyOnce(200, data);
  }
};

const plan = (
  api: ReturnType<typeof makeApi>,
  overrides: Partial<Parameters<typeof getMultiTrackDownloadDetails>[0]> = {},
) =>
  getMultiTrackDownloadDetails({
    api,
    item: { Id: "item-1", Type: "Movie" },
    userId: "user-1",
    mediaSource: source,
    audioStreamIndices: [3, 1],
    subtitleStreamIndex: 5,
    maxStreamingBitrate: 4_000_000,
    ...overrides,
  });

describe("getMultiTrackDownloadDetails", () => {
  test("negotiates each selected track independently with stream copy disabled", async () => {
    const api = makeApi();
    mockNegotiation(api);
    const details = await plan(api);
    const bodies = api.mock.history.post.map((request) =>
      JSON.parse(request.data),
    );
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body).toMatchObject({
        userId: "user-1",
        mediaSourceId: "source-1",
        enableDirectPlay: false,
        enableDirectStream: false,
        enableTranscoding: true,
        allowVideoStreamCopy: false,
        allowAudioStreamCopy: false,
        autoOpenLiveStream: false,
        startTimeTicks: 0,
        maxAudioChannels: 2,
      });
      expect(body.deviceProfile.DirectPlayProfiles).toEqual([]);
    }
    expect(bodies[0]).toMatchObject({
      audioStreamIndex: 3,
      subtitleStreamIndex: 5,
      maxStreamingBitrate: 4_000_000,
    });
    expect(bodies[1]).toMatchObject({
      audioStreamIndex: 1,
      subtitleStreamIndex: -1,
      maxStreamingBitrate: 160_000,
    });
    expect(details.audioStreamIndex).toBe(3);
    expect(details.additionalAudioUrls).toHaveLength(1);
    expect(api.mock.history.get).toHaveLength(0);

    const main = new URL(details.url);
    const extra = new URL(details.additionalAudioUrls[0]);
    for (const url of [main, extra]) {
      expect(url.pathname).toBe("/Videos/item-1/stream.mp4");
      for (const [key, value] of Object.entries({
        ApiKey: "SECRET_TOKEN",
        MediaSourceId: "source-1",
        VideoCodec: "h264",
        Profile: "baseline",
        "h264-profile": "baseline",
        AudioCodec: "aac",
        AudioBitRate: "128000",
        AudioChannels: "2",
        MaxAudioChannels: "2",
        EnableAutoStreamCopy: "false",
        AllowVideoStreamCopy: "false",
        AllowAudioStreamCopy: "false",
        Static: "false",
        CopyTimestamps: "false",
      })) {
        expect(url.searchParams.get(key)).toBe(value);
      }
    }
    expect(main.searchParams.get("AudioStreamIndex")).toBe("3");
    expect(main.searchParams.get("VideoBitRate")).toBe("3872000");
    expect(main.searchParams.get("Width")).toBe("1280");
    expect(main.searchParams.get("SubtitleStreamIndex")).toBe("5");
    expect(main.searchParams.get("SubtitleMethod")).toBe("Encode");
    expect(main.searchParams.get("PlaySessionId")).toBe("session-0");
    expect(extra.searchParams.get("PlaySessionId")).toBe("session-1");
    expect(extra.searchParams.get("AudioStreamIndex")).toBe("1");
    expect(extra.searchParams.get("VideoBitRate")).toBe("32000");
    expect(extra.searchParams.get("MaxWidth")).toBe("160");
    expect(extra.searchParams.get("MaxHeight")).toBe("90");
    expect(extra.searchParams.get("MaxFramerate")).toBe("1");
    expect(extra.searchParams.has("Width")).toBe(false);
    expect(extra.searchParams.has("Height")).toBe(false);
    expect(extra.searchParams.get("SubtitleStreamIndex")).toBe("-1");
    expect(extra.searchParams.get("SubtitleMethod")).toBe("External");
  });

  test("normalizes enforced keys case-insensitively while preserving auth, query tokens and base subpaths", async () => {
    const api = makeApi();
    api.basePath += "/jellyfin";
    mockNegotiation(
      api,
      [0, 1].map((position) =>
        response(position, {
          TranscodingUrl:
            `/Videos/item-1/stream.mp4?AudioCodec=copy&audioCodec=ac3&AUDIOCODEC=dts` +
            `&mediASourceId=source-1&PlaySessionId=custom-session-${position}&Tag=opaque%2Bvalue%26` +
            "&api_key=stale-token&VIDEOcodec=hevc&PROFILE=high&h264-profile=high" +
            "&AudioChannels=8&audiochannels=6&videobitrate=3000000&Static=true" +
            "&subtitleSTREAMindex=5&SubtitleMethod=Encode&Framerate=60",
        }),
      ),
    );
    const details = await plan(api);
    for (const url of [details.url, ...details.additionalAudioUrls].map(
      (value) => new URL(value),
    )) {
      expect(url.pathname).toBe("/jellyfin/Videos/item-1/stream.mp4");
      expect(url.searchParams.get("Tag")).toBe("opaque+value&");
      const keys = [...url.searchParams.keys()].map((key) => key.toLowerCase());
      expect(keys.filter((key) => key === "audiocodec")).toHaveLength(1);
      expect(keys.filter((key) => key === "audiochannels")).toHaveLength(1);
      expect(keys.filter((key) => key === "profile")).toHaveLength(1);
      expect(url.searchParams.get("AudioCodec")).toBe("aac");
      expect(url.searchParams.get("ApiKey")).toBe("SECRET_TOKEN");
      expect(url.searchParams.has("api_key")).toBe(false);
    }
    expect(new URL(details.url).searchParams.get("PlaySessionId")).toBe(
      "custom-session-0",
    );
    const extra = new URL(details.additionalAudioUrls[0]);
    expect(extra.searchParams.get("PlaySessionId")).toBe("custom-session-1");
    expect(extra.searchParams.has("Framerate")).toBe(false);
  });

  test("all selected URLs can be retrieved with the shared required headers in primary-first order", async () => {
    const api = makeApi();
    api.basePath += "/jellyfin";
    mockNegotiation(
      api,
      [0, 1, 2].map((position) =>
        response(position, {
          RequiredHttpHeaders: {
            "X-Media-Authorization": "custom-output-token",
            "X-Optional": null,
          },
        }),
      ),
    );
    const details = await plan(api, { audioStreamIndices: [7, 3, 1] });
    expect(api.mock.history.get).toHaveLength(0);
    expect(details.requiredHttpHeaders).toEqual({
      "X-Media-Authorization": "custom-output-token",
    });
    expect(details.mediaSource.RequiredHttpHeaders).toBeUndefined();
    api.mock
      .onGet(
        /^https:\/\/jellyfin\.example\.com\/jellyfin\/Videos\/item-1\/stream\.mp4\?/,
      )
      .reply((request) => {
        const url = new URL(request.url!);
        if (
          request.headers?.["X-Media-Authorization"] !==
            "custom-output-token" ||
          url.searchParams.get("ApiKey") !== "SECRET_TOKEN"
        ) {
          return [401];
        }
        return [
          200,
          {
            audioIndex: Number(url.searchParams.get("AudioStreamIndex")),
            sessionId: url.searchParams.get("PlaySessionId"),
            subtitleIndex: Number(url.searchParams.get("SubtitleStreamIndex")),
          },
        ];
      });
    const fetched = await Promise.all(
      [details.url, ...details.additionalAudioUrls].map(
        async (url) =>
          (
            await api.axiosInstance.get(url, {
              headers: details.requiredHttpHeaders,
            })
          ).data,
      ),
    );
    expect(fetched).toEqual([
      { audioIndex: 7, sessionId: "session-0", subtitleIndex: 5 },
      { audioIndex: 3, sessionId: "session-1", subtitleIndex: -1 },
      { audioIndex: 1, sessionId: "session-2", subtitleIndex: -1 },
    ]);
  });

  test("merges compatible negotiated headers case-insensitively and rejects conflicting bundle headers", async () => {
    const api = makeApi();
    mockNegotiation(api, [
      response(0, { RequiredHttpHeaders: { "X-Media-Token": "same" } }),
      response(1, {
        RequiredHttpHeaders: { "x-media-token": "same", "X-Extra": "required" },
      }),
    ]);
    expect((await plan(api)).requiredHttpHeaders).toEqual({
      "X-Media-Token": "same",
      "X-Extra": "required",
    });

    const conflictingApi = makeApi();
    mockNegotiation(conflictingApi, [
      response(0, { RequiredHttpHeaders: { "X-Media-Token": "one" } }),
      response(1, { RequiredHttpHeaders: { "x-media-token": "two" } }),
    ]);
    await expect(plan(conflictingApi)).rejects.toThrow(/conflicting.*header/i);
  });

  test("does not retain original remote-source headers when server transcodes require none", async () => {
    const api = makeApi();
    mockNegotiation(api, [
      response(0, { RequiredHttpHeaders: undefined }),
      response(1, { RequiredHttpHeaders: null }),
    ]);
    const details = await plan(api);
    expect(details.requiredHttpHeaders).toBeUndefined();
    expect(details.mediaSource.RequiredHttpHeaders).toBeUndefined();
  });

  test.each([
    "/jellyfin/Videos/item-1/stream.mp4",
    "Videos/item-1/stream.mp4",
    "https://jellyfin.example.com/jellyfin/Videos/item-1/stream.mp4",
  ])(
    "resolves negotiated path %s without losing or duplicating the server subpath",
    async (path) => {
      const api = makeApi();
      api.basePath += "/jellyfin";
      mockNegotiation(
        api,
        [0, 1].map((position) =>
          response(position, {
            TranscodingUrl: `${path}?VideoBitRate=3000000`,
          }),
        ),
      );
      const details = await plan(api);
      expect(new URL(details.url).pathname).toBe(
        "/jellyfin/Videos/item-1/stream.mp4",
      );
      expect(new URL(details.url).searchParams.get("PlaySessionId")).toBe(
        "session-0",
      );
    },
  );

  test("Max quality uses the source bitrate instead of an artificial unlimited cap", async () => {
    const api = makeApi();
    mockNegotiation(
      api,
      [0, 1].map((position) =>
        response(position, {
          TranscodingUrl: "/Videos/item-1/stream.mp4?VideoBitRate=11872000",
        }),
      ),
    );
    const details = await plan(api, { maxStreamingBitrate: undefined });
    expect(JSON.parse(api.mock.history.post[0].data).maxStreamingBitrate).toBe(
      12_000_000,
    );
    expect(new URL(details.url).searchParams.get("VideoBitRate")).toBe(
      "11872000",
    );
  });

  test("derives Max from the video track when the source aggregate bitrate is missing", async () => {
    const api = makeApi();
    mockNegotiation(api);
    await plan(api, {
      mediaSource: { ...source, Bitrate: undefined },
      maxStreamingBitrate: undefined,
    });
    expect(JSON.parse(api.mock.history.post[0].data).maxStreamingBitrate).toBe(
      10_128_000,
    );
  });

  test("local MKV metadata has primary-first AAC tracks, original indices, and no stale online or HDR properties", async () => {
    const api = makeApi();
    mockNegotiation(api, [response(0), response(1), response(2)]);
    const before = structuredClone(source);
    const details = await plan(api, { audioStreamIndices: [3, 7, 1] });
    const local = details.mediaSource;
    expect(source).toEqual(before);
    expect(local).toMatchObject({
      Container: "mkv",
      DefaultAudioStreamIndex: 3,
      DefaultSubtitleStreamIndex: 5,
    });
    for (const key of [
      "TranscodingUrl",
      "DirectStreamUrl",
      "RequiredHttpHeaders",
      "Size",
      "Bitrate",
      "Path",
      "TranscodingContainer",
      "TranscodingSubProtocol",
    ]) {
      expect(Reflect.get(local, key)).toBeUndefined();
    }
    const audio = local.MediaStreams?.filter(
      (stream) => stream.Type === "Audio",
    );
    expect(audio?.map((stream) => stream.Index)).toEqual([3, 7, 1]);
    expect(audio?.map((stream) => stream.IsDefault)).toEqual([
      true,
      false,
      false,
    ]);
    for (const stream of audio ?? []) {
      const mono = stream.Index === 7;
      expect(stream).toMatchObject({
        Codec: "aac",
        Profile: "LC",
        Channels: mono ? 1 : 2,
        ChannelLayout: mono ? "mono" : "stereo",
        BitRate: 128_000,
      });
      expect(stream.DisplayTitle).toEndWith(
        mono ? "(AAC, Mono)" : "(AAC, Stereo)",
      );
      expect(stream.DisplayTitle).not.toMatch(/DTS|Atmos|HE-AAC/);
      expect(stream.AudioSpatialFormat).toBeUndefined();
    }
    expect(details.audioTitles).toEqual([
      "French (AAC, Stereo)",
      "Director commentary (AAC, Mono)",
      "eng (AAC, Stereo)",
    ]);
    expect(details.audioLanguages).toEqual(["fra", "eng", "eng"]);
    const videos = local.MediaStreams?.filter(
      (stream) => stream.Type === "Video",
    );
    expect(videos).toHaveLength(1);
    expect(videos?.[0]).toMatchObject({
      Index: 0,
      Codec: "h264",
      Profile: "Baseline",
      BitRate: 3_872_000,
    });
    expect(videos?.[0].Width).toBeUndefined();
    expect(videos?.[0].Height).toBeUndefined();
    expect(videos?.[0].DvProfile).toBeUndefined();
    expect(videos?.[0].ColorTransfer).toBeUndefined();
    expect(videos?.[0].VideoRangeType).not.toBe("DOVIWithHDR10");
    expect(videos?.[0].DisplayTitle).not.toMatch(/Dolby|4K/);
    expect(local.MediaStreams?.map((stream) => stream.Index)).toEqual([
      0, 3, 7, 1, 4, 5,
    ]);
    expect(local.MediaStreams?.find((stream) => stream.Index === 4)).toEqual(
      source.MediaStreams?.find((stream) => stream.Index === 4),
    );
  });

  test("does not confuse maximum dimensions with actual encoded dimensions", async () => {
    const api = makeApi();
    mockNegotiation(
      api,
      [0, 1].map((position) =>
        response(position, {
          TranscodingUrl:
            "/Videos/item-1/stream.mp4?MaxWidth=1920&MaxHeight=1080&VideoBitRate=3000000",
        }),
      ),
    );
    const details = await plan(api);
    const video = details.mediaSource.MediaStreams?.[0];
    expect(video?.Width).toBeUndefined();
    expect(video?.Height).toBeUndefined();
  });

  test("keeps negotiated text sidecar URLs and does not burn them into the main video", async () => {
    const api = makeApi();
    const negotiatedStreams = source.MediaStreams?.map((stream) =>
      stream.Index === 4
        ? { ...stream, DeliveryUrl: "/Videos/item-1/subs/4/Stream.vtt?Tag=new" }
        : stream,
    );
    mockNegotiation(api, [
      response(0, { MediaStreams: negotiatedStreams }),
      response(1),
    ]);
    const details = await plan(api, { subtitleStreamIndex: 4 });
    const main = new URL(details.url);
    expect(main.searchParams.get("SubtitleMethod")).toBe("External");
    expect(
      details.mediaSource.MediaStreams?.map((stream) => stream.Index),
    ).toEqual([0, 3, 1, 4]);
    expect(details.mediaSource.MediaStreams?.at(-1)?.DeliveryUrl).toBe(
      "/Videos/item-1/subs/4/Stream.vtt?Tag=new",
    );
  });

  test("uses actual negotiated external labels and excludes removed or unavailable subtitle tracks", async () => {
    const api = makeApi();
    const removed: MediaStream = {
      Type: "Subtitle",
      Index: 10,
      Codec: "srt",
      DeliveryMethod: "External",
      DeliveryUrl: "/old-subtitle.srt",
      DisplayTitle: "Removed subtitle",
    };
    const unavailable = { ...removed, Index: 11 };
    const selectedSource: MediaSourceInfo = {
      ...source,
      MediaStreams: [...(source.MediaStreams ?? []), removed, unavailable],
    };
    mockNegotiation(api, [
      response(0, {
        MediaStreams: [
          ...(source.MediaStreams ?? []).map((stream) =>
            stream.Index === 4
              ? { ...stream, DisplayTitle: "English - SubRip - Forced" }
              : stream,
          ),
          {
            Type: "Subtitle",
            Index: 11,
            Codec: "srt",
            DeliveryMethod: "External",
          },
        ],
      }),
      response(1),
    ]);
    const details = await plan(api, {
      mediaSource: selectedSource,
      subtitleStreamIndex: 4,
    });
    const subtitles = details.mediaSource.MediaStreams?.filter(
      (stream) => stream.Type === "Subtitle",
    );
    expect(subtitles?.map((stream) => stream.Index)).toEqual([4]);
    expect(subtitles?.[0].DisplayTitle).toBe("English - SubRip - Forced");
    expect(subtitles?.[0].IsExternal).toBe(false);
    expect(isExternalSubtitle(subtitles![0])).toBe(true);
    expect(
      buildSubtitleMenu(details.mediaSource.MediaStreams, {
        selectedIndex: 4,
        isTranscoding: false,
        offLabel: "Off",
        offlineTranscoded: {},
      }).map((row) => row.label),
    ).toEqual(["Off", "English - SubRip - Forced"]);
  });

  test.each(["removed", "no-url"])(
    "rejects the selected subtitle becoming unavailable: %s",
    async (reason) => {
      const api = makeApi();
      mockNegotiation(api, [
        response(0, {
          MediaStreams:
            reason === "removed"
              ? source.MediaStreams?.filter((stream) => stream.Index !== 4)
              : source.MediaStreams?.map((stream) =>
                  stream.Index === 4
                    ? { ...stream, DeliveryUrl: undefined }
                    : stream,
                ),
        }),
      ]);
      await expect(plan(api, { subtitleStreamIndex: 4 })).rejects.toThrow(
        /subtitle/i,
      );
    },
  );

  test("keeps the selected burned-in label but drops unchosen embedded images", async () => {
    const api = makeApi();
    mockNegotiation(api, [
      response(0, {
        MediaStreams: source.MediaStreams?.map((stream) =>
          stream.Index === 5
            ? { ...stream, DisplayTitle: "English - PGS" }
            : stream,
        ),
      }),
      response(1),
    ]);
    const details = await plan(api);
    const menu = buildSubtitleMenu(details.mediaSource.MediaStreams, {
      selectedIndex: 5,
      isTranscoding: false,
      offLabel: "Off",
      offlineTranscoded: { burnedInIndex: 5 },
    });
    expect(
      menu.map((row) => ({
        index: row.index,
        label: row.label,
        kind: row.kind,
      })),
    ).toEqual([
      { index: 5, label: "English - PGS (burned in)", kind: "burnedIn" },
    ]);
  });

  test("disabling subtitles removes image tracks and disables burn-in on all requests", async () => {
    const api = makeApi();
    mockNegotiation(api);
    const details = await plan(api, { subtitleStreamIndex: -1 });
    expect(details.mediaSource.DefaultSubtitleStreamIndex).toBe(-1);
    expect(
      details.mediaSource.MediaStreams?.filter(
        (stream) => stream.Type === "Subtitle",
      ).map((stream) => stream.Index),
    ).toEqual([4]);
    for (const value of [details.url, ...details.additionalAudioUrls]) {
      const url = new URL(value);
      expect(url.searchParams.get("SubtitleStreamIndex")).toBe("-1");
      expect(url.searchParams.get("SubtitleMethod")).toBe("External");
    }
  });

  test.each(
    [
      [7, 3],
      [3, 7],
    ].map((indices) => [indices] as const),
  )(
    "accepts mono audio as the primary or an extra track: %j",
    async (audioStreamIndices) => {
      const api = makeApi();
      mockNegotiation(api);
      const details = await plan(api, { audioStreamIndices });
      const mono = details.mediaSource.MediaStreams?.find(
        (stream) => stream.Index === 7,
      );
      expect(mono).toMatchObject({
        Codec: "aac",
        Profile: "LC",
        Channels: 1,
        ChannelLayout: "mono",
        DisplayTitle: "Director commentary (AAC, Mono)",
        BitRate: 128_000,
        IsDefault: audioStreamIndices[0] === 7,
      });
      for (const url of [details.url, ...details.additionalAudioUrls]) {
        expect(new URL(url).searchParams.get("MaxAudioChannels")).toBe("2");
      }
    },
  );

  test("omits channel and layout claims when the audio source's channels are unknown", async () => {
    const api = makeApi();
    const unknownChannels: MediaSourceInfo = {
      ...source,
      MediaStreams: source.MediaStreams?.map((stream) =>
        stream.Index === 3 ? { ...stream, Channels: null } : stream,
      ),
    };
    mockNegotiation(api, [
      response(0, unknownChannels),
      response(1, unknownChannels),
    ]);
    const details = await plan(api, { mediaSource: unknownChannels });
    const audio = details.mediaSource.MediaStreams?.find(
      (stream) => stream.Index === 3,
    );
    expect(audio?.Channels).toBeUndefined();
    expect(audio?.ChannelLayout).toBeUndefined();
    expect(audio?.DisplayTitle).toBe("French (AAC)");
    expect(details.audioTitles[0]).toBe("French (AAC)");
  });

  test("uses negotiated channel metadata instead of a stale original surround layout", async () => {
    const api = makeApi();
    mockNegotiation(api, [
      response(0, {
        MediaStreams: source.MediaStreams?.map((stream) =>
          stream.Index === 1 ? { ...stream, Channels: 1 } : stream,
        ),
      }),
      response(1),
    ]);
    const details = await plan(api, { audioStreamIndices: [1, 3] });
    expect(
      details.mediaSource.MediaStreams?.find((stream) => stream.Index === 1),
    ).toMatchObject({
      Channels: 1,
      ChannelLayout: "mono",
      DisplayTitle: "eng (AAC, Mono)",
    });
  });

  test.each([-1, 0, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects invalid audio channel metadata %s",
    async (channels) => {
      const api = makeApi();
      await expect(
        plan(api, {
          mediaSource: {
            ...source,
            MediaStreams: source.MediaStreams?.map((stream) =>
              stream.Index === 3 ? { ...stream, Channels: channels } : stream,
            ),
          },
        }),
      ).rejects.toThrow(/channels/i);
      expect(api.mock.history.post).toHaveLength(0);
    },
  );

  test.each([-1, 0, 128_000, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid bitrate %s",
    async (maxStreamingBitrate) => {
      const api = makeApi();
      await expect(plan(api, { maxStreamingBitrate })).rejects.toThrow(
        /bitrate/i,
      );
      expect(api.mock.history.post).toHaveLength(0);
    },
  );

  test("selects the requested source even if PlaybackInfo puts another source first", async () => {
    const api = makeApi();
    mockNegotiation(
      api,
      [0, 1].map((position) => ({
        ...response(position),
        MediaSources: [
          { ...source, Id: "wrong-source" },
          ...response(position).MediaSources,
        ],
      })),
    );
    expect((await plan(api)).mediaSource.Id).toBe("source-1");
  });

  test.each(
    [[], [1], [1, 1], [1, 99], [1, 0], [1, -1], [1, 1.5]].map((indices) => [
      indices,
    ]),
  )(
    "rejects invalid selected indices %j before making requests",
    async (audioStreamIndices) => {
      const api = makeApi();
      await expect(plan(api, { audioStreamIndices })).rejects.toThrow(Error);
      expect(api.mock.history.post).toHaveLength(0);
    },
  );

  test.each([
    { IsInfiniteStream: true },
    { RequiresOpening: true },
    { LiveStreamId: "live-1" },
    { RunTimeTicks: null },
    { RunTimeTicks: 0 },
    { RunTimeTicks: Number.POSITIVE_INFINITY },
    { Id: null },
    { SupportsTranscoding: false },
  ])("rejects unsupported or unbounded source %j", async (properties) => {
    const api = makeApi();
    await expect(
      plan(api, { mediaSource: { ...source, ...properties } }),
    ).rejects.toThrow(Error);
    expect(api.mock.history.post).toHaveLength(0);
  });

  test("rejects live items even when the channel advertises a runtime", async () => {
    const api = makeApi();
    await expect(
      plan(api, { item: { Id: "item-1", Type: "Program" } }),
    ).rejects.toThrow(/live/i);
    expect(api.mock.history.post).toHaveLength(0);
  });

  const invalidNegotiations: PlaybackInfoResponse[] = [
    { MediaSources: [] },
    { MediaSources: [{ ...source, Id: "wrong-source" }] },
    { MediaSources: [{ ...source, TranscodingUrl: undefined }] },
    {
      MediaSources: [
        {
          ...source,
          TranscodingUrl:
            "/Videos/item-1/stream.mp4?MediaSourceId=wrong-source",
        },
      ],
    },
    {
      MediaSources: [
        { ...source, TranscodingUrl: "/Videos/item-1/master.m3u8" },
      ],
    },
    {
      MediaSources: [{ ...source, TranscodingUrl: "/Audio/item-1/stream.aac" }],
    },
    {
      MediaSources: [
        {
          ...source,
          TranscodingUrl: "https://other.example/Videos/item-1/stream.mp4",
        },
      ],
    },
    {
      MediaSources: [
        {
          ...source,
          MediaStreams: source.MediaStreams?.filter(
            (stream) => stream.Index !== 3,
          ),
          TranscodingUrl: "/Videos/item-1/stream.mp4",
        },
      ],
    },
  ];
  test.each(invalidNegotiations.map((data, index) => [index, data] as const))(
    "rejects unusable negotiation #%i without a direct-download fallback",
    async (_index, data) => {
      const api = makeApi();
      mockNegotiation(api, [{ PlaySessionId: "session-0", ...data }]);
      await expect(plan(api)).rejects.toThrow(Error);
      expect(api.mock.history.post).toHaveLength(1);
    },
  );

  test("rejects reused server sessions instead of fetching the wrong cached audio", async () => {
    const api = makeApi();
    mockNegotiation(api, [response(0), response(0)]);
    await expect(plan(api)).rejects.toThrow(/session/i);
  });
});
