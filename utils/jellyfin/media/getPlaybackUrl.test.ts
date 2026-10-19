import { makeApi } from "@/test-utils/jellyfinApi";
import { getPlaybackUrl } from "./getPlaybackUrl";

describe("getPlaybackUrl", () => {
  test("fallback stream URL authenticates with ApiKey", async () => {
    const api = makeApi({
      MediaSources: [{ Id: "media-1", ETag: "etag-1" }],
    });

    const url = await getPlaybackUrl(api, "item-1", "user-1");

    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("ApiKey")).toBe("SECRET_TOKEN");
  });

  test("prefers the server-provided TranscodingUrl untouched", async () => {
    const api = makeApi({
      MediaSources: [
        { Id: "media-1", TranscodingUrl: "/videos/media-1/master.m3u8?x=1" },
      ],
    });

    const url = await getPlaybackUrl(api, "item-1", "user-1");

    expect(url).toBe("/videos/media-1/master.m3u8?x=1");
  });
});
