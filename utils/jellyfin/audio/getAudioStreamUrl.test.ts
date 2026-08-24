import { describe, expect, mock, test } from "bun:test";

// Stub react-native at the module boundary — pulled in transitively via the
// track player device profile. bun:test cannot load React Native itself.
mock.module("react-native", () => ({
  Platform: {
    OS: "ios",
    isTV: false,
    select: (spec: Record<string, unknown>) => spec.ios ?? spec.default,
  },
}));
mock.module("expo", () => ({
  // codecSupport probes the native MPV module; under bun:test there is none.
  requireOptionalNativeModule: () => null,
}));

const { getAudioStreamUrl } = await import("./getAudioStreamUrl");
const { makeApi } = await import("@/test-utils/jellyfinApi");

describe("getAudioStreamUrl", () => {
  test("direct stream URL authenticates with ApiKey", async () => {
    const api = makeApi({
      PlaySessionId: "session-1",
      MediaSources: [{ Id: "media-1", Container: "flac" }],
    });

    const result = await getAudioStreamUrl(api, "user-1", "item-1");

    const url = new URL(result!.url);
    expect(url.searchParams.get("ApiKey")).toBe("SECRET_TOKEN");
  });
});
