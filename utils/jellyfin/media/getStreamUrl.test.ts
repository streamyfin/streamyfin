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

const { getStreamUrl } = await import("./getStreamUrl");
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
  });
});
