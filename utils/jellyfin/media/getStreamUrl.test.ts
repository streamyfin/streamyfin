import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative();
jest.mock("expo", () => ({
  // codecSupport probes the native MPV module, which no test environment has.
  requireOptionalNativeModule: () => null,
}));

import { bodyContaining, makeApi } from "@/test-utils/jellyfinApi";
import { getDownloadStreamUrl, getStreamUrl } from "./getStreamUrl";

describe("getStreamUrl", () => {
  test("direct play URL carries the source container and the ApiKey", async () => {
    const api = makeApi();
    api.mock
      .onPost("https://jellyfin.example.com/Items/item-1/PlaybackInfo")
      .reply(200, {
        PlaySessionId: "session-1",
        MediaSources: [{ Id: "media-1", Container: "mkv" }],
      });

    const result = await getStreamUrl({
      api,
      item: { Id: "item-1", Type: "Movie" },
      userId: "user-1",
      startTimeTicks: 0,
      deviceProfile: {},
    });

    const url = new URL(result!.url!);
    expect(url.searchParams.get("container")).toBe("mkv");
    expect(url.searchParams.get("ApiKey")).toBe("SECRET_TOKEN");
  });

  test("SDK negotiation preserves proxy auth, base paths and native resume/selection parameters", async () => {
    const api = makeApi();
    api.update({
      basePath: `${api.basePath}/jellyfin`,
      accessToken: "TOKEN /+&?",
    });
    api.axiosInstance.defaults.headers.common["X-Proxy-Token"] = "proxy-token";
    const requiredHttpHeaders = { Referer: "https://origin.example.com" };
    api.mock.onPost(`${api.basePath}/Items/item-1/PlaybackInfo`).reply(200, {
      PlaySessionId: "negotiated-session",
      MediaSources: [
        {
          Id: "selected-media",
          Container: "ts",
          RequiredHttpHeaders: requiredHttpHeaders,
        },
      ],
    });

    const result = await getStreamUrl({
      api,
      item: { Id: "item-1", Type: "Movie" },
      userId: "user-1",
      startTimeTicks: 90_000_000,
      deviceProfile: { Name: "test-profile" },
      mediaSourceId: "selected-media",
      deviceId: "native-device",
      audioStreamIndex: 2,
      subtitleStreamIndex: -1,
      maxStreamingBitrate: 4_000_000,
      playSessionId: "requested-session",
    });

    const request = api.mock.history.post[0];
    expect(JSON.parse(request.data)).toEqual({
      UserId: "user-1",
      DeviceProfile: { Name: "test-profile" },
      SubtitleStreamIndex: -1,
      StartTimeTicks: 90_000_000,
      isPlayback: true,
      AutoOpenLiveStream: true,
      MaxStreamingBitrate: 4_000_000,
      AudioStreamIndex: 2,
      MediaSourceId: "selected-media",
    });
    expect(request.headers?.Authorization).toContain(
      'Token="TOKEN%20%2F%2B%26%3F"',
    );
    expect(request.headers?.["X-Proxy-Token"]).toBe("proxy-token");
    const url = new URL(result!.url!);
    expect(url.pathname).toBe("/jellyfin/Videos/item-1/stream");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      static: "true",
      container: "ts",
      mediaSourceId: "selected-media",
      subtitleStreamIndex: "-1",
      audioStreamIndex: "2",
      deviceId: "native-device",
      ApiKey: "TOKEN /+&?",
      startTimeTicks: "90000000",
      maxStreamingBitrate: "4000000",
      userId: "user-1",
      playSessionId: "requested-session",
    });
    expect(result?.sessionId).toBe("negotiated-session");
    expect(result?.requiredHttpHeaders).toEqual(requiredHttpHeaders);
    expect(api.mock.history).toHaveLength(1);
  });

  test("live programs negotiate and stream the channel, starting at zero ticks", async () => {
    const api = makeApi();
    api.update({ basePath: `${api.basePath}/jellyfin` });
    api.mock.onPost(/\/Items\/channel-1\/PlaybackInfo/).reply(200, {
      PlaySessionId: "live-session",
      MediaSources: [{ Id: "live-media", Container: "ts" }],
    });

    const result = await getStreamUrl({
      api,
      item: { Id: "program-1", ChannelId: "channel-1", Type: "Program" },
      userId: "user-1",
      startTimeTicks: 90_000_000,
      deviceProfile: { Name: "live-profile" },
      audioStreamIndex: 2,
      maxStreamingBitrate: 4_000_000,
    });

    const request = api.mock.history.post[0];
    const requestUrl = new URL(request.url!);
    expect(requestUrl.pathname).toBe("/jellyfin/Items/channel-1/PlaybackInfo");
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      userId: "user-1",
      startTimeTicks: "0",
      autoOpenLiveStream: "true",
      maxStreamingBitrate: "4000000",
      audioStreamIndex: "2",
    });
    expect(request.params).toEqual({ isPlayback: true });
    expect(JSON.parse(request.data)).toEqual({
      DeviceProfile: { Name: "live-profile" },
    });
    const url = new URL(result!.url!);
    expect(url.pathname).toBe("/jellyfin/Videos/channel-1/stream");
    expect(url.searchParams.get("mediaSourceId")).toBe("live-media");
    expect(url.searchParams.get("startTimeTicks")).toBe("0");
    expect(result?.sessionId).toBe("live-session");
  });

  test("transcoded streaming preserves the server URI and only rewrites the disabled subtitle method", async () => {
    const api = makeApi({
      MediaSources: [
        {
          Id: "media-1",
          TranscodingUrl:
            "/Videos/media-1/master.m3u8?SubtitleMethod=Encode&token=server%2Btoken&StartTimeTicks=90",
        },
      ],
    });
    api.update({ basePath: `${api.basePath}/jellyfin` });
    const result = await getStreamUrl({
      api,
      item: { Id: "item-1" },
      userId: "user-1",
      startTimeTicks: 90,
      deviceProfile: {},
      subtitleStreamIndex: -1,
    });

    expect(result?.url).toBe(
      `${api.basePath}/Videos/media-1/master.m3u8?SubtitleMethod=Hls&token=server%2Btoken&StartTimeTicks=90`,
    );
    expect(api.mock.history).toHaveLength(1);
  });

  test("remote media URLs and required headers remain unchanged", async () => {
    const remoteUrl = "https://live.example.com/stream.ts?token=upstream";
    const headers = { "X-Stream-Key": "remote-token" };
    const api = makeApi({
      MediaSources: [
        {
          Id: "media-1",
          IsRemote: true,
          Protocol: "Http",
          Path: remoteUrl,
          RequiredHttpHeaders: headers,
        },
      ],
    });
    const result = await getStreamUrl({
      api,
      item: { Id: "item-1" },
      userId: "user-1",
      startTimeTicks: 0,
      deviceProfile: {},
    });

    expect(result?.url).toBe(remoteUrl);
    expect(result?.requiredHttpHeaders).toEqual(headers);
  });
});

describe("getDownloadStreamUrl", () => {
  const MAX = { key: "Max", value: undefined };
  const LIMITED = { key: "4mbps", value: 4_000_000 };

  const download = async (
    api: ReturnType<typeof makeApi>,
    quality: { key: string; value: number | undefined },
  ) => {
    const result = await getDownloadStreamUrl({
      api,
      item: { Id: "item-1", Type: "Movie" },
      userId: "user-1",
      mediaSourceId: "media-1",
      maxStreamingBitrate: quality.value,
      audioStreamIndex: 0,
      subtitleStreamIndex: 0,
    });
    return new URL(result!.url!);
  };

  test("returns null when the server offers no media source", async () => {
    const api = makeApi();
    api.mock
      .onPost(
        "https://jellyfin.example.com/Items/item-1/PlaybackInfo",
        bodyContaining({ DeviceProfile: { Name: "1. MPV Download" } }),
      )
      .reply(200, { PlaySessionId: "session-1", MediaSources: [] });

    const result = await getDownloadStreamUrl({
      api,
      item: { Id: "item-1", Type: "Movie" },
      userId: "user-1",
      audioStreamIndex: 0,
      subtitleStreamIndex: -1,
    });

    expect(result).toBeNull();
  });

  test("SDK download URLs preserve base paths, the media source ID and encoded access tokens without fetching the file", async () => {
    const api = makeApi();
    api.update({
      basePath: `${api.basePath}/jellyfin`,
      accessToken: "TOKEN /+&?",
    });
    api.mock.onPost(`${api.basePath}/Items/item-1/PlaybackInfo`).reply(200, {
      PlaySessionId: "download-session",
      MediaSources: [{ Id: "alternate-media" }],
    });

    const result = await getDownloadStreamUrl({
      api,
      item: { Id: "item-1", Type: "Movie" },
      userId: "user-1",
      mediaSourceId: "alternate-media",
      audioStreamIndex: 2,
      subtitleStreamIndex: -1,
    });

    const url = new URL(result!.url!);
    expect(url.pathname).toBe("/jellyfin/Items/alternate-media/Download");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ApiKey: "TOKEN /+&?",
    });
    expect(result?.sessionId).toBe("download-session");
    expect(result?.mediaSource?.Id).toBe("alternate-media");
    expect(JSON.parse(api.mock.history.post[0].data)).toMatchObject({
      UserId: "user-1",
      MediaSourceId: "alternate-media",
      AudioStreamIndex: 2,
      SubtitleStreamIndex: -1,
      StartTimeTicks: 0,
      AutoOpenLiveStream: true,
      isPlayback: true,
    });
    expect(api.mock.history).toHaveLength(1);
  });

  describe("the server says the player can play the original (no TranscodingUrl)", () => {
    const playerCanPlayTheOriginal = {
      PlaySessionId: "session-1",
      MediaSources: [{ Id: "media-1" }],
    };

    test("downloads the original file when the user picks Max quality", async () => {
      const api = makeApi();
      api.mock
        .onPost(
          "https://jellyfin.example.com/Items/item-1/PlaybackInfo",
          bodyContaining({ DeviceProfile: { Name: "1. MPV Download" } }),
        )
        .reply(200, playerCanPlayTheOriginal);

      const url = await download(api, MAX);

      expect(url.pathname).toBe("/Items/media-1/Download");
    });

    test("downloads the original file when the source already fits under the user's limited quality", async () => {
      const api = makeApi();
      api.mock
        .onPost(
          "https://jellyfin.example.com/Items/item-1/PlaybackInfo",
          bodyContaining({
            DeviceProfile: { Name: "1. MPV Download" },
            MaxStreamingBitrate: 4_000_000,
          }),
        )
        .reply(200, playerCanPlayTheOriginal);

      const url = await download(api, LIMITED);

      expect(url.pathname).toBe("/Items/media-1/Download");
    });

    test("imposes no bitrate cap of its own when the user picks Max quality", async () => {
      const api = makeApi();
      api.mock
        .onPost(
          "https://jellyfin.example.com/Items/item-1/PlaybackInfo",
          bodyContaining({ DeviceProfile: { Name: "1. MPV Download" } }),
        )
        .reply(200, playerCanPlayTheOriginal);

      await download(api, MAX);

      const negotiatedCaps = api.mock.history.post.map((request) => {
        const profile = JSON.parse(request.data).DeviceProfile;
        return {
          MaxStreamingBitrate: profile.MaxStreamingBitrate,
          MaxStaticBitrate: profile.MaxStaticBitrate,
        };
      });
      expect(negotiatedCaps).toEqual([
        { MaxStreamingBitrate: 999_999_999, MaxStaticBitrate: 999_999_999 },
      ]);
    });

    test("authenticates the URL with the ApiKey query parameter", async () => {
      const api = makeApi();
      api.mock
        .onPost(
          "https://jellyfin.example.com/Items/item-1/PlaybackInfo",
          bodyContaining({ DeviceProfile: { Name: "1. MPV Download" } }),
        )
        .reply(200, playerCanPlayTheOriginal);

      const url = await download(api, MAX);

      expect(url.searchParams.get("ApiKey")).toBe("SECRET_TOKEN");
    });
  });

  describe("the server says the original needs transcoding (TranscodingUrl present)", () => {
    const downloadGetsAProgressiveMp4 = {
      PlaySessionId: "session-1",
      MediaSources: [
        {
          Id: "media-1",
          TranscodingUrl:
            "/videos/media-1/stream.mp4?DeviceId=device-1&PlaySessionId=session-1",
        },
      ],
    };

    test("downloads the progressive mp4 when the source exceeds the user's limited quality", async () => {
      const api = makeApi();
      api.mock
        .onPost(
          "https://jellyfin.example.com/Items/item-1/PlaybackInfo",
          bodyContaining({
            DeviceProfile: { Name: "1. MPV Download" },
            MaxStreamingBitrate: 4_000_000,
          }),
        )
        .reply(200, downloadGetsAProgressiveMp4);

      const url = await download(api, LIMITED);

      expect(url.href).toBe(
        "https://jellyfin.example.com/videos/media-1/stream.mp4?DeviceId=device-1&PlaySessionId=session-1",
      );
    });

    test("downloads the TranscodingUrl exactly as the server sent it, even when the user picks no subtitle (streaming rewrites SubtitleMethod, downloads must not)", async () => {
      const api = makeApi();
      api.mock
        .onPost(
          "https://jellyfin.example.com/Items/item-1/PlaybackInfo",
          bodyContaining({ DeviceProfile: { Name: "1. MPV Download" } }),
        )
        .reply(200, {
          PlaySessionId: "session-1",
          MediaSources: [
            {
              Id: "media-1",
              TranscodingUrl:
                "/videos/media-1/stream.mp4?DeviceId=device-1&SubtitleMethod=Encode&PlaySessionId=session-1",
            },
          ],
        });

      const result = await getDownloadStreamUrl({
        api,
        item: { Id: "item-1", Type: "Movie" },
        userId: "user-1",
        mediaSourceId: "media-1",
        audioStreamIndex: 0,
        subtitleStreamIndex: -1,
      });

      expect(result?.url).toBe(
        "https://jellyfin.example.com/videos/media-1/stream.mp4?DeviceId=device-1&SubtitleMethod=Encode&PlaySessionId=session-1",
      );
    });

    test("downloads the progressive mp4 even when the user picks Max quality (transcode forced by burn-in, codecs or server policy)", async () => {
      const api = makeApi();
      api.mock
        .onPost(
          "https://jellyfin.example.com/Items/item-1/PlaybackInfo",
          bodyContaining({ DeviceProfile: { Name: "1. MPV Download" } }),
        )
        .reply(200, downloadGetsAProgressiveMp4);

      const url = await download(api, MAX);

      expect(url.href).toBe(
        "https://jellyfin.example.com/videos/media-1/stream.mp4?DeviceId=device-1&PlaySessionId=session-1",
      );
    });
  });
});
