import { redactCredentials } from "./redactCredentials";

describe("redactCredentials", () => {
  test("redacts the token in an external subtitle title from the native player", () => {
    // The line the iOS player logs for every external subtitle: mpv names the
    // track after the URL's last segment, query string included. The value
    // runs to the next space, so the comma after the token goes with it.
    expect(
      redactCredentials(
        "getSubtitleTracks: found sub track id=2, title=Stream.subrip?ApiKey=0123456789abcdef0123456789abcdef, lang=none, external=true",
      ),
    ).toBe(
      "getSubtitleTracks: found sub track id=2, title=Stream.subrip?ApiKey=[redacted] lang=none, external=true",
    );
  });

  test.each([
    "api_key",
    "ApiKey",
    "X-Emby-Token",
    "access_token",
    "token",
    "UserId",
    "DeviceId",
  ])("redacts %s and keeps the other parameters", (param) => {
    expect(
      redactCredentials(
        `/Videos/1/stream?static=true&${param}=secret123&MediaSourceId=abc`,
      ),
    ).toBe(
      `/Videos/1/stream?static=true&${param}=[redacted]&MediaSourceId=abc`,
    );
  });

  // The server address can carry a proxy's basic auth, and every URL built on
  // it with it.
  test.each([
    [
      "https://user:secret@proxy.example.com/Videos/1/stream?static=true",
      "https://[redacted]@proxy.example.com/Videos/1/stream?static=true",
    ],
    [
      "http://john@gmail.com:S3cret@iptv.example:8080/live/1.ts",
      "http://[redacted]@iptv.example:8080/live/1.ts",
    ],
    ["https://:secret@host.example/x", "https://[redacted]@host.example/x"],
    ["https://token@host.example/x", "https://[redacted]@host.example/x"],
  ])("redacts the userinfo of %s", (url, redacted) => {
    expect(redactCredentials(`load failed: ${url} (timeout)`)).toBe(
      `load failed: ${redacted} (timeout)`,
    );
  });

  test("leaves an @ outside a URL's authority alone", () => {
    const text =
      "mail user@example.com about https://host.example/path@1?q=a@b";

    expect(redactCredentials(text)).toBe(text);
  });

  test("leaves text without credential parameters untouched", () => {
    const text =
      "/Videos/1/master.m3u8?MediaSourceId=abc&VideoCodec=av1,h264&SegmentContainer=mp4";

    expect(redactCredentials(text)).toBe(text);
  });
});
