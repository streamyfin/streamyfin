import { stubReactNative } from "@/test-utils/reactNative";

// Stub react-native at the module boundary — pulled in transitively via the
// track player device profile.
stubReactNative();
jest.mock("expo", () => ({
  // codecSupport probes the native MPV module, which no test environment has.
  requireOptionalNativeModule: () => null,
}));

import { makeApi } from "@/test-utils/jellyfinApi";
import { getAudioStreamUrl } from "./getAudioStreamUrl";

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
