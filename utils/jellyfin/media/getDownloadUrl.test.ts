import { describe, expect, mock, test } from "bun:test";

// Stub modules that pull in React Native — bun:test cannot load it.
mock.module("react-native", () => ({
  Platform: {
    OS: "ios",
    isTV: false,
    select: (spec: Record<string, unknown>) => spec.ios ?? spec.default,
  },
}));
// Only the `Bitrate` type is imported from this component module.
mock.module("@/components/BitrateSelector", () => ({}));

const { getDownloadUrl } = await import("./getDownloadUrl");
const { makeApi } = await import("@/test-utils/jellyfinApi");

describe("getDownloadUrl", () => {
  test("direct download URL authenticates with ApiKey", async () => {
    // The native background downloader cannot send Authorization headers,
    // so this URL must carry (non-legacy) query auth.
    const api = makeApi({
      PlaySessionId: "session-1",
      MediaSources: [{ Id: "media-1" }],
    });

    const result = await getDownloadUrl({
      api,
      item: { Id: "item-1", Type: "Movie" },
      userId: "user-1",
      mediaSource: { Id: "media-1" },
      maxBitrate: { key: "Max", value: undefined },
      audioStreamIndex: 0,
      subtitleStreamIndex: -1,
      deviceId: "device-1",
    });

    expect(result?.url).toBeTruthy();
    const url = new URL(result!.url!);
    expect(url.pathname).toBe("/Items/media-1/Download");
    expect(url.searchParams.get("ApiKey")).toBe("SECRET_TOKEN");
  });
});
