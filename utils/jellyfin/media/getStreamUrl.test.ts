import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative();
jest.mock("expo", () => ({
  // codecSupport probes the native MPV module, which no test environment has.
  requireOptionalNativeModule: () => null,
}));

import type { DownloadMode } from "@/constants/Downloads";
import { bodyContaining, makeApi } from "@/test-utils/jellyfinApi";
import { isExpectedError } from "@/utils/errors";
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

  // #1693: Live TV loaded forever. Without the opened live stream's id,
  // Jellyfin answers the direct play request with a 400.
  test("live TV direct play URL carries the opened live stream", async () => {
    const api = makeApi();
    api.mock.onPost(/\/Items\/channel-1\/PlaybackInfo/).reply(200, {
      PlaySessionId: "session-1",
      MediaSources: [
        { Id: "native-1", Container: "ts", LiveStreamId: "live-1" },
      ],
    });

    const result = await getStreamUrl({
      api,
      item: { Id: "program-1", Type: "Program", ChannelId: "channel-1" },
      userId: "user-1",
      startTimeTicks: 0,
      deviceProfile: {},
    });

    const url = new URL(result!.url!);
    expect(url.pathname).toBe("/Videos/channel-1/stream");
    expect(url.searchParams.get("liveStreamId")).toBe("live-1");
    expect(url.searchParams.get("playSessionId")).toBe("session-1");
  });

  // #1693 again, from the TV channel grid: it opens a channel itself, not one
  // of its programs, so its stream is opened by the general PlaybackInfo
  // request.
  test("a channel opened directly carries its opened live stream too", async () => {
    const api = makeApi();
    api.mock.onPost(/\/Items\/channel-1\/PlaybackInfo/).reply(200, {
      PlaySessionId: "session-1",
      MediaSources: [
        { Id: "native-1", Container: "ts", LiveStreamId: "live-1" },
      ],
    });

    const result = await getStreamUrl({
      api,
      item: { Id: "channel-1", Type: "TvChannel" },
      userId: "user-1",
      startTimeTicks: 0,
      deviceProfile: {},
    });

    const url = new URL(result!.url!);
    expect(url.pathname).toBe("/Videos/channel-1/stream");
    expect(url.searchParams.get("liveStreamId")).toBe("live-1");
  });

  // REACT-NATIVE-54 / REACT-NATIVE-5H: Jellyfin answers PlaybackInfo with a
  // 400 for an item that has no stream. Seen in production for a Book opened
  // from a home row (Android) and for a Season opened on Apple TV, each one
  // a Sentry event although nothing in the app had failed.
  test.each(["Book", "Season"] as const)(
    "refuses a %s as an expected outcome, without asking the server",
    async (type) => {
      const api = makeApi();
      api.mock
        .onPost("https://jellyfin.example.com/Items/item-1/PlaybackInfo")
        .reply(400);

      const error = await getStreamUrl({
        api,
        item: { Id: "item-1", Type: type },
        userId: "user-1",
        startTimeTicks: 0,
        deviceProfile: {},
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(isExpectedError(error)).toBe(true);
      expect(api.mock.history.post).toHaveLength(0);
    },
  );
});

describe("getDownloadStreamUrl", () => {
  const MAX = { key: "Max", value: undefined };
  const LIMITED = { key: "4mbps", value: 4_000_000 };

  const download = async (
    api: ReturnType<typeof makeApi>,
    quality: { key: string; value: number | undefined },
    mode: DownloadMode = "transcode",
  ) => {
    const result = await getDownloadStreamUrl({
      api,
      item: { Id: "item-1", Type: "Movie" },
      userId: "user-1",
      mediaSourceId: "media-1",
      maxStreamingBitrate: quality.value,
      audioStreamIndex: 0,
      subtitleStreamIndex: 0,
      mode,
    });
    return new URL(result!.url!);
  };

  describe("an original download", () => {
    const serverWouldTranscode = {
      PlaySessionId: "session-1",
      MediaSources: [
        {
          Id: "media-1",
          TranscodingUrl: "/videos/media-1/stream.mp4?PlaySessionId=session-1",
          MediaStreams: [
            { Index: 0, Type: "Video" },
            { Index: 1, Type: "Subtitle", DeliveryMethod: "Encode" },
            { Index: 2, Type: "Subtitle", DeliveryMethod: "External" },
          ],
        },
      ],
    };

    test("downloads the file itself even when the server would transcode it", async () => {
      const api = makeApi();
      api.mock
        .onPost("https://jellyfin.example.com/Items/item-1/PlaybackInfo")
        .reply(200, serverWouldTranscode);

      const url = await download(api, MAX, "original");

      expect(url.pathname).toBe("/Items/media-1/Download");
    });

    // The offline player reads a transcoding URL as a transcoded file, with one
    // audio track and an image subtitle burned in. The file has all of them.
    test("keeps the downloaded source free of the transcode it did not use", async () => {
      const api = makeApi();
      api.mock
        .onPost("https://jellyfin.example.com/Items/item-1/PlaybackInfo")
        .reply(200, serverWouldTranscode);

      const result = await getDownloadStreamUrl({
        api,
        item: { Id: "item-1", Type: "Movie" },
        userId: "user-1",
        mediaSourceId: "media-1",
        subtitleStreamIndex: 1,
        mode: "original",
      });

      expect(result?.mediaSource?.TranscodingUrl).toBeFalsy();
      expect(
        result?.mediaSource?.MediaStreams?.map((s) => s.DeliveryMethod),
      ).toEqual([undefined, "Embed", "External"]);
    });

    test("leaves direct play to the server", async () => {
      const api = makeApi();
      api.mock
        .onPost("https://jellyfin.example.com/Items/item-1/PlaybackInfo")
        .reply(200, serverWouldTranscode);

      await download(api, MAX, "original");

      const body = JSON.parse(api.mock.history.post[0].data);
      expect(body.EnableDirectPlay).toBeUndefined();
      expect(body.EnableDirectStream).toBeUndefined();
    });
  });

  test("a transcoded download asks the server to transcode even a file it could send as it is", async () => {
    const api = makeApi();
    api.mock
      .onPost(
        "https://jellyfin.example.com/Items/item-1/PlaybackInfo",
        bodyContaining({ EnableDirectPlay: false, EnableDirectStream: false }),
      )
      .reply(200, {
        PlaySessionId: "session-1",
        MediaSources: [
          {
            Id: "media-1",
            TranscodingUrl:
              "/videos/media-1/stream.mp4?PlaySessionId=session-1",
          },
        ],
      });

    const url = await download(api, MAX, "transcode");

    expect(url.pathname).toBe("/videos/media-1/stream.mp4");
  });

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
      mode: "original",
    });

    expect(result).toBeNull();
  });

  describe("the server says the player can play the original (no TranscodingUrl)", () => {
    const playerCanPlayTheOriginal = {
      PlaySessionId: "session-1",
      MediaSources: [{ Id: "media-1" }],
    };

    // The download profile marks every image subtitle Encode, which offline
    // reads as burned in: none of the file's own image tracks could be picked.
    test("keeps the file's image subtitles as tracks when a transcode gets the file itself", async () => {
      const api = makeApi();
      api.mock
        .onPost("https://jellyfin.example.com/Items/item-1/PlaybackInfo")
        .reply(200, {
          PlaySessionId: "session-1",
          MediaSources: [
            {
              Id: "media-1",
              MediaStreams: [
                { Index: 1, Type: "Subtitle", DeliveryMethod: "Encode" },
              ],
            },
          ],
        });

      const result = await getDownloadStreamUrl({
        api,
        item: { Id: "item-1", Type: "Movie" },
        userId: "user-1",
        mediaSourceId: "media-1",
        mode: "transcode",
      });

      expect(new URL(result!.url!).pathname).toBe("/Items/media-1/Download");
      expect(result?.mediaSource?.MediaStreams?.[0].DeliveryMethod).toBe(
        "Embed",
      );
    });

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
        mode: "transcode",
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

describe("getDownloadStreamUrl, burning in a subtitle", () => {
  const transcodeWith = (subtitleDelivery: string) => ({
    PlaySessionId: "session-1",
    MediaSources: [
      {
        Id: "media-1",
        TranscodingUrl: "/videos/media-1/stream.mp4?PlaySessionId=session-1",
        MediaStreams: [
          { Index: 0, Type: "Video" },
          { Index: 2, Type: "Subtitle", DeliveryMethod: subtitleDelivery },
          { Index: 3, Type: "Subtitle", DeliveryMethod: "External" },
        ],
      },
    ],
  });

  const transcodeAskingFor = async (
    response: ReturnType<typeof transcodeWith>,
    subtitleStreamIndex: number,
  ) => {
    const api = makeApi();
    api.mock
      .onPost("https://jellyfin.example.com/Items/item-1/PlaybackInfo")
      .reply(200, response);
    return getDownloadStreamUrl({
      api,
      item: { Id: "item-1", Type: "Movie" },
      userId: "user-1",
      mediaSourceId: "media-1",
      subtitleStreamIndex,
      mode: "transcode",
    });
  };

  // The server sends a text subtitle as a file of its own; a player that
  // reads no sidecar files needs it in the picture.
  test("burns in a text subtitle the server would send as a file", async () => {
    const result = await transcodeAskingFor(transcodeWith("External"), 2);

    const url = new URL(result!.url!);
    expect(url.searchParams.get("SubtitleStreamIndex")).toBe("2");
    expect(url.searchParams.get("SubtitleMethod")).toBe("Encode");
    expect(url.searchParams.get("PlaySessionId")).toBe("session-1");
  });

  test("marks only the burned-in text subtitle, so the others still come down as files", async () => {
    const result = await transcodeAskingFor(transcodeWith("External"), 2);

    expect(
      result?.mediaSource?.MediaStreams?.map((s) => s.DeliveryMethod),
    ).toEqual([undefined, "Encode", "External"]);
  });

  test("leaves an image subtitle the server already burns in as it sent it", async () => {
    const result = await transcodeAskingFor(transcodeWith("Encode"), 2);

    expect(result?.url).toBe(
      "https://jellyfin.example.com/videos/media-1/stream.mp4?PlaySessionId=session-1",
    );
  });
});
