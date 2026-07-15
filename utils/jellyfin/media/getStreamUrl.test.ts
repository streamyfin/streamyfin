import { describe, expect, mock, test } from "bun:test";

// Stub react-native at the module boundary — pulled in transitively via the
// download device profiles. bun:test cannot load React Native itself.
mock.module("react-native", () => ({
  Platform: {
    OS: "ios",
    isTV: false,
    select: (spec: Record<string, unknown>) => spec.ios ?? spec.default,
  },
}));

const { getStreamUrl, getDownloadStreamUrl } = await import("./getStreamUrl");
const { makeApi } = await import("@/test-utils/jellyfinApi");

describe("getStreamUrl", () => {
  test("direct play URL authenticates with ApiKey", async () => {
    const api = makeApi({
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

    expect(result?.url).toBeTruthy();
    const url = new URL(result!.url!);
    expect(url.searchParams.get("ApiKey")).toBe("SECRET_TOKEN");
    // Direct play streams the source file as-is, so the URL carries the
    // source container reported by the server
    expect(url.searchParams.get("container")).toBe("mkv");
  });
});

describe("getDownloadStreamUrl", () => {
  test("returns the server-provided progressive TranscodingUrl untouched", async () => {
    // With the download profile requesting Protocol "http", the server
    // already answers with the ready-to-download /stream.ts URL.
    const transcodingUrl =
      "/videos/item-1/stream.ts?DeviceId=device-1&VideoCodec=h264,hevc&PlaySessionId=session-1";
    const api = makeApi({
      PlaySessionId: "session-1",
      MediaSources: [{ Id: "media-1", TranscodingUrl: transcodingUrl }],
    });

    const result = await getDownloadStreamUrl({
      api,
      item: { Id: "item-1", Type: "Movie" },
      userId: "user-1",
      maxStreamingBitrate: 3_000_000,
      audioStreamIndex: 0,
      subtitleStreamIndex: -1,
      deviceId: "device-1",
    });

    expect(result?.url).toBe(`https://jellyfin.example.com${transcodingUrl}`);
    expect(result?.sessionId).toBe("session-1");
  });

  test("requests an mp4 stream when the server offers no TranscodingUrl", async () => {
    const api = makeApi({
      PlaySessionId: "session-1",
      MediaSources: [{ Id: "media-1" }],
    });

    const result = await getDownloadStreamUrl({
      api,
      item: { Id: "item-1", Type: "Movie" },
      userId: "user-1",
      maxStreamingBitrate: 3_000_000,
      audioStreamIndex: 0,
      subtitleStreamIndex: -1,
      deviceId: "device-1",
    });

    const url = new URL(result!.url!);
    expect(url.searchParams.get("container")).toBe("mp4");
    expect(url.searchParams.get("static")).toBe("false");
  });
});
