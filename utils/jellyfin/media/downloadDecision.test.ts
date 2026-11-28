import { makeApi } from "@/test-utils/jellyfinApi";
import { getDownloadDecision } from "./downloadDecision";
import {
  type DownloadRequestParams,
  getDownloadStreamUrl,
} from "./getStreamUrl";

const PLAYBACK_INFO = "https://jellyfin.example.com/Items/item-1/PlaybackInfo";

const paramsFor = (api: ReturnType<typeof makeApi>): DownloadRequestParams => ({
  api,
  item: { Id: "item-1", Type: "Movie" },
  userId: "user-1",
  mediaSourceId: "media-1",
  audioStreamIndex: 1,
  subtitleStreamIndex: 3,
  maxStreamingBitrate: 4_000_000,
  audioMode: "stereo",
});

describe("getDownloadDecision", () => {
  // The preview is only worth showing if it is the download's own answer.
  it("sends the download's own PlaybackInfo request", async () => {
    const api = makeApi();
    api.mock
      .onPost(PLAYBACK_INFO)
      .reply(200, { MediaSources: [{ Id: "media-1" }] });

    await getDownloadStreamUrl(paramsFor(api));
    await getDownloadDecision(paramsFor(api));

    expect(api.mock.history.post).toHaveLength(2);
    expect(api.mock.history.post[1].data).toBe(api.mock.history.post[0].data);
  });

  it("is direct when the server offers the original file", async () => {
    const api = makeApi();
    api.mock
      .onPost(PLAYBACK_INFO)
      .reply(200, { MediaSources: [{ Id: "media-1" }] });

    await expect(getDownloadDecision(paramsFor(api))).resolves.toEqual({
      kind: "direct",
    });
  });

  it("is a transcode with the server's reasons", async () => {
    const api = makeApi();
    api.mock.onPost(PLAYBACK_INFO).reply(200, {
      MediaSources: [
        {
          Id: "media-1",
          TranscodingUrl:
            "/videos/item-1/master.m3u8?TranscodeReasons=AudioCodecNotSupported,SubtitleCodecNotSupported",
        },
      ],
    });

    await expect(getDownloadDecision(paramsFor(api))).resolves.toEqual({
      kind: "transcode",
      reasons: ["AudioCodecNotSupported", "SubtitleCodecNotSupported"],
    });
  });

  it("rejects when the server offers no source", async () => {
    const api = makeApi();
    api.mock.onPost(PLAYBACK_INFO).reply(200, { MediaSources: [] });

    await expect(getDownloadDecision(paramsFor(api))).rejects.toThrow();
  });
});
